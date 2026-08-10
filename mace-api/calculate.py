"""
Shared MACE calculation engine.

Contains all scientific logic for running MACE calculations (single-point,
geometry optimization, molecular dynamics). Both the CLI wrapper
(calculate_local.py) and the FastAPI server (main.py) call into this module.
"""

import logging
import time
from contextlib import contextmanager
from pathlib import Path

import provenance

# Calculation types that have a real implementation below. This is the
# security boundary: the API can be POSTed to directly, so the frontend check
# is not sufficient. Anything outside this set MUST fail loudly — silently
# falling back to a single-point run would return a plausible-looking energy
# for a calculation that never happened.
SUPPORTED_CALCULATION_TYPES = ("single-point", "geometry-opt", "molecular-dynamics")

# Model families that have a real loader in get_mace_calculator(). Same
# security-boundary reasoning as SUPPORTED_CALCULATION_TYPES, applied to the
# model instead of the calculation: an unrecognised modelType that falls
# through to mace_mp() returns MACE-MP-0 numbers under another model's name,
# and those numbers are shareable via MACE Link and exportable to PDF.
SUPPORTED_MODEL_TYPES = ("MACE-MP-0", "MACE-OFF", "MACE-OFF23", "custom")

# modelType values that map to upstream's mace_off() loader.
MACE_OFF_MODEL_TYPES = ("MACE-OFF", "MACE-OFF23")

# Floating-point precisions MACE accepts as `default_dtype`.
SUPPORTED_PRECISIONS = ("float32", "float64")

# Types the UI/type system knows about but the backend cannot compute.
# Rejecting these honestly is the correct behaviour; a stub returning numbers
# would be worse than an error.
_UNIMPLEMENTED_HINTS = {
    "phonon": (
        "Phonon/vibrational analysis is not implemented in SimpleAtom. "
        "It must be run through an external workflow on a fully converged geometry."
    ),
}

# Default RNG seed for molecular dynamics. MD draws initial velocities from a
# Maxwell-Boltzmann distribution and the Langevin thermostat applies random
# forces at every step; without a seed no trajectory can ever be reproduced,
# including one a user shares via MACE Link. Fixed by default so results are
# verifiable; override with params["seed"] to generate independent replicas.
# (Matches the seeding convention in smiles_to_xyz.py.)
DEFAULT_MD_SEED = 42


