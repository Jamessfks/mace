"""
Shared MACE calculation engine.

Contains all scientific logic for running MACE calculations (single-point,
geometry optimization, molecular dynamics). Both the CLI wrapper
(calculate_local.py) and the FastAPI server (main.py) call into this module.
"""

import time
from pathlib import Path

# Calculation types that have a real implementation below. This is the
# security boundary: the API can be POSTed to directly, so the frontend check
# is not sufficient. Anything outside this set MUST fail loudly — silently
# falling back to a single-point run would return a plausible-looking energy
# for a calculation that never happened.
SUPPORTED_CALCULATION_TYPES = ("single-point", "geometry-opt", "molecular-dynamics")

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


def detect_format(filename: str) -> str:
    """Detect ASE file format from extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".xyz":
        return "xyz"
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
    """Return ASE calculator for a MACE foundation model."""
    model_size = model_size or "medium"

    if model_type in ("MACE-OFF", "MACE-OFF23"):
        from mace.calculators import mace_off
        return mace_off(model=model_size, device=device, default_dtype=precision)

    from mace.calculators import mace_mp
    return mace_mp(model=model_size, device=device, dispersion=dispersion, default_dtype=precision)


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
                  effective_params, trajectory=None):
    """
    Assemble the standard JSON result dict.

    `effective_params` records what was ACTUALLY run (defaults filled in,
    device fallback applied, RNG seed used). It is echoed as result["params"]
    — declared on CalculationResult in types/mace.ts — so that a result is
    self-describing: the validator selects model-aware energy bounds from it,
    and a shared result carries enough information to be re-run.
    """
    symbols = [a.symbol for a in atoms]
    lattice = atoms.get_cell().tolist() if atoms.pbc.any() else None

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
    result.update(ref_data)
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
            or if the RNG seed is not a non-negative integer.
    """
    # Validate first, before any expensive work (file I/O, model download and
    # load), so an unsupported request fails immediately and unambiguously.
    calc_type = validate_calculation_type(params.get("calculationType"))
    seed = resolve_seed(params.get("seed"))

    from ase.io import read

    fmt = detect_format(filepath)
    atoms = read(filepath, format=fmt)
    filename = Path(filepath).name

    ref_data = extract_reference_data(atoms)

    model_type = params.get("modelType", "MACE-MP-0")
    model_size = params.get("modelSize", "medium")
    device = resolve_device(params.get("device", "cpu"))
    dispersion = params.get("dispersion", False)
    precision = params.get("precision", "float32")

    if model_path:
        calc = get_custom_calculator(model_path, device)
    else:
        calc = get_mace_calculator(model_type, model_size, device, dispersion, precision)
    atoms.calc = calc

    # Record what actually ran, not what was requested: defaults are filled in
    # and `device` reflects the CUDA->CPU fallback. Only these known scientific
    # keys are echoed — the raw request dict is never reflected back, so an
    # arbitrary client payload cannot ride along in the result.
    effective_params = {
        "calculationType": calc_type,
        "modelType": "custom" if model_path else model_type,
        "modelSize": model_size,
        "precision": precision,
        "device": device,
        "dispersion": bool(dispersion),
    }
    if model_path:
        # Basename only — never echo the server-side temp path.
        effective_params["customModelName"] = Path(model_path).name

    calc_start = time.time()

    if calc_type == "geometry-opt":
        return _run_geometry_opt(atoms, params, filename, calc_start, ref_data,
                                 effective_params)
    if calc_type == "molecular-dynamics":
        return _run_md(atoms, params, filename, calc_start, ref_data,
                       effective_params, seed)
    if calc_type == "single-point":
        return _run_single_point(atoms, filename, calc_start, ref_data,
                                 effective_params)

    # Unreachable — validate_calculation_type() gates this above. Kept as a
    # guard so that adding a type to SUPPORTED_CALCULATION_TYPES without a
    # handler fails loudly instead of silently returning a single-point result.
    raise ValueError(f"No handler implemented for calculationType '{calc_type}'")


def _run_single_point(atoms, filename, calc_start, ref_data, effective_params):
    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    msg = f"Calculation completed for {filename} using MACE"
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                         effective_params)


def _run_geometry_opt(atoms, params, filename, calc_start, ref_data, effective_params):
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
    opt.run(fmax=fmax, steps=max_steps)

    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    msg = f"Geometry optimization completed for {filename} (fmax={fmax}, steps={opt.nsteps})"

    trajectory = {
        "energies": opt_energies,
        "positions": opt_positions,
        "step": opt_steps,
    }
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                         effective_params, trajectory=trajectory)


def _run_md(atoms, params, filename, calc_start, ref_data, effective_params, seed):
    import numpy as np
    from ase import units
    from ase.md.velocitydistribution import MaxwellBoltzmannDistribution

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

    traj_energies = []
    traj_positions = []
    traj_steps = []

    def write_frame():
        traj_energies.append(float(atoms.get_potential_energy()))
        traj_positions.append(atoms.get_positions().tolist())
        traj_steps.append(dyn.get_number_of_steps())

    # Initialize velocities at target temperature to avoid equilibration transient
    MaxwellBoltzmannDistribution(atoms, temperature_K=temp_K, rng=rng)

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
    msg = (f"MD ({ensemble}) completed for {filename} "
           f"({md_steps} steps, seed={seed})")

    trajectory = {
        "energies": traj_energies,
        "positions": traj_positions,
        "step": traj_steps,
    }
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                         effective_params, trajectory=trajectory)