def resolve_seed(raw) -> int:
    """Normalise and validate an RNG seed. Missing/empty -> DEFAULT_MD_SEED."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return DEFAULT_MD_SEED
    if isinstance(raw, bool):  # bool is an int subclass — reject explicitly
        raise ValueError("Invalid seed: expected a non-negative integer, got a boolean.")
    try:
        seed = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid seed: expected a non-negative integer, got {raw!r}.")
    if seed < 0:
        raise ValueError(f"Invalid seed: must be non-negative, got {seed}.")
    return seed


def validate_calculation_type(raw) -> str:
    """
    Normalise and validate the requested calculation type.

    A missing/empty value defaults to "single-point" (the documented default).
    Any value that is present but not implemented raises ValueError rather
    than quietly running something else.
    """
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return "single-point"

    if not isinstance(raw, str):
        raise ValueError(
            f"Invalid calculationType: expected a string, got {type(raw).__name__}. "
            f"Supported types: {', '.join(SUPPORTED_CALCULATION_TYPES)}."
        )

    calc_type = raw.strip()
    if calc_type in SUPPORTED_CALCULATION_TYPES:
        return calc_type

    msg = (
        f"Unsupported calculationType '{calc_type}'. "
        f"Supported types: {', '.join(SUPPORTED_CALCULATION_TYPES)}."
    )
    hint = _UNIMPLEMENTED_HINTS.get(calc_type.lower())
    if hint:
        msg = f"{msg} {hint}"
    raise ValueError(msg)


def validate_model_type(raw, has_model_path: bool) -> str:
    """
    Normalise and validate the requested model type.

    Mirrors validate_calculation_type(): a value that is present but not
    recognised raises rather than quietly loading a different model. A missing
    value defaults to "custom" when a checkpoint was uploaded and to
    "MACE-MP-0" otherwise (the documented default).

    "custom" with no uploaded checkpoint is rejected explicitly. That request
    used to fall through to mace_mp() and return MACE-MP-0 *medium* energies
    and forces with result["params"]["modelType"] == "custom" — numbers
    permanently attributed to a model that was never loaded.
    """
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return "custom" if has_model_path else "MACE-MP-0"

    if not isinstance(raw, str):
        raise ValueError(
            f"Invalid modelType: expected a string, got {type(raw).__name__}. "
            f"Supported models: {', '.join(SUPPORTED_MODEL_TYPES)}."
        )

    model_type = raw.strip()
    if model_type not in SUPPORTED_MODEL_TYPES:
        raise ValueError(
            f"Unsupported modelType '{model_type}'. "
            f"Supported models: {', '.join(SUPPORTED_MODEL_TYPES)}."
        )

    if model_type == "custom" and not has_model_path:
        raise ValueError(
            "modelType 'custom' requires an uploaded MACE .model checkpoint, but "
            "no model file was supplied. Upload the checkpoint, or select "
            "MACE-MP-0 or MACE-OFF. Running a foundation model and labelling the "
            "result 'custom' would attribute the numbers to a model that was "
            "never loaded."
        )

    return model_type


def upstream_default_precision(model_type: str, calc_type: str) -> str:
    """
    The dtype upstream would have used, when the request does not pin one.

    Two facts from ACEsuit/mace (read at v0.3.16, confirmed against the
    installed 0.3.15):

    * `mace_off()` defaults to ``default_dtype="float64"``
      (foundations_models.py:209), unlike `mace_mp()`'s ``"float32"``. That
      difference is deliberate and has held since v0.3.6. Defaulting MACE-OFF
      to float32 inverts it.
    * Both wrappers print, at construction, on every run:
      "Using float32 for MACECalculator, which is faster but less accurate.
      Recommended for MD. Use float64 for geometry optimization."
      That recommendation is about geometry optimisation — which SimpleAtom
      implements — not about phonons, which it rejects.

    An explicit request is still honoured: upstream honours whatever
    `default_dtype` it is handed. When the effective value ends up below this
    recommendation, run_calculation() records a warning on the result rather
    than silently overriding the caller.
    """
    if model_type in MACE_OFF_MODEL_TYPES:
        return "float64"
    if calc_type == "geometry-opt":
        return "float64"
    return "float32"


def resolve_precision(raw, model_type: str, calc_type: str) -> tuple[str, bool]:
    """
    Normalise and validate the requested precision.

    Returns (precision, was_explicitly_requested). A missing/empty value takes
    upstream's default for this model family and calculation type.
    """
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return upstream_default_precision(model_type, calc_type), False

    if not isinstance(raw, str):
        raise ValueError(
            f"Invalid precision: expected a string, got {type(raw).__name__}. "
            f"Supported precisions: {', '.join(SUPPORTED_PRECISIONS)}."
        )

    precision = raw.strip()
    if precision not in SUPPORTED_PRECISIONS:
        raise ValueError(
            f"Unsupported precision '{precision}'. "
            f"Supported precisions: {', '.join(SUPPORTED_PRECISIONS)}."
        )
    return precision, True


class _WarningCollector(logging.Handler):
    """Collects log records instead of printing them."""

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record):
        try:
            self.messages.append(record.getMessage())
        except Exception:  # pragma: no cover — never let logging break a run
            pass


@contextmanager
def capture_model_warnings():
    """
    Collect the warnings upstream emits while a calculator is being built.

    `MACECalculator` does not refuse a dtype mismatch — it converts the
    checkpoint with `model.float()` / `model.double()` and emits
    "Default dtype ... does not match model dtype ..., converting models to ..."
    through `logging.warning` (mace/calculators/mace.py:299-306). SimpleAtom
    used to run under `logging.disable(logging.CRITICAL)`, which made that
    conversion invisible. The records are now attached to the result.
    """
    collector = _WarningCollector()
    root = logging.getLogger()
    root.addHandler(collector)
    lowered = root.level > logging.WARNING
    if lowered:
        previous_level = root.level
        root.setLevel(logging.WARNING)
    try:
        yield collector
    finally:
        root.removeHandler(collector)
        if lowered:
            root.setLevel(previous_level)


def detect_calculator_dtype(calc) -> str | None:
    """
    Report the dtype the loaded model is actually running in.

    Required for the custom-checkpoint path, which deliberately does not pass
    `default_dtype` to `MACECalculator`; upstream then adopts the checkpoint's
    own dtype (mace/calculators/mace.py:293-298). Echoing the requested
    precision there would describe something that never happened.

    Returns None if the dtype cannot be determined (e.g. a calculator shape
    this function does not know how to walk).
    """
    candidates = [calc]
    mixer = getattr(calc, "mixer", None)
    if mixer is not None and hasattr(mixer, "calcs"):
        candidates.extend(mixer.calcs)
    elif hasattr(calc, "calcs"):
        candidates.extend(calc.calcs)

    for candidate in candidates:
        models = getattr(candidate, "models", None)
        if not models:
            continue
        try:
            for param in models[0].parameters():
                return str(param.dtype).rsplit(".", 1)[-1]
        except Exception:
            continue
    return None


def require_dispersion_backend() -> None:
    """
    Fail early, and by name, when D3 was asked for but its backend is missing.

    `mace_mp(dispersion=True)` builds a `TorchDFTD3Calculator`, which lives in
    the separate `torch-dftd` distribution — it is not a dependency of
    mace-torch. Upstream raises
    "Please install torch-dftd to use dispersion corrections"
    (foundations_models.py:176-180), but only *after* the MACE checkpoint has
    been downloaded and loaded, and the message names neither the requested
    option nor the fact that the rest of the run was thrown away.

    `torch-dftd` is now in requirements.txt, so a deployment built from it has
    the backend. This guard is for the environment that was built before that
    line existed: it turns a late RuntimeError from inside a third-party
    package into an immediate, actionable error.
    """
    try:
        import torch_dftd.torch_dftd3_calculator  # noqa: F401
    except Exception as exc:
        raise ValueError(
            "D3 dispersion was requested but the torch-dftd package is not "
            f"installed in this environment ({type(exc).__name__}: {exc}). "
            "D3 corrections come from torch-dftd, which is a separate "
            "distribution from mace-torch. Install it "
            "(`pip install torch-dftd`, or rebuild from mace-api/"
            "requirements.txt, where it is listed), or turn dispersion off. "
            "Nothing was computed."
        ) from exc


def dispersion_is_active(calc) -> bool:
    """
    True only when D3 was actually added to the calculator.

    `mace_mp()` returns a plain `MACECalculator` when ``dispersion=False`` and
    a ``SumCalculator([mace_calc, d3_calc])`` when it is on
    (foundations_models.py:303-324). `mace_off()` has no dispersion parameter
    at all, and the custom-checkpoint path never builds one. Checking the
    object that came back is the only honest way to report the flag.
    """
    return type(calc).__name__ == "SumCalculator"


def detect_format(filename: str) -> str:
    """Detect ASE file format from extension.

    `.xyz` maps to ASE's **extxyz** reader, not `xyz`. ASE's plain `xyz` reader
    (`simple_read_xyz`) discards the comment line entirely, which is where
    extended XYZ carries `Lattice="..."` and `pbc="T T T"`. Reading a periodic
    extended-XYZ file as `xyz` therefore produced an Atoms object with ZERO
    lattice vectors, and every crystal was computed as an isolated gas-phase
    cluster: FCC copper came out at -0.93 eV/atom against a correct
    -4.08 eV/atom, and the validator passed it as plausible because the number
    is not absurd on its own. It affected every periodic upload.

    `extxyz` is a strict superset for our purposes — verified on a free-text
    comment file, on the shipped demo structures, and on a periodic cell: it
    reads the first two identically to `xyz` and is the only one that recovers
    the cell from the third. `_read_structure` still falls back to `xyz` if the
    stricter parser rejects a file, so a malformed comment line degrades rather
    than failing the run.
    """
    ext = Path(filename).suffix.lower()
    if ext == ".xyz":
        return "extxyz"
    if ext == ".cif":
        return "cif"
    if ext in (".poscar", ".vasp", ".contcar"):
        return "vasp"
    if ext == ".pdb":
        return "proteindatabank"
    return "xyz"


def resolve_device(requested: str) -> str:
    """Resolve compute device, falling back to CPU if CUDA is unavailable."""
    if requested == "cuda":
        try:
            import torch
            if not torch.cuda.is_available():
                return "cpu"
        except ImportError:
            return "cpu"
    return requested


def get_mace_calculator(model_type: str, model_size: str, device: str, dispersion: bool, precision: str = "float32"):
    """
    Return an ASE calculator for a MACE foundation model.

    There is no fall-through branch. An unrecognised model_type raises, so a
    caller that bypasses validate_model_type() cannot get MACE-MP-0 results
    under a different label.
    """
    model_size = model_size or "medium"

    if model_type in MACE_OFF_MODEL_TYPES:
        from mace.calculators import mace_off
        # Upstream's mace_off() has no `dispersion` parameter: MACE-OFF23 is
        # trained on wB97M-D3BJ data, so D3 is already in the model. Dropping
        # the flag here is the right physics; run_calculation() records that it
        # was dropped instead of echoing it back as if it had been applied.
        return mace_off(model=model_size, device=device, default_dtype=precision)

    if model_type == "MACE-MP-0":
        from mace.calculators import mace_mp
        return mace_mp(model=model_size, device=device, dispersion=dispersion,
                       default_dtype=precision)

    raise ValueError(
        f"No foundation-model loader for modelType '{model_type}'. "
        f"Supported models: {', '.join(SUPPORTED_MODEL_TYPES)}."
    )


def get_custom_calculator(model_path: str, device: str):
    """Load a user-uploaded MACE model checkpoint."""
    from mace.calculators import MACECalculator

    if not Path(model_path).exists():
        raise ValueError(f"Model file not found: {model_path}")

    device = resolve_device(device)

    try:
        return MACECalculator(model_paths=model_path, device=device)
    except Exception as e:
        raise ValueError(
            f"Failed to load custom model '{Path(model_path).name}': {e}. "
            "Ensure the file is a valid MACE .model checkpoint."
        )


def extract_reference_data(atoms) -> dict:
    """Extract reference energy/forces from extended XYZ info/arrays."""
    ref = {}

    for key in ("REF_energy", "ref_energy", "energy", "dft_energy"):
        if key in atoms.info:
            try:
                ref["referenceEnergy"] = float(atoms.info[key])
                break
            except (TypeError, ValueError):
                pass

    for key in ("REF_forces", "ref_forces", "forces", "dft_forces"):
        if key in atoms.arrays:
            try:
                ref["referenceForces"] = atoms.arrays[key].tolist()
                break
            except Exception:
                pass

    return ref


def _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                  effective_params, trajectory=None, warnings=None, manifest=None):
    """
    Assemble the standard JSON result dict.

    `effective_params` records what was ACTUALLY run (defaults filled in,
    device fallback applied, RNG seed used, dispersion reported only when a
    D3 calculator was really built, precision read back off the loaded model).
    It is echoed as result["params"] — declared on CalculationResult in
    types/mace.ts — so that a result is self-describing: the validator selects
    model-aware energy bounds from it, and a shared result carries enough
    information to be re-run.

    `warnings` are appended to the message as well as exposed as
    result["warnings"], because the message is the one field that survives
    everywhere a result travels (UI, PDF export, MACE Link).

    `manifest` is the reproducibility record from provenance.py — library
    versions and the SHA256 of the checkpoint file that was actually loaded.
    It is attached as result["provenance"], a NEW key: nothing existing is
    renamed or restructured, so every reader of this dict keeps working.
    """
    symbols = [a.symbol for a in atoms]
    lattice = atoms.get_cell().tolist() if atoms.pbc.any() else None

    if warnings:
        msg = f"{msg} | Warnings: {' '.join(warnings)}"

    result = {
        "status": "success",
        "energy": float(energy),
        "forces": forces.tolist(),
        "positions": atoms.get_positions().tolist(),
        "symbols": symbols,
        "lattice": lattice,
        "properties": {"volume": float(atoms.get_volume()) if atoms.pbc.any() else None},
        "params": dict(effective_params),
        "message": msg,
        "timeTaken": round(time.time() - calc_start, 3),
    }
    if trajectory is not None:
        result["trajectory"] = trajectory
    if warnings:
        result["warnings"] = list(warnings)
    if manifest is not None:
        result["provenance"] = manifest
    result.update(ref_data)
    return result


_VALIDATION_POLICY = (
    "advisory — findings are reported alongside the result and are never used "
    "to reject a calculation that completed"
)

# Where validate_calculation.py may live, relative to this file. The validator
# is intentionally NOT duplicated into mace-api/ — one copy, found at runtime.
_VALIDATOR_CANDIDATES = (
    Path(__file__).resolve().parent.parent / "test_scripts" / "validate_calculation.py",
    Path(__file__).resolve().parent / "validate_calculation.py",
)

# Repo-relative names for the same paths. The "not found" reason is attached to
# a result and travels into MACE Links and PDF exports, so it must not publish
# the server's directory layout — same rule the manifest follows.
_VALIDATOR_SEARCH_DISPLAY = tuple(
    str(candidate).replace(str(Path(__file__).resolve().parent.parent) + "/", "")
    for candidate in _VALIDATOR_CANDIDATES
)

# (module | None, reason | None), resolved once per process.
_VALIDATOR_CACHE: tuple[object | None, str | None] | None = None


def _load_validator():
    """
    Load test_scripts/validate_calculation.py as a module, or explain why not.

    Loaded by path rather than by import name because it lives outside this
    directory and outside any package. It is also genuinely absent in the
    Docker image, whose build context is mace-api/ alone — that case has to
    read as "validation unavailable, here is why", never as a crash in a
    calculation that already succeeded.
    """
    global _VALIDATOR_CACHE
    if _VALIDATOR_CACHE is not None:
        return _VALIDATOR_CACHE

    import importlib.util

    for candidate in _VALIDATOR_CANDIDATES:
        if not candidate.is_file():
            continue
        try:
            spec = importlib.util.spec_from_file_location(
                "simpleatom_validate_calculation", candidate
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if not hasattr(module, "validate_result"):
                _VALIDATOR_CACHE = (
                    None,
                    f"{candidate.name} has no validate_result() function",
                )
                return _VALIDATOR_CACHE
            _VALIDATOR_CACHE = (module, None)
            return _VALIDATOR_CACHE
        except Exception as exc:  # noqa: BLE001
            _VALIDATOR_CACHE = (None, f"{type(exc).__name__}: {exc}")
            return _VALIDATOR_CACHE

    _VALIDATOR_CACHE = (
        None,
        "validate_calculation.py not found (looked in: "
        + ", ".join(_VALIDATOR_SEARCH_DISPLAY)
        + "). The calculation is unaffected; it simply has no second opinion "
        "attached.",
    )
    return _VALIDATOR_CACHE


def attach_validation(result: dict) -> dict:
    """
    Run the scientific validator over a finished result and record its findings.

    ADVISORY, NEVER BLOCKING — deliberately. Two reasons.

    First, the validator's checks are plausibility heuristics with soft
    thresholds (max force > 50 eV/Å, net force > 0.1 eV/Å, minimum interatomic
    distance < 0.4 Å). Every one of them has a legitimate counterexample: a
    single-point on a deliberately strained or clashing geometry is a normal
    thing to ask MACE for, and it is exactly the case where the user most needs
    the number. Throwing away a completed calculation because a heuristic
    disliked it would be a worse failure than reporting it with a warning.

    Second, the checks that MUST block already do, earlier and elsewhere:
    validate_calculation_type(), validate_model_type(), resolve_precision() and
    resolve_seed() reject bad requests before any model is loaded. Those are
    the security boundary. This runs after the physics and is a second opinion
    on it, which is a different job.

    So: findings are attached to result["validation"], surfaced with the
    result, and never used to reject it. The one thing this must not do is
    fail — an exception inside the validator becomes status "unavailable" with
    the reason, leaving the calculation intact.
    """
    module, reason = _load_validator()
    if module is None:
        result["validation"] = {
            "status": "unavailable",
            "source": None,
            "policy": _VALIDATION_POLICY,
            "unavailableReason": reason,
        }
        return result

    try:
        findings = module.validate_result(result)
        param_findings = None
        if hasattr(module, "validate_params"):
            param_findings = module.validate_params(result.get("params", {}))
        result["validation"] = {
            "status": "ran",
            "source": Path(module.__file__).name,
            "policy": _VALIDATION_POLICY,
            "valid": bool(findings.get("valid", False)),
            "issues": list(findings.get("issues", [])),
            "warnings": list(findings.get("warnings", [])),
            "info": list(findings.get("info", [])),
            "params": param_findings,
            "unavailableReason": None,
        }
    except Exception as exc:  # noqa: BLE001 — see docstring: must never fail
        result["validation"] = {
            "status": "unavailable",
            "source": getattr(module, "__file__", None) and Path(module.__file__).name,
            "policy": _VALIDATION_POLICY,
            "unavailableReason": f"{type(exc).__name__}: {exc}",
        }
    return result


def run_calculation(filepath: str, params: dict, model_path: str | None = None) -> dict:
    """
    Run a MACE calculation on a structure file.

    Args:
        filepath: Path to atomic structure file (XYZ, CIF, POSCAR, PDB).
        params: Calculation parameters dict (matches CalculationParams TS type).
        model_path: Optional path to a custom .model checkpoint.

    Returns:
        Result dict with energy, forces, positions, trajectory, etc.

    Raises:
        ValueError: if calculationType is not one of SUPPORTED_CALCULATION_TYPES,
            if modelType is not one of SUPPORTED_MODEL_TYPES (including
            "custom" with no uploaded checkpoint), if precision is not one of
            SUPPORTED_PRECISIONS, or if the RNG seed is not a non-negative
            integer.
    """
    # Validate first, before any expensive work (file I/O, model download and
    # load), so an unsupported request fails immediately and unambiguously.
    calc_type = validate_calculation_type(params.get("calculationType"))
    model_type = validate_model_type(params.get("modelType"), bool(model_path))
    seed = resolve_seed(params.get("seed"))

    from ase.io import read

    # Declared before the structure is read: the extended-XYZ fallback below is
    # the first thing that can need to warn.
    warnings: list[str] = []

    fmt = detect_format(filepath)
    try:
        atoms = read(filepath, format=fmt)
    except Exception as exc:
        # extxyz is stricter than the plain xyz reader: a malformed comment line
        # that simple_read_xyz would ignore can make it raise. Degrade to the
        # permissive reader rather than failing the run — the cost is losing any
        # cell the comment line declared, which is exactly what we had before.
        if fmt != "extxyz":
            raise
        atoms = read(filepath, format="xyz")
        warnings.append(
            f"Could not parse '{Path(filepath).name}' as extended XYZ "
            f"({type(exc).__name__}); fell back to the plain XYZ reader. Any "
            "Lattice/pbc declared on the comment line was ignored, so this was "
            "treated as a non-periodic structure."
        )
    filename = Path(filepath).name

    ref_data = extract_reference_data(atoms)

    model_size = params.get("modelSize", "medium") or "medium"
    device = resolve_device(params.get("device", "cpu"))
    dispersion_requested = bool(params.get("dispersion", False))
    precision, precision_requested = resolve_precision(
        params.get("precision"), model_type, calc_type
    )

    if model_path and model_type != "custom":
        warnings.append(
            f"A custom .model checkpoint was uploaded, so it was used instead of "
            f"the requested modelType '{model_type}'."
        )
        model_type = "custom"

    # Watch torch.load across BOTH loader branches. "MACE-OFF small" names a
    # download URL, not a fixed set of weights; the file that torch.load
    # actually opens is the only reproducible identifier, and the manifest
    # hashes it below. Costs nothing when no checkpoint can be identified —
    # the manifest then records null and says so.
    with provenance.capture_checkpoint_loads() as checkpoints:
        if model_type == "custom":
            # `precision` is deliberately NOT passed to MACECalculator: upstream
            # then adopts the checkpoint's own dtype, which is the safest choice
            # for a fine-tuned model. The dtype actually in use is read back below.
            with capture_model_warnings() as collected:
                calc = get_custom_calculator(model_path, device)
            if precision_requested:
                warnings.append(
                    f"Requested precision '{precision}' was not applied: a custom "
                    f"checkpoint keeps the dtype it was saved in."
                )
        else:
            # Checked before the checkpoint is fetched and loaded: a missing D3
            # backend is a property of the environment, not of this structure, and
            # there is no reason to spend a model download to discover it. Only
            # MACE-MP-0 reaches torch-dftd — the MACE-OFF and custom paths drop the
            # flag with a warning a few lines below, which is the right physics.
            if dispersion_requested and model_type == "MACE-MP-0":
                require_dispersion_backend()

            recommended = upstream_default_precision(model_type, calc_type)
            if precision_requested and precision == "float32" and recommended == "float64":
                # Honoured, not overridden — upstream honours whatever default_dtype
                # it is handed — but never left unsaid.
                warnings.append(
                    f"Running in float32. Upstream MACE recommends float64 here "
                    f"({'mace_off() defaults to float64' if model_type in MACE_OFF_MODEL_TYPES else 'float32 is recommended for MD, float64 for geometry optimization'}); "
                    f"float32 was explicitly requested, so it was used."
                )
            with capture_model_warnings() as collected:
                calc = get_mace_calculator(model_type, model_size, device,
                                           dispersion_requested, precision)

    atoms.calc = calc

    # Report the flag only if upstream actually built SumCalculator([mace, d3]).
    dispersion_active = dispersion_is_active(calc)
    if dispersion_requested and not dispersion_active:
        if model_type in MACE_OFF_MODEL_TYPES:
            reason = (
                "MACE-OFF is trained on wB97M-D3BJ data, which already includes "
                "dispersion, and upstream's mace_off() has no dispersion parameter"
            )
        elif model_type == "custom":
            reason = "the custom-checkpoint path does not build a D3 calculator"
        else:
            reason = "no D3 calculator was constructed"
        warnings.append(f"D3 dispersion was requested but NOT applied: {reason}.")

    # Read the dtype off the loaded model rather than echoing the request.
    effective_precision = detect_calculator_dtype(calc)

    # Upstream's own warnings during model construction — notably the silent
    # checkpoint downcast — which used to be swallowed by logging.disable().
    for message in dict.fromkeys(collected.messages):
        warnings.append(f"MACE: {message}")

    # Record what actually ran, not what was requested: defaults are filled in
    # and `device` reflects the CUDA->CPU fallback. Only these known scientific
    # keys are echoed — the raw request dict is never reflected back, so an
    # arbitrary client payload cannot ride along in the result.
    effective_params = {
        "calculationType": calc_type,
        "modelType": model_type,
        "modelSize": model_size,
        "device": device,
        "dispersion": dispersion_active,
    }
    if effective_precision is not None:
        effective_params["precision"] = effective_precision
    elif model_type != "custom":
        effective_params["precision"] = precision
    if model_path:
        # Basename only — never echo the server-side temp path.
        effective_params["customModelName"] = Path(model_path).name

    # ── Reproducibility manifest ────────────────────────────────────────────
    # MUST be built here, before dispatch: geometry-opt and MD move the atoms,
    # and input.structureSha256 has to identify the structure that was SUBMITTED,
    # not the one that came out. Building it after the run would produce a hash
    # that silently disagrees with the input file for two of the three
    # calculation types.
    checkpoint_path, checkpoint_resolved_by = checkpoints.select(
        model_path if model_type == "custom" else None,
        provenance.mace_cache_dir(),
    )
    try:
        manifest = provenance.build_manifest(
            model_type=model_type,
            model_size=None if model_type == "custom" else model_size,
            checkpoint_path=checkpoint_path,
            checkpoint_resolved_by=checkpoint_resolved_by,
            input_filename=filename,
            input_path=filepath,
            input_format=fmt,
            atoms=atoms,
            device=device,
            precision=effective_params.get("precision"),
            # Only MD consumes the seed. Reporting it for a single-point would
            # imply a stochastic step that never happened.
            seed=seed if calc_type == "molecular-dynamics" else None,
        )
    except Exception as exc:  # noqa: BLE001 — provenance must never break a run
        manifest = provenance.unavailable_manifest(f"{type(exc).__name__}: {exc}")

    calc_start = time.time()

    if calc_type == "geometry-opt":
        result = _run_geometry_opt(atoms, params, filename, calc_start, ref_data,
                                   effective_params, warnings, manifest)
    elif calc_type == "molecular-dynamics":
        result = _run_md(atoms, params, filename, calc_start, ref_data,
                         effective_params, seed, warnings, manifest)
    elif calc_type == "single-point":
        result = _run_single_point(atoms, filename, calc_start, ref_data,
                                   effective_params, warnings, manifest)
    else:
        # Unreachable — validate_calculation_type() gates this above. Kept as a
        # guard so that adding a type to SUPPORTED_CALCULATION_TYPES without a
        # handler fails loudly instead of silently returning a single-point result.
        raise ValueError(f"No handler implemented for calculationType '{calc_type}'")

    # Second opinion on the physics, attached to the result. Advisory only —
    # see attach_validation(). Runs last so it sees the final geometry, the
    # trajectory and the effective params.
    return attach_validation(result)


def _run_single_point(atoms, filename, calc_start, ref_data, effective_params,
                      warnings=None, manifest=None):
    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    msg = f"Calculation completed for {filename} using MACE"
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                         effective_params, warnings=warnings, manifest=manifest)


def _run_geometry_opt(atoms, params, filename, calc_start, ref_data, effective_params,
                      warnings=None, manifest=None):
    import numpy as np
    from ase.optimize import BFGS

    fmax = float(params.get("forceThreshold", 0.05))
    max_steps = int(params.get("maxOptSteps", 500))
    effective_params.update({"forceThreshold": fmax, "maxOptSteps": max_steps})

    opt_energies = []
    opt_positions = []
    opt_steps = []

    def record_opt_step():
        opt_energies.append(float(atoms.get_potential_energy()))
        opt_positions.append(atoms.get_positions().tolist())
        opt_steps.append(len(opt_energies) - 1)

    opt = BFGS(atoms, logfile=None)
    opt.attach(record_opt_step)
    record_opt_step()  # record initial state (step 0)

    # ASE's Optimizer.run() returns True only if fmax was reached, and False
    # when `steps` was exhausted first (ase 3.27.0, Optimizer.run ->
    # Dynamics.run -> irun). Discarding that return value made a run that hit
    # the maxOptSteps ceiling indistinguishable from a converged one.
    converged = bool(opt.run(fmax=fmax, steps=max_steps))

    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    final_fmax = (
        float(np.linalg.norm(np.asarray(forces), axis=1).max()) if len(forces) else 0.0
    )

    effective_params.update({
        "converged": converged,
        "optSteps": int(opt.nsteps),
        "finalFmax": final_fmax,
    })

    if converged:
        msg = (
            f"Geometry optimization CONVERGED for {filename}: max force "
            f"{final_fmax:.4f} eV/Å is at or below the fmax target of {fmax} eV/Å, "
            f"reached in {opt.nsteps} of at most {max_steps} BFGS steps."
        )
    else:
        # Stated in the message, not only in params, because the message is
        # what survives PDF export and MACE Link sharing.
        msg = (
            f"Geometry optimization DID NOT CONVERGE for {filename}: stopped after "
            f"{opt.nsteps} BFGS steps at the maxOptSteps limit of {max_steps} with "
            f"max force {final_fmax:.4f} eV/Å, still above the fmax target of "
            f"{fmax} eV/Å. The reported geometry is NOT a relaxed minimum — raise "
            f"maxOptSteps or loosen forceThreshold and re-run."
        )
        warnings = list(warnings or [])
        warnings.append(
            f"Optimization not converged: {final_fmax:.4f} eV/Å > fmax {fmax} eV/Å "
            f"after {opt.nsteps}/{max_steps} steps."
        )

    trajectory = {
        "energies": opt_energies,
        "positions": opt_positions,
        "step": opt_steps,
    }
    result = _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                           effective_params, trajectory=trajectory, warnings=warnings,
                           manifest=manifest)
    # Top-level too: convergence is an outcome, not a parameter.
    result["converged"] = converged
    return result


def _run_md(atoms, params, filename, calc_start, ref_data, effective_params, seed,
            warnings=None, manifest=None):
    import numpy as np
    from ase import units
    from ase.md.velocitydistribution import MaxwellBoltzmannDistribution, Stationary

    temp_K = float(params.get("temperature", 300))
    dt_fs = float(params.get("timeStep", 1.0))
    friction = float(params.get("friction", 0.005))
    md_steps = int(params.get("mdSteps", 100))
    ensemble = params.get("mdEnsemble", "NVT")

    effective_params.update({
        "temperature": temp_K,
        "timeStep": dt_fs,
        "friction": friction,
        "mdSteps": md_steps,
        "mdEnsemble": ensemble,
        "seed": seed,
    })

    # Dedicated RNG stream so the run does not depend on (or disturb) numpy's
    # global random state. Feeds both stochastic sources in an MD run: the
    # initial Maxwell-Boltzmann velocities and the Langevin random forces.
    rng = np.random.default_rng(seed)

    traj_potential = []
    traj_kinetic = []
    traj_total = []
    traj_temperature = []
    traj_positions = []
    traj_steps = []

    def write_frame():
        # Potential energy alone is not conserved in NVE — only PE + KE is. The
        # trajectory used to record PE and everything downstream called it
        # "total energy", which made the NVE conservation check impossible.
        potential = float(atoms.get_potential_energy())
        kinetic = float(atoms.get_kinetic_energy())
        traj_potential.append(potential)
        traj_kinetic.append(kinetic)
        traj_total.append(potential + kinetic)
        traj_temperature.append(float(atoms.get_temperature()))
        traj_positions.append(atoms.get_positions().tolist())
        traj_steps.append(dyn.get_number_of_steps())

    # Initialize velocities at target temperature to avoid equilibration transient
    MaxwellBoltzmannDistribution(atoms, temperature_K=temp_K, rng=rng)

    # Drawing per-atom velocities independently leaves the system with a random
    # net linear momentum — for ethanol at seed 42 it was |p| = 1.45, carrying
    # 10.4% of the total kinetic energy as a rigid translation of the whole
    # system. That translation is not a thermal degree of freedom: it inflates
    # every reported temperature and, in NVE, it is a conserved lump of kinetic
    # energy that has nothing to do with the physics being measured.
    #
    # preserve_temperature is ASE's default (True) and is deliberately turned
    # OFF here. With it on, ASE zeroes the momentum and then rescales every
    # remaining velocity to restore the pre-removal temperature — the spurious
    # translational energy is not removed, it is redistributed into the 3N-3
    # internal modes, leaving them ~3N/(3N-3) hotter than the Maxwell-Boltzmann
    # draw asked for (12.5% for a 9-atom molecule). That would defeat the point
    # of the call. Off, the internal modes keep exactly the energy they were
    # drawn with, which is also the kinetic energy a zero-total-momentum system
    # should have at this temperature (3N-3 halves of kB*T).
    #
    # Consequence to be aware of when reading `trajectory.temperatures`:
    # `atoms.get_temperature()` divides by 3N degrees of freedom regardless
    # (ase/atoms.py get_number_of_degrees_of_freedom), so with the momentum
    # pinned at zero it reads low by a factor (3N-3)/3N — 11% for a 9-atom
    # molecule, 1% for a 100-atom one. Left as-is: it is ASE's own convention,
    # it applies uniformly, and under Langevin the thermostat re-excites the
    # centre-of-mass mode anyway, so 3N is the correct divisor there.
    #
    # Applied for every ensemble. Zero total momentum is right for a periodic
    # cell too; ASE's NPT already does this for itself and logs it.
    Stationary(atoms, preserve_temperature=False)
    # NOT ZeroRotation(): net angular momentum is real physics for an isolated
    # molecule (a molecule at 300 K genuinely rotates), it does not translate
    # the system out of the viewing box, and it does not accumulate. Zeroing it
    # would silently remove 3 thermal degrees of freedom the user asked for.
    # It is also meaningless for a periodic cell — the cell fixes the frame, so
    # subtracting a rigid rotation from the contents is not a symmetry
    # operation — and this backend cannot tell the two cases apart from the
    # ensemble alone.
    effective_params["comMomentumRemoved"] = True

    if ensemble == "NVT":
        from ase.md.langevin import Langevin
        dyn = Langevin(atoms, dt_fs * units.fs, temperature_K=temp_K,
                       friction=friction / units.fs, rng=rng)
    elif ensemble == "NPT":
        from ase.md.npt import NPT
        pressure_eVA3 = float(params.get("pressure", 0)) * units.GPa
        dyn = NPT(atoms, dt_fs * units.fs, temperature_K=temp_K,
                   externalstress=pressure_eVA3,
                   ttime=25 * units.fs, pfactor=75 * units.fs ** 2)
    else:
        from ase.md.verlet import VelocityVerlet
        dyn = VelocityVerlet(atoms, dt_fs * units.fs)

    dyn.attach(write_frame, interval=1)
    dyn.run(md_steps)

    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    # The seed is stated in the message as well as in result["params"] because
    # the message survives everywhere a result travels (UI, PDF export, MACE
    # Link), so a shared trajectory always carries what is needed to re-run it.
    # The energy budget is stated there for the same reason: NVE conservation
    # is a claim a reader should be able to check without the raw arrays.
    msg = (f"MD ({ensemble}) completed for {filename} "
           f"({md_steps} steps, seed={seed})")
    if traj_total:
        drift = traj_total[-1] - traj_total[0]
        mean_temp = sum(traj_temperature) / len(traj_temperature)
        msg += (
            f". Total energy (potential + kinetic) {traj_total[0]:.4f} → "
            f"{traj_total[-1]:.4f} eV, drift {drift:+.4f} eV; mean temperature "
            f"{mean_temp:.1f} K"
        )

    trajectory = {
        # `energies` keeps its existing meaning — the POTENTIAL energy per
        # frame — so nothing that already reads it changes under its feet.
        # Read the explicit keys instead: an NVE conservation check needs
        # `totalEnergies`, which was never recorded before.
        "energies": traj_potential,
        "potentialEnergies": traj_potential,
        "kineticEnergies": traj_kinetic,
        "totalEnergies": traj_total,
        "temperatures": traj_temperature,
        "positions": traj_positions,
        "step": traj_steps,
    }
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                         effective_params, trajectory=trajectory, warnings=warnings,
                         manifest=manifest)
