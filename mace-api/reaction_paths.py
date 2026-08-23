"""
Reaction-path calculations for SimpleAtom: relaxed coordinate scan, NEB, IRC.

Self-contained: nothing here edits or is imported by calculate.py's existing
code paths. The only thing taken from calculate.py is `_build_result`, so that
a reaction-path result has exactly the same shape as a single-point or a
geometry-opt result and every existing reader keeps working. Duplicating that
function here would let the two drift — the same argument calculate.py makes
for loading test_scripts/validate_calculation.py by path instead of vendoring
a second copy.

Three calculation types are implemented:

    coordinate-scan  Step a bond / angle / dihedral across a range, relaxing
                     every other degree of freedom at each point.
    neb              Climbing-image nudged elastic band between a reactant and
                     a product geometry; reports forward/reverse barriers.
    irc              Intrinsic reaction coordinate downhill from a transition
                     state in both directions, in mass-weighted coordinates.

WIRING CONTRACT (for whoever adds dispatch in calculate.py)
-----------------------------------------------------------
`atoms.calc` must already be set — this module never builds a calculator, so
model selection, precision, dispersion and the provenance manifest all stay
where they are. The public entry points are

    run_coordinate_scan(atoms, params, **bookkeeping) -> dict
    run_neb(reactant, product, params, **bookkeeping) -> dict
    run_irc(atoms, params, **bookkeeping) -> dict
    run_reaction_path(calc_type, atoms, params, product=..., **bookkeeping)

`bookkeeping` is the same set of values `_run_geometry_opt` already receives
(filename, calc_start, ref_data, effective_params, warnings, manifest); every
one is optional so the functions are also usable standalone from a script or
a test. Each returns a JSON-serialisable dict from `_build_result`, with the
reaction-path specifics under `result["profile"]` (everything a front-end
needs to draw the energy curve) and `result["scan"|"neb"|"irc"]`.

`attach_validation()` is deliberately NOT called here. run_calculation() calls
it once at the end of dispatch, and calling it twice would attach two
`result["validation"]` blocks with the second silently winning.

WHY THERE ARE HARD CAPS
-----------------------
SimpleAtom runs on a free Hugging Face Space: 2 vCPU, 16 GB, CPU only, no
sign-in. A 7-image NEB at 100 optimizer steps is 500+ MACE force calls, and
`app/api/calculate/route.ts` aborts the request at 10 minutes. So every entry
point here (a) refuses inputs that are structurally too large, (b) projects
the cost from a force call timed on the caller's ACTUAL structure and refuses
up front when the projection is hopeless, and (c) carries a wall-clock guard
that stops mid-run and returns the partial path labelled "did not converge
within the budget". See the MEASUREMENTS block below for where the numbers
came from.
"""

from __future__ import annotations

import math
import time
from typing import Any, Callable, Sequence

import numpy as np

# `_build_result` is private to calculate.py by name, and imported anyway:
# the result *shape* is calculate.py's to own, and a second hand-maintained
# copy of it in this file would drift the moment either side gained a key.
# Imported lazily inside _result() rather than at module scope. calculate.py
# derives SUPPORTED_CALCULATION_TYPES from this module's
# SUPPORTED_REACTION_PATH_TYPES, so a module-level import here closes an
# import cycle and neither module can load.


def _build_result(*args, **kwargs):
    """Thin forwarder to calculate._build_result, resolved at call time."""
    from calculate import _build_result as _impl
    return _impl(*args, **kwargs)

# ─────────────────────────────────────────────────────────────────────────────
# MEASUREMENTS — every cap below is a measured number, not a guess.
# ─────────────────────────────────────────────────────────────────────────────
#
# Reference measurement, MACE-OFF23 small, float64, CPU, torch.set_num_threads(2)
# (2 threads to match the Space's 2 vCPU), Apple Silicon, mace-torch 0.3.15,
# torch 2.10.0, ase 3.27.0. Median of 6 force+energy calls per system after a
# warm-up call:
#
#     atoms    3     8     9    12    24    36    60    96
#     ms/call 11.7  13.6  13.4  16.8  33.0  42.3  58.9 102.1
#
# Least-squares fit:            t_call(N) ≈ 6.4 ms + 0.97 ms × N      (R² 0.997)
#
# That machine is NOT the deployment target. A free Space gives 2 shared x86
# vCPU; for PyTorch CPU inference an Apple performance core is roughly 3–5×
# faster per core. DERATE_VS_REFERENCE below is set to 4 — an assumption,
# stated as one, and the only unmeasured number in this file. It is used ONLY
# to derive the static caps. Everything that actually decides at run time uses
# `_calibrate_force_call()`, which times a real force call on the real input,
# so the guards self-correct on hardware slower or faster than assumed.
#
# Typical (not worst-case) workloads, measured on the systems in
# test_reaction_paths.py:
#
#   scan  13-point ethane H–C–C–H torsion: 61 BFGS steps total, 4.7 per point
#         (sequential scan — each point starts from the previous relaxed
#         geometry, which is why it is this cheap). Budgeting uses 12/point.
#   neb   7-image NH3 inversion: 6 band steps + 0 climb steps = 30 force calls.
#         Budgeting uses 60 optimizer steps, i.e. 5 interior × 60 = 300 calls
#         plus ~60 for endpoint relaxation.
#   irc   ethane eclipsed TS, both directions: 2 × 115 steps at Δs = 0.01
#         √amu·Å, plus one Hessian. Budgeting uses 2 × 150 + 6N.
#
# The caps are then "the largest round N whose TYPICAL workload is projected
# to finish inside half the default 240 s budget on the derated reference":
#
#   scan  252 calls  → N ≤ 116 → MAX_ATOMS_SCAN = 100
#   neb   360 calls  → N ≤  79 → MAX_ATOMS_NEB  =  75
#   irc   300+6N     → N ≤  45 → MAX_ATOMS_IRC  =  40
#
# IRC is the strictest because it pays for a Hessian on top of two downhill
# runs, and because a Hessian that is too noisy to count imaginary modes makes
# the whole calculation meaningless rather than merely slow.

#: Assumed slowdown of a free 2-vCPU Space relative to the reference machine
#: the cost model above was fitted on. Used for the static caps only.
DERATE_VS_REFERENCE = 4.0

#: Fitted force-call cost on the reference machine, milliseconds.
_REF_CALL_INTERCEPT_MS = 6.4
_REF_CALL_SLOPE_MS_PER_ATOM = 0.97

SUPPORTED_REACTION_PATH_TYPES = ("coordinate-scan", "neb", "irc")

#: Structural caps. Exceeding one is an immediate, explained refusal — not a
#: silent clamp, because a scan quietly truncated from 200 points to 48 would
#: return a profile that does not cover the range the user asked for.
MAX_ATOMS_SCAN = 100
MAX_ATOMS_NEB = 75
MAX_ATOMS_IRC = 40
MAX_SCAN_POINTS = 48
MAX_NEB_IMAGES = 11
MAX_IRC_STEPS_PER_DIRECTION = 300
MAX_SCAN_STEPS_PER_POINT = 100
MAX_NEB_OPT_STEPS = 200

#: Wall-clock budget. `app/api/calculate/route.ts` aborts the upstream fetch at
#: 10 minutes (600 s), so the hard ceiling leaves a minute of margin for model
#: load, JSON serialisation and transport.
DEFAULT_WALL_CLOCK_BUDGET_S = 240.0
MAX_WALL_CLOCK_BUDGET_S = 540.0

#: Refuse before starting when the projected cost exceeds the budget by this
#: factor. Below it we start and let the wall-clock guard return a partial
#: result, because the projection is an estimate and a pessimistic estimate
#: should not veto a run that would in fact have finished.
PROJECTION_REFUSAL_FACTOR = 3.0

#: Defaults, all overridable through `params`.
DEFAULT_SCAN_FMAX = 0.05        # eV/Å, inner relaxation at each scan point
DEFAULT_SCAN_STEPS = 60         # BFGS steps allowed per scan point
DEFAULT_NEB_IMAGES = 7
DEFAULT_NEB_FMAX = 0.05         # eV/Å, climbing-image phase target
DEFAULT_NEB_SPRING_K = 0.1      # eV/Å²
DEFAULT_NEB_OPT_STEPS = 100     # total across both phases
DEFAULT_ENDPOINT_FMAX = 0.05    # eV/Å, what an endpoint must already satisfy
DEFAULT_ENDPOINT_STEPS = 200
DEFAULT_IRC_STEP = 0.01         # √amu·Å of mass-weighted arc length per step
DEFAULT_IRC_STEPS = 200         # per direction
DEFAULT_IRC_INITIAL_DISPLACEMENT = 0.10   # √amu·Å along the imaginary mode
DEFAULT_IRC_GRADIENT_TOL = 0.02  # eV/(√amu·Å) mass-weighted gradient norm
DEFAULT_IRC_TIMESTEP = 0.1      # natural time units (≈1.0 fs), see _dvv_irc

#: A mode is called imaginary only below this. Numerical noise in a Hessian
#: puts the six translation/rotation eigenvalues at a few cm⁻¹ either side of
#: zero even after Eckart projection; counting those as imaginary would reject
#: every real saddle point. Measured on the ethane eclipsed saddle: the six
#: projected zero modes came out at |ν| < 0.05 cm⁻¹ and the true reaction mode
#: at −287 cm⁻¹, so 50 cm⁻¹ sits three orders of magnitude clear of the noise
#: while still catching genuinely soft imaginary modes.
IMAGINARY_FREQUENCY_CUTOFF_CM = 50.0

#: Below this the transition state is not a stationary point and an IRC from it
#: is meaningless. Same threshold CLAUDE.md sets for pre-frequency geometries.
TS_STATIONARY_FMAX = 0.005      # eV/Å

#: How far a constrained coordinate may drift during the inner relaxation
#: before the scan point is flagged. FixInternals converges its Lagrange
#: iteration to `epsilon`, so in practice the deviation is ~1e-13; these are
#: alarm thresholds, not accuracy targets.
SCAN_BOND_TOLERANCE_A = 1.0e-4      # Å
SCAN_ANGLE_TOLERANCE_DEG = 1.0e-3   # degrees

#: Covalent-radius scale factor for the bond graph used to work out which
#: atoms rotate with a dihedral. 1.2 is ASE's own habit in
#: `ase.neighborlist.natural_cutoffs` users and is loose enough for the
#: stretched bonds that appear part-way through a scan.
BOND_GRAPH_SCALE = 1.2

_KCAL_PER_EV = 23.060548
_KJ_PER_EV = 96.48534

#: Natural time unit of mass-weighted dynamics, √(amu·Å²/eV), in fs. Used only
#: to report the IRC time step in a unit a chemist can sanity-check.
_TIME_UNIT_FS = 10.180505


class BudgetExceeded(Exception):
    """Raised internally when the wall-clock guard fires. Never escapes."""


# ─────────────────────────────────────────────────────────────────────────────
# Budget plumbing
# ─────────────────────────────────────────────────────────────────────────────


class _Budget:
    """
    Wall-clock guard.

    Deliberately time-based rather than step-based. A step cap is only
    meaningful once you know how long a step takes, and that depends on the
    model size, the atom count and whatever else is sharing the Space's two
    vCPU at that moment. Time is the quantity the HTTP client actually cares
    about, and it is the only one that behaves the same on every host.
    """

    def __init__(self, seconds: float, started: float | None = None):
        self.seconds = float(seconds)
        self.started = time.time() if started is None else float(started)

    @property
    def elapsed(self) -> float:
        return time.time() - self.started

    @property
    def remaining(self) -> float:
        return self.seconds - self.elapsed

    def exhausted(self) -> bool:
        return self.remaining <= 0.0

    def check(self, where: str) -> None:
        if self.exhausted():
            raise BudgetExceeded(
                f"wall-clock budget of {self.seconds:.0f} s exhausted during {where} "
                f"({self.elapsed:.0f} s elapsed)"
            )


class _CallCounter:
    """
    Count MACE force evaluations by shadowing the calculator's bound
    `calculate` with an instance attribute.

    Instance attributes take precedence over class attributes, and ASE's
    `Calculator.get_property` calls `self.calculate(...)`, so this counts every
    real evaluation and none of the cached ones — which is exactly the number
    the budget is denominated in. It is reversible (`del` restores the class
    method) and does not change `type(calc)`, which matters because NEB
    inspects calculators by identity.
    """

    def __init__(self, calc):
        self._calc = calc
        self._original: Callable | None = None
        self.count = 0

    def __enter__(self) -> "_CallCounter":
        original = self._calc.calculate
        self._original = original

        def counting(*args, **kwargs):
            self.count += 1
            return original(*args, **kwargs)

        try:
            self._calc.calculate = counting  # type: ignore[method-assign]
        except Exception:  # pragma: no cover — exotic calculator, count stays 0
            self._original = None
        return self

    def __exit__(self, *exc) -> None:
        if self._original is not None:
            try:
                del self._calc.calculate  # type: ignore[attr-defined]
            except Exception:  # pragma: no cover
                self._calc.calculate = self._original  # type: ignore[method-assign]
        return None


def _calibrate_force_call(atoms) -> float:
    """
    Time one real force call on the caller's structure, in seconds.

    The static caps in this file were derived on one machine; this is what
    makes the run-time guards correct on any other. Costs exactly one force
    call, which every one of these calculations was going to spend anyway —
    the result is left in the calculator's cache, so it is not wasted.
    """
    start = time.perf_counter()
    atoms.get_potential_energy()
    atoms.get_forces()
    return time.perf_counter() - start


def reference_call_cost_s(n_atoms: int) -> float:
    """Cost model from the MEASUREMENTS block, derated for a free Space."""
    ms = _REF_CALL_INTERCEPT_MS + _REF_CALL_SLOPE_MS_PER_ATOM * n_atoms
    return DERATE_VS_REFERENCE * ms / 1000.0


def _resolve_budget(raw: Any) -> float:
    """Validate `params["wallClockBudget"]` (seconds)."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return DEFAULT_WALL_CLOCK_BUDGET_S
    if isinstance(raw, bool):
        raise ValueError("Invalid wallClockBudget: expected seconds, got a boolean.")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(
            f"Invalid wallClockBudget: expected a number of seconds, got {raw!r}."
        )
    if not math.isfinite(value) or value <= 0:
        raise ValueError(
            f"Invalid wallClockBudget: must be a positive number of seconds, got {value}."
        )
    if value > MAX_WALL_CLOCK_BUDGET_S:
        raise ValueError(
            f"wallClockBudget {value:.0f} s exceeds the {MAX_WALL_CLOCK_BUDGET_S:.0f} s "
            f"ceiling. app/api/calculate/route.ts aborts the request at 600 s, so a "
            f"longer budget would be spent on a response nobody receives."
        )
    return value


def _project_and_gate(
    label: str,
    projected_calls: int,
    measured_call_s: float,
    budget: _Budget,
    warnings: list[str],
) -> dict:
    """
    Compare the projected cost against the budget BEFORE doing the work.

    Three outcomes, and the middle one matters most: a projection is an
    estimate built on a typical optimizer-step count, so it must not veto a run
    that would in fact have finished. It refuses only when the projection is
    hopeless by a wide margin (PROJECTION_REFUSAL_FACTOR), warns when it is
    merely tight, and otherwise says nothing.
    """
    projected_s = projected_calls * measured_call_s
    projection = {
        "measuredForceCallSeconds": round(measured_call_s, 4),
        "projectedForceCalls": int(projected_calls),
        "projectedSeconds": round(projected_s, 1),
        "budgetSeconds": round(budget.seconds, 1),
    }
    if projected_s > PROJECTION_REFUSAL_FACTOR * budget.seconds:
        raise ValueError(
            f"{label} refused before starting: a force call on this structure was "
            f"timed at {measured_call_s * 1000:.0f} ms, and the calculation needs about "
            f"{projected_calls} of them — roughly {projected_s:.0f} s against a "
            f"{budget.seconds:.0f} s budget. Nothing was computed. Reduce the number of "
            f"points/images/steps, use a smaller structure, or raise wallClockBudget "
            f"(ceiling {MAX_WALL_CLOCK_BUDGET_S:.0f} s)."
        )
    if projected_s > 0.5 * budget.seconds:
        warnings.append(
            f"{label} is projected to take about {projected_s:.0f} s of the "
            f"{budget.seconds:.0f} s budget ({projected_calls} force calls at "
            f"{measured_call_s * 1000:.0f} ms each); it may stop early and return a "
            f"partial path."
        )
    return projection


def _require_calculator(atoms, what: str):
    if getattr(atoms, "calc", None) is None:
        raise ValueError(
            f"{what} has no calculator attached. reaction_paths.py never builds one — "
            f"model selection, precision and the provenance manifest all live in "
            f"calculate.py, and duplicating that here would let a reaction path be run "
            f"against a different model than the one the result claims."
        )


def _require_size(atoms, cap: int, label: str) -> None:
    if len(atoms) > cap:
        raise ValueError(
            f"{label} is capped at {cap} atoms on this deployment and the structure has "
            f"{len(atoms)}. The cap is a measured one: see the MEASUREMENTS block in "
            f"reaction_paths.py. Nothing was computed."
        )


def _positive_int(raw: Any, default: int, name: str, cap: int) -> int:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        value = default
    else:
        if isinstance(raw, bool):
            raise ValueError(f"Invalid {name}: expected an integer, got a boolean.")
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid {name}: expected an integer, got {raw!r}.")
    if value < 1:
        raise ValueError(f"Invalid {name}: must be at least 1, got {value}.")
    if value > cap:
        raise ValueError(
            f"Invalid {name}: {value} exceeds the cap of {cap} for this deployment."
        )
    return value


def _positive_float(raw: Any, default: float, name: str) -> float:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return default
    if isinstance(raw, bool):
        raise ValueError(f"Invalid {name}: expected a number, got a boolean.")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {name}: expected a number, got {raw!r}.")
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"Invalid {name}: must be a positive finite number, got {value}.")
    return value


# ─────────────────────────────────────────────────────────────────────────────
# Connectivity — needed to know which atoms move when a dihedral is stepped
# ─────────────────────────────────────────────────────────────────────────────


def _bond_graph(atoms, scale: float = BOND_GRAPH_SCALE) -> dict[int, set[int]]:
    """Covalent-radius adjacency, honouring PBC through ASE's NeighborList."""
    from ase.neighborlist import NeighborList, natural_cutoffs

    cutoffs = [scale * c for c in natural_cutoffs(atoms)]
    nl = NeighborList(cutoffs, self_interaction=False, bothways=True)
    nl.update(atoms)
    return {i: set(int(j) for j in nl.get_neighbors(i)[0]) for i in range(len(atoms))}


def _side_group(atoms, pivot: int, moving: int) -> list[int] | None:
    """
    Atoms reachable from `moving` without crossing the `pivot`-`moving` bond.

    That set is exactly the rigid group a torsion about pivot→moving rotates.
    Returns None when `pivot` is reachable anyway — i.e. the two atoms are in a
    ring, where no rigid rotation exists and the caller must fall back to
    letting the constraint drag the coordinate into place.
    """
    graph = _bond_graph(atoms)
    if moving not in graph or pivot not in graph:
        return None
    seen = {moving}
    stack = [moving]
    while stack:
        node = stack.pop()
        for nb in graph[node]:
            if node == moving and nb == pivot:
                continue  # do not walk back across the rotation axis
            if nb == pivot:
                return None  # ring closure: no rigid group
            if nb not in seen:
                seen.add(nb)
                stack.append(nb)
    return sorted(seen)


# ─────────────────────────────────────────────────────────────────────────────
# 1. RELAXED COORDINATE SCAN
# ─────────────────────────────────────────────────────────────────────────────

_COORDINATE_KINDS = {"bond": 2, "angle": 3, "dihedral": 4}


def _validate_coordinate(atoms, params: dict) -> tuple[str, tuple[int, ...]]:
    """Normalise and range-check `params["scanCoordinate"]` / `["scanIndices"]`."""
    raw_kind = params.get("scanCoordinate")
    if not isinstance(raw_kind, str) or not raw_kind.strip():
        raise ValueError(
            "A relaxed scan needs scanCoordinate: one of "
            f"{', '.join(sorted(_COORDINATE_KINDS))}."
        )
    kind = raw_kind.strip().lower()
    if kind not in _COORDINATE_KINDS:
        raise ValueError(
            f"Unsupported scanCoordinate '{raw_kind}'. Supported: "
            f"{', '.join(sorted(_COORDINATE_KINDS))}."
        )

    expected = _COORDINATE_KINDS[kind]
    raw_indices = params.get("scanIndices")
    if not isinstance(raw_indices, (list, tuple)):
        raise ValueError(
            f"A {kind} scan needs scanIndices: a list of {expected} zero-based atom "
            f"indices, got {raw_indices!r}."
        )
    if len(raw_indices) != expected:
        raise ValueError(
            f"A {kind} scan needs exactly {expected} atom indices, got {len(raw_indices)}."
        )
    indices: list[int] = []
    for value in raw_indices:
        if isinstance(value, bool):
            raise ValueError("Invalid scanIndices: expected integers, got a boolean.")
        try:
            idx = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid scanIndices entry {value!r}: expected an integer.")
        if not 0 <= idx < len(atoms):
            raise ValueError(
                f"scanIndices entry {idx} is out of range for a {len(atoms)}-atom "
                f"structure (valid: 0 to {len(atoms) - 1})."
            )
        indices.append(idx)
    if len(set(indices)) != expected:
        raise ValueError(f"scanIndices must be {expected} DISTINCT atoms, got {indices}.")
    return kind, tuple(indices)


def _scan_grid(params: dict) -> list[float]:
    """Build the scan grid from scanStart / scanEnd / scanPoints."""
    for key in ("scanStart", "scanEnd"):
        if key not in params or params[key] is None:
            raise ValueError(f"A relaxed scan needs {key}.")
    try:
        start = float(params["scanStart"])
        end = float(params["scanEnd"])
    except (TypeError, ValueError):
        raise ValueError(
            f"Invalid scan range: scanStart={params['scanStart']!r}, "
            f"scanEnd={params['scanEnd']!r} — both must be numbers."
        )
    if not (math.isfinite(start) and math.isfinite(end)):
        raise ValueError("Invalid scan range: scanStart and scanEnd must be finite.")
    points = _positive_int(
        params.get("scanPoints"), 13, "scanPoints", MAX_SCAN_POINTS
    )
    if points < 2:
        raise ValueError("scanPoints must be at least 2 — a one-point scan is a "
                         "single-point calculation, which SimpleAtom already has.")
    if start == end:
        raise ValueError(
            f"Invalid scan range: scanStart and scanEnd are both {start}. "
            "A zero-width scan produces the same geometry N times."
        )
    return [start + (end - start) * i / (points - 1) for i in range(points)]


def _coordinate_value(atoms, kind: str, indices: Sequence[int], mic: bool) -> float:
    if kind == "bond":
        return float(atoms.get_distance(indices[0], indices[1], mic=mic))
    if kind == "angle":
        return float(atoms.get_angle(*indices, mic=mic))
    return float(atoms.get_dihedral(*indices, mic=mic))


def _coordinate_deviation(kind: str, achieved: float, target: float) -> float:
    """Signed deviation; dihedrals wrap onto (-180, 180]."""
    if kind == "dihedral":
        return float((achieved - target + 180.0) % 360.0 - 180.0)
    return float(achieved - target)


def _make_coordinate_setter(
    atoms, kind: str, indices: Sequence[int], mic: bool, warnings: list[str]
) -> tuple[Callable[[float], None], str]:
    """
    Build the function that moves the geometry to a target value.

    Moving the coordinate explicitly, rather than letting FixInternals drag it
    over during the first optimizer step, matters for two reasons: a rigid
    rotation of the correct substituent group is a chemically sensible starting
    guess where the constraint's Lagrange correction is a minimum-norm
    Cartesian shove that distorts bonds, and FixInternals.adjust_positions
    raises outright if its 50 iterations do not converge on a large jump.

    Built ONCE, before the scan loop, for two reasons of its own: the bond
    graph is then read off the input geometry rather than off a part-way
    stretched one (where a scanned bond can drop out of the graph and change
    which atoms count as the rotating group mid-scan), and any warning it
    raises is raised once instead of once per point.

    Returns (setter, description-of-how-it-moves).
    """
    if kind == "bond":
        # `fix=0.5` moves both atoms symmetrically about the bond midpoint. No
        # attempt is made to carry the attached substituents: the whole point
        # of a RELAXED scan is that the inner optimizer fixes everything else,
        # and a wrong guess about connectivity would be worse than a crude one.
        def set_bond(target: float) -> None:
            atoms.set_distance(indices[0], indices[1], target, fix=0.5, mic=mic)

        return set_bond, "both atoms moved symmetrically about the bond midpoint"

    if kind == "angle":
        def set_angle(target: float) -> None:
            atoms.set_angle(indices[0], indices[1], indices[2], target)

        return set_angle, "third atom rotated about the vertex"

    # Dihedral: rotate the entire group on the far side of the central bond.
    # ASE's default (mask=None) moves ONLY atom a4, which for an ethane torsion
    # would drag one hydrogen away from its methyl group and leave the other
    # two behind — a valid dihedral value attached to a wrecked molecule.
    group = _side_group(atoms, indices[1], indices[2])
    if group is None:
        warnings.append(
            f"Atoms {indices[1]} and {indices[2]} are in a ring, so the dihedral "
            f"{list(indices)} has no rigid rotating group. Only atom {indices[3]} was "
            f"moved to reach each target and the constraint pulled the rest into place; "
            f"ring-torsion scans are more prone to optimizer trouble than acyclic ones."
        )

        def set_ring_dihedral(target: float) -> None:
            atoms.set_dihedral(*indices, target)

        return set_ring_dihedral, f"ring detected — only atom {indices[3]} moved"

    mask = [1 if i in set(group) else 0 for i in range(len(atoms))]

    def set_dihedral(target: float) -> None:
        atoms.set_dihedral(*indices, target, mask=mask)

    return (
        set_dihedral,
        f"rigid rotation of {len(group)} atoms about the "
        f"{indices[1]}–{indices[2]} bond",
    )


def _make_constraint(kind: str, indices: Sequence[int], target: float, mic: bool):
    """
    Build the holonomic constraint that pins the scanned coordinate.

    FixInternals is used for ALL THREE coordinate kinds, including bonds, and
    that choice is deliberate. `ase.constraints.FixBondLength(a1, a2)` in
    ase 3.27.0 is not a class at all — it is a one-line function returning
    `FixBondLengths([(a1, a2)])` (constraints.py:405), a SHAKE/RATTLE
    constraint whose target length is whatever `initialize_bond_lengths()`
    happens to read off the geometry the first time `adjust_positions` runs.
    It takes no target value. Using it for a scan would mean the enforced
    length is an accident of how `set_distance` left the geometry, so the
    number we report as "the constrained value" and the number the constraint
    actually holds would be two different things that merely usually agree.

    FixInternals takes an explicit `targetvalue` (constraints.py:937-1000) and
    iterates its Lagrange correction until |sigma| < epsilon, where sigma is
    measured against that value. The requested target and the enforced target
    are then the same number, which is what makes the post-relaxation deviation
    check below meaningful rather than circular.

    Angles and dihedrals are passed in DEGREES via `angles_deg` / `dihedrals_deg`;
    the bare `angles` / `dihedrals` arguments are radians and raise a
    FutureWarning (constraints.py:974-983).
    """
    from ase.constraints import FixInternals

    if kind == "bond":
        return FixInternals(bonds=[[float(target), list(indices)]], mic=mic)
    if kind == "angle":
        # FixInternals.FixAngle raises ZeroDivisionError outside (0, 180); the
        # Cartesian derivative of a planar angle is singular. Caught here so the
        # user gets chemistry instead of a division error from inside ASE.
        if not 0.0 < target < 180.0:
            raise ValueError(
                f"Angle target {target:.3f}° is outside the range FixInternals can "
                f"constrain (0°, 180°) — the Cartesian derivative of a linear angle is "
                f"singular and ASE does not implement the dummy atoms that would be "
                f"needed. Choose a scan range strictly inside 0–180°."
            )
        return FixInternals(angles_deg=[[float(target), list(indices)]], mic=mic)
    return FixInternals(dihedrals_deg=[[float(target), list(indices)]], mic=mic)


def run_coordinate_scan(
    atoms,
    params: dict,
    *,
    filename: str = "structure",
    calc_start: float | None = None,
    ref_data: dict | None = None,
    effective_params: dict | None = None,
    warnings: Sequence[str] | None = None,
    manifest: dict | None = None,
) -> dict:
    """
    Relaxed scan of one internal coordinate.

    At every grid point the coordinate is set to the target, pinned with
    FixInternals, and every other degree of freedom is relaxed with BFGS —
    matching `_run_geometry_opt`, which is BFGS-only with no optimizer knob.

    The scan is SEQUENTIAL: each point starts from the previous point's relaxed
    geometry rather than from the input. That is what makes it affordable
    (measured: 4.7 BFGS steps per point on ethane, against 20-30 when every
    point restarts cold) and it produces a continuous path. The cost is
    hysteresis — a scan run backwards can land in a different branch where the
    surface bifurcates — which is recorded in the result rather than hidden.

    Params
    ------
    scanCoordinate : "bond" | "angle" | "dihedral"
    scanIndices    : 2, 3 or 4 zero-based atom indices
    scanStart, scanEnd : Å for bonds, degrees for angles and dihedrals
    scanPoints     : grid size, default 13, capped at MAX_SCAN_POINTS
    forceThreshold : inner-relaxation fmax in eV/Å, default 0.05
    maxOptSteps    : BFGS steps allowed per point, default 60
    wallClockBudget: seconds, default 240
    """
    from ase.optimize import BFGS

    _require_calculator(atoms, "The scan structure")
    _require_size(atoms, MAX_ATOMS_SCAN, "Relaxed coordinate scan")

    warn: list[str] = list(warnings or [])
    ref_data = dict(ref_data or {})
    eff: dict[str, Any] = dict(effective_params or {})
    calc_start = time.time() if calc_start is None else calc_start
    budget = _Budget(_resolve_budget(params.get("wallClockBudget")))

    kind, indices = _validate_coordinate(atoms, params)
    targets = _scan_grid(params)
    fmax = _positive_float(params.get("forceThreshold"), DEFAULT_SCAN_FMAX, "forceThreshold")
    max_steps = _positive_int(
        params.get("maxOptSteps"), DEFAULT_SCAN_STEPS, "maxOptSteps",
        MAX_SCAN_STEPS_PER_POINT,
    )
    unit = "Å" if kind == "bond" else "deg"
    tolerance = SCAN_BOND_TOLERANCE_A if kind == "bond" else SCAN_ANGLE_TOLERANCE_DEG

    # FixInternals projects out the six global translation/rotation directions
    # when it adjusts forces (constraints.py:1139-1196). For an isolated
    # molecule that is right. Under PBC a rigid rotation of the cell contents
    # is not a symmetry, so the rotational part of that projection removes
    # three directions that are physically real.
    mic = bool(atoms.pbc.any())
    if mic:
        warn.append(
            "Periodic structure: FixInternals projects out global rotations when it "
            "adjusts forces, which is not a symmetry of a periodic cell. The scanned "
            "coordinate is still held exactly, but the relaxation of the remaining "
            "degrees of freedom is over-constrained by three rotational directions. "
            "Angle and dihedral targets are also set without the minimum-image "
            "convention (ASE's set_angle/set_dihedral have no mic argument), so a "
            "molecule wrapped across a cell boundary must be unwrapped first."
        )

    work = atoms
    set_coordinate, how_moved = _make_coordinate_setter(work, kind, indices, mic, warn)
    measured_call = _calibrate_force_call(work)
    # 12 optimizer steps per point is the budgeting figure from MEASUREMENTS;
    # +1 for the energy/force read after the constraint is released.
    projection = _project_and_gate(
        "Relaxed coordinate scan", len(targets) * 13, measured_call, budget, warn,
    )

    eff.update({
        "calculationType": "coordinate-scan",
        "scanCoordinate": kind,
        "scanIndices": list(indices),
        "scanStart": targets[0],
        "scanEnd": targets[-1],
        "scanPoints": len(targets),
        "scanUnit": unit,
        "forceThreshold": fmax,
        "maxOptSteps": max_steps,
        "optimizer": "BFGS",
        "constraint": "FixInternals",
        "sequential": True,
        "wallClockBudget": budget.seconds,
    })

    energies: list[float] = []
    positions: list[list[list[float]]] = []
    achieved: list[float] = []
    deviations: list[float] = []
    point_converged: list[bool] = []
    point_steps: list[int] = []
    fmax_out: list[float] = []
    completed = 0
    stopped_early = False
    stop_reason: str | None = None

    with _CallCounter(work.calc) as counter:
        try:
            for target in targets:
                budget.check(f"scan point {completed + 1} of {len(targets)}")

                work.set_constraint()  # clear any constraint from the previous point
                set_coordinate(float(target))
                before = _coordinate_value(work, kind, indices, mic)
                pre_dev = _coordinate_deviation(kind, before, float(target))
                if abs(pre_dev) > tolerance:
                    # The geometry move failed to reach the target, so the
                    # constraint would have to drag it there and the "relaxed
                    # energy at target" would not be at the target at all.
                    raise ValueError(
                        f"Could not place the {kind} {list(indices)} at {target:.4f} {unit} "
                        f"before relaxing: the geometry ended up at {before:.4f} {unit} "
                        f"({pre_dev:+.2e} {unit} off). Nothing further was computed."
                    )

                work.set_constraint(_make_constraint(kind, indices, float(target), mic))
                opt = BFGS(work, logfile=None)
                # ASE's Optimizer.run() returns True only when fmax was reached
                # (optimize.py:490-506). Discarding it here would mean a scan
                # point that hit the step ceiling looked identical to a relaxed
                # one, and the barrier read off the profile would be wrong by
                # however much relaxation was left undone.
                converged = bool(opt.run(fmax=fmax, steps=max_steps))
                work.set_constraint()

                energy = float(work.get_potential_energy())
                forces = np.asarray(work.get_forces())
                after = _coordinate_value(work, kind, indices, mic)
                dev = _coordinate_deviation(kind, after, float(target))

                energies.append(energy)
                positions.append(work.get_positions().tolist())
                achieved.append(after)
                deviations.append(dev)
                point_converged.append(converged)
                point_steps.append(int(opt.nsteps))
                fmax_out.append(
                    float(np.linalg.norm(forces, axis=1).max()) if len(forces) else 0.0
                )
                completed += 1
        except BudgetExceeded as exc:
            stopped_early = True
            stop_reason = str(exc)
        finally:
            work.set_constraint()

    force_calls = counter.count

    if not energies:
        raise ValueError(
            f"Relaxed coordinate scan produced no points: {stop_reason or 'unknown'}. "
            f"Nothing was computed."
        )

    # ── Did the constraint actually hold? ────────────────────────────────────
    # The classic failure mode of a relaxed scan is a constraint that silently
    # slips, producing a smooth-looking profile of energies at coordinate values
    # nobody asked for. The deviation is measured at every point, reported at
    # every point, and warned about when it exceeds tolerance — the alternative,
    # trusting FixInternals because it usually works, is exactly the assumption
    # this check exists to remove.
    worst = max(range(len(deviations)), key=lambda i: abs(deviations[i]))
    worst_dev = deviations[worst]
    constraint_held = abs(worst_dev) <= tolerance
    if not constraint_held:
        warn.append(
            f"Constraint slipped: at point {worst} the {kind} was {achieved[worst]:.6f} "
            f"{unit} against a target of {targets[worst]:.6f} {unit} "
            f"({worst_dev:+.3e} {unit}, tolerance {tolerance:g} {unit}). The energy at "
            f"that point is NOT the energy at the requested coordinate value."
        )

    unconverged = [i for i, ok in enumerate(point_converged) if not ok]
    if unconverged:
        warn.append(
            f"{len(unconverged)} of {completed} scan points hit the {max_steps}-step "
            f"BFGS ceiling without reaching fmax {fmax} eV/Å (points "
            f"{unconverged[:8]}{'…' if len(unconverged) > 8 else ''}). Those points are "
            f"not relaxed minima at their constrained value, so the barrier read off "
            f"this profile is an upper bound at best."
        )
    if stopped_early:
        warn.append(
            f"Scan stopped early: {stop_reason}. {completed} of {len(targets)} points "
            f"were computed; the profile is partial and its maximum is not necessarily "
            f"the barrier."
        )

    e_arr = np.asarray(energies)
    i_max = int(np.argmax(e_arr))
    i_min = int(np.argmin(e_arr))
    barrier = float(e_arr[i_max] - e_arr[i_min])
    # The endpoint-relative barrier is the one a chemist usually wants when the
    # scan runs minimum → maximum → minimum; it is reported alongside, not
    # instead of, the range, because for a monotonic scan they differ.
    barrier_from_first = float(e_arr[i_max] - e_arr[0])

    eff.update({
        "scanPointsCompleted": completed,
        "constraintHeld": constraint_held,
        "maxCoordinateDeviation": float(worst_dev),
        "allPointsConverged": not unconverged,
        "forceCalls": force_calls,
    })

    profile = {
        "x": [float(t) for t in targets[:completed]],
        "xLabel": f"{kind} {list(indices)}",
        "xUnit": unit,
        "xAchieved": achieved,
        "y": [float(e - e_arr.min()) for e in energies],
        "yAbsolute": energies,
        "yUnit": "eV",
        "yLabel": "energy relative to the lowest point on the profile",
    }

    scan_block = {
        "coordinate": kind,
        "indices": list(indices),
        "unit": unit,
        "targets": [float(t) for t in targets],
        "achieved": achieved,
        "deviations": deviations,
        "deviationTolerance": tolerance,
        "constraintHeld": constraint_held,
        "worstDeviationIndex": worst,
        "pointConverged": point_converged,
        "pointSteps": point_steps,
        "pointMaxForce": fmax_out,
        "pointsRequested": len(targets),
        "pointsCompleted": completed,
        "stoppedEarly": stopped_early,
        "stopReason": stop_reason,
        "maxIndex": i_max,
        "minIndex": i_min,
        "barrierEv": barrier,
        "barrierKcalPerMol": barrier * _KCAL_PER_EV,
        "barrierKjPerMol": barrier * _KJ_PER_EV,
        "barrierFromFirstPointEv": barrier_from_first,
        "displacementMethod": how_moved,
        "sequential": True,
        "hysteresisNote": (
            "Each point starts from the previous point's relaxed geometry. Where the "
            "surface bifurcates, scanning the range in the opposite direction can give "
            "a different branch."
        ),
        "budget": {**projection, "actualForceCalls": force_calls,
                   "elapsedSeconds": round(budget.elapsed, 1)},
    }

    msg = (
        f"Relaxed {kind} scan of {list(indices)} for {filename}: {completed} of "
        f"{len(targets)} points from {targets[0]:.3f} to {targets[-1]:.3f} {unit}, "
        f"BFGS to fmax {fmax} eV/Å at each point. Barrier (profile max − profile min) "
        f"{barrier:.4f} eV = {barrier * _KCAL_PER_EV:.3f} kcal/mol = "
        f"{barrier * _KJ_PER_EV:.3f} kJ/mol. Constraint deviation at worst "
        f"{worst_dev:+.2e} {unit}"
        f"{' (WITHIN' if constraint_held else ' (EXCEEDS'} the {tolerance:g} {unit} "
        f"tolerance). {force_calls} MACE force calls in {budget.elapsed:.1f} s."
    )

    # The reported geometry is the HIGHEST point on the profile — the barrier
    # top is the chemically interesting structure and it keeps scan, NEB and IRC
    # consistent about what the top-level positions/energy/forces mean. Every
    # geometry is in trajectory.positions, indexed the same as profile.x.
    work.set_positions(np.asarray(positions[i_max]))
    top_energy = float(work.get_potential_energy())
    top_forces = np.asarray(work.get_forces())

    trajectory = {
        "energies": energies,
        "positions": positions,
        "step": list(range(completed)),
        "reactionCoordinate": [float(t) for t in targets[:completed]],
        "reactionCoordinateUnit": unit,
    }

    result = _build_result(
        work, top_energy, top_forces, msg, calc_start, ref_data, eff,
        trajectory=trajectory, warnings=warn or None, manifest=manifest,
    )
    result["profile"] = profile
    result["scan"] = scan_block
    result["converged"] = bool(constraint_held and not unconverged and not stopped_early)
    result["reportedFrameIndex"] = i_max
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 2. NUDGED ELASTIC BAND
# ─────────────────────────────────────────────────────────────────────────────


def _check_correspondence(reactant, product) -> None:
    """
    Refuse a band whose endpoints are not the same molecule in the same order.

    ase.mep.neb.BaseNEB does check atomic numbers (neb.py:301-304) and raises
    'Images have atoms in different orders'. That check runs after the images
    have been built and its message says nothing about WHICH atom, which is the
    only thing that lets a user fix it. More importantly it is a check on Z
    only: two structures can pass it and still be a mismatched mapping if the
    permutation happens to preserve the element sequence, which is exactly what
    happens when a product is rebuilt from SMILES or re-exported by a different
    program. Element-by-element is the minimum; the count and PBC checks below
    catch the rest.

    A silently mismatched NEB does not crash. It interpolates one molecule into
    a scrambled copy of itself, climbs to the top of an artefact, and returns a
    confident barrier for a reaction that does not exist.
    """
    if len(reactant) != len(product):
        raise ValueError(
            f"NEB endpoints have different atom counts: reactant has {len(reactant)}, "
            f"product has {len(product)}. A band requires a one-to-one atom mapping. "
            f"Nothing was computed."
        )
    r_sym = reactant.get_chemical_symbols()
    p_sym = product.get_chemical_symbols()
    mismatched = [i for i, (a, b) in enumerate(zip(r_sym, p_sym)) if a != b]
    if mismatched:
        show = mismatched[:6]
        detail = ", ".join(
            f"index {i}: reactant {r_sym[i]}, product {p_sym[i]}" for i in show
        )
        raise ValueError(
            f"NEB endpoints do not correspond atom-for-atom: {len(mismatched)} of "
            f"{len(reactant)} positions hold different elements ({detail}"
            f"{', …' if len(mismatched) > len(show) else ''}). The product must list "
            f"its atoms in the same order as the reactant — reorder it, or export both "
            f"from the same program. Nothing was computed: a mismatched band returns a "
            f"confident barrier for a reaction that never happened."
        )
    if list(reactant.pbc) != list(product.pbc):
        raise ValueError(
            f"NEB endpoints have different boundary conditions: reactant pbc="
            f"{list(reactant.pbc)}, product pbc={list(product.pbc)}."
        )
    if reactant.pbc.any():
        if not np.allclose(reactant.get_cell(), product.get_cell(), atol=1e-8):
            raise ValueError(
                "NEB endpoints have different cells. ASE's NEB does not implement a "
                "variable cell in periodic directions (neb.py:307-312), so the two "
                "endpoints must share one lattice."
            )


def _relax_endpoint(atoms, label: str, fmax: float, steps: int,
                    budget: _Budget) -> dict:
    """
    Relax an endpoint, or confirm it did not need it.

    An unrelaxed endpoint makes the barrier meaningless in a specific way: the
    forward barrier is measured from E(reactant), so residual strain in the
    reactant subtracts directly from the number reported as the activation
    energy. This does not refuse — refusing would make the feature unusable for
    anyone who has not already run a separate geometry-opt — it relaxes and
    records exactly what it did, including the energy the relaxation recovered.
    """
    from ase.optimize import BFGS

    before_energy = float(atoms.get_potential_energy())
    before_fmax = float(np.linalg.norm(atoms.get_forces(), axis=1).max())
    record = {
        "label": label,
        "initialMaxForce": before_fmax,
        "initialEnergy": before_energy,
        "threshold": fmax,
    }
    if before_fmax <= fmax:
        record.update({
            "relaxed": False,
            "converged": True,
            "steps": 0,
            "finalMaxForce": before_fmax,
            "finalEnergy": before_energy,
            "energyRecovered": 0.0,
            "note": "already at or below the endpoint force threshold",
        })
        return record

    budget.check(f"{label} endpoint relaxation")
    opt = BFGS(atoms, logfile=None)
    converged = bool(opt.run(fmax=fmax, steps=steps))
    after_energy = float(atoms.get_potential_energy())
    after_fmax = float(np.linalg.norm(atoms.get_forces(), axis=1).max())
    record.update({
        "relaxed": True,
        "converged": converged,
        "steps": int(opt.nsteps),
        "finalMaxForce": after_fmax,
        "finalEnergy": after_energy,
        "energyRecovered": before_energy - after_energy,
        "note": (
            "auto-relaxed before the band was built"
            if converged else
            "auto-relaxation hit the step ceiling and did NOT converge"
        ),
    })
    return record


def _path_lengths(images, mic_cell=None, mic_pbc=None) -> list[float]:
    """Cumulative Cartesian path length along the band, in Å."""
    from ase.geometry import find_mic

    lengths = [0.0]
    for i in range(len(images) - 1):
        d = images[i + 1].get_positions() - images[i].get_positions()
        if mic_pbc is not None and np.any(mic_pbc):
            d, _ = find_mic(d, mic_cell, mic_pbc)
        lengths.append(lengths[-1] + float(np.sqrt((d ** 2).sum())))
    return lengths


def run_neb(
    reactant,
    product,
    params: dict,
    *,
    filename: str = "structure",
    calc_start: float | None = None,
    ref_data: dict | None = None,
    effective_params: dict | None = None,
    warnings: Sequence[str] | None = None,
    manifest: dict | None = None,
) -> dict:
    """
    Climbing-image nudged elastic band between two relaxed endpoints.

    Protocol, in order, and each step is here because leaving it out produces a
    plausible wrong number rather than an error:

    1.  Atom-for-atom correspondence check (see _check_correspondence).
    2.  Endpoint relaxation. Checked, and auto-relaxed with the relaxation
        recorded in the result rather than refused.
    3.  One-off rigid-body alignment of the product onto the reactant with
        `minimize_rotation_and_translation`. Without it, a product that is the
        same conformer rotated in space interpolates through a path whose
        "barrier" is the cost of rotating the molecule. Done ONCE, before
        interpolation, rather than through NEB's own
        `remove_rotation_and_translation=True`: that flag re-aligns every image
        against its neighbour at every force call, which moves the last image,
        which would invalidate the cached endpoint energies below.
    4.  IDPP interpolation (Smidstrup et al., J. Chem. Phys. 140, 214106 (2014))
        rather than a straight line. Costs no MACE calls — IDPP optimises
        against its own pair potential — and starts the band far from the
        atom-overlap geometries a linear interpolation produces.
    5.  TWO PHASES. Phase 1 relaxes the plain band to a loose fmax; phase 2
        turns on `neb.climb` and tightens to the target. This is the standard
        CI-NEB protocol (Henkelman, Uberuaga & Jónsson, J. Chem. Phys. 113,
        9901 (2000)) and the order is not cosmetic: the climbing image is
        chosen as the current highest-energy image, so switching climb on
        before the band has found the right region promotes whichever image
        happens to be highest in a badly-interpolated band and drives it up a
        ridge that is not the saddle.
    6.  Convergence flags from BOTH phases, kept and reported. An unconverged
        band is not a barrier.

    Two implementation choices worth stating:

    *   `allow_shared_calculator=True`, with ONE MACE calculator on every
        interior image. NEB's default insists each image own a calculator
        (neb.py:424-433); with a foundation model that would mean N copies of
        the weights in a 16 GB Space for no benefit, because a serial band
        evaluates images one at a time anyway and an ASE calculator recomputes
        whenever the positions it is handed differ from its cache.
    *   FIRE for the band, not BFGS. `_run_geometry_opt` is BFGS-only and stays
        that way; this is a different force field. The NEB force is the true
        force with its tangential component replaced by a spring term, and it
        is not the gradient of any scalar function — so BFGS's secant condition,
        which assumes exactly that, has no justification here. FIRE is damped
        MD and assumes nothing. Measured on NH3 inversion, BFGS was ~2× cheaper
        and gave the same barrier to 0.002 kJ/mol; FIRE is used anyway, because
        a slow correct band costs seconds and a diverged one costs a wrong
        answer that looks fine.

    Params
    ------
    nebImages       : total images including both endpoints, default 7
    forceThreshold  : climbing-phase fmax in eV/Å, default 0.05
    maxOptSteps     : total optimizer steps across both phases, default 100
    springConstant  : eV/Å², default 0.1
    endpointFmax    : force an endpoint must meet before use, default 0.05
    interpolation   : "idpp" (default) or "linear"
    wallClockBudget : seconds, default 240
    """
    from ase.build.rotate import minimize_rotation_and_translation
    from ase.calculators.singlepoint import SinglePointCalculator
    from ase.mep import NEB
    from ase.optimize import FIRE
    from ase.utils.forcecurve import fit_raw

    _require_calculator(reactant, "The reactant")
    _require_size(reactant, MAX_ATOMS_NEB, "NEB")
    _check_correspondence(reactant, product)

    warn: list[str] = list(warnings or [])
    ref_data = dict(ref_data or {})
    eff: dict[str, Any] = dict(effective_params or {})
    calc_start = time.time() if calc_start is None else calc_start
    budget = _Budget(_resolve_budget(params.get("wallClockBudget")))

    calc = reactant.calc
    nimages = _positive_int(params.get("nebImages"), DEFAULT_NEB_IMAGES,
                            "nebImages", MAX_NEB_IMAGES)
    if nimages < 3:
        raise ValueError(
            "nebImages must be at least 3: two endpoints and at least one interior "
            "image. With fewer there is nothing to optimise and no barrier to find."
        )
    fmax = _positive_float(params.get("forceThreshold"), DEFAULT_NEB_FMAX, "forceThreshold")
    total_steps = _positive_int(params.get("maxOptSteps"), DEFAULT_NEB_OPT_STEPS,
                                "maxOptSteps", MAX_NEB_OPT_STEPS)
    spring_k = _positive_float(params.get("springConstant"), DEFAULT_NEB_SPRING_K,
                               "springConstant")
    endpoint_fmax = _positive_float(params.get("endpointFmax"), DEFAULT_ENDPOINT_FMAX,
                                    "endpointFmax")
    interpolation = str(params.get("interpolation") or "idpp").strip().lower()
    if interpolation not in ("idpp", "linear"):
        raise ValueError(
            f"Unsupported interpolation '{interpolation}'. Supported: idpp, linear."
        )

    # 40/60 split. The climbing phase gets the larger share because it starts
    # from a band that is already close and then has to drive one image up a
    # ridge, which is the slower half in every case measured.
    steps_band = max(1, int(round(0.4 * total_steps)))
    steps_climb = max(1, total_steps - steps_band)
    # Phase 1 target: 5× the final fmax, floor 0.10 eV/Å. Loose on purpose —
    # phase 1 only has to put the band in the right valley.
    fmax_band = max(5.0 * fmax, 0.10)

    # Both endpoints are copied: this routine relaxes and rigid-body-aligns
    # them, and doing that to the caller's Atoms objects in place would leave
    # the two structures the user uploaded quietly changed underneath them.
    reactant = reactant.copy()
    reactant.calc = calc
    product = product.copy()
    product.calc = calc

    measured_call = _calibrate_force_call(reactant)
    projected = (nimages - 2) * total_steps + 2 * 30
    projection = _project_and_gate("NEB", projected, measured_call, budget, warn)

    endpoint_records: list[dict] = []
    images: list | None = None
    opt_band = None
    opt_climb = None
    converged_band = False
    converged_climb = False
    steps_band_used = 0
    steps_climb_used = 0
    stopped_early = False
    stop_reason: str | None = None

    with _CallCounter(calc) as counter:
        try:
            endpoint_records.append(
                _relax_endpoint(reactant, "reactant", endpoint_fmax,
                                DEFAULT_ENDPOINT_STEPS, budget)
            )
            endpoint_records.append(
                _relax_endpoint(product, "product", endpoint_fmax,
                                DEFAULT_ENDPOINT_STEPS, budget)
            )
            for rec in endpoint_records:
                if rec["relaxed"] and not rec["converged"]:
                    warn.append(
                        f"The {rec['label']} endpoint was above the {endpoint_fmax} eV/Å "
                        f"threshold and its auto-relaxation did NOT converge "
                        f"({rec['finalMaxForce']:.4f} eV/Å after {rec['steps']} BFGS "
                        f"steps). Barriers measured from it are not activation energies."
                    )
                elif rec["relaxed"]:
                    warn.append(
                        f"The {rec['label']} endpoint was not relaxed on input "
                        f"({rec['initialMaxForce']:.4f} eV/Å > {endpoint_fmax} eV/Å) and "
                        f"was auto-relaxed in {rec['steps']} BFGS steps, lowering its "
                        f"energy by {rec['energyRecovered']:.4f} eV. The barriers below "
                        f"are measured from the RELAXED endpoints."
                    )

            e_r = float(reactant.get_potential_energy())
            f_r = np.asarray(reactant.get_forces())
            # Align AFTER relaxation: relaxing can rotate a molecule slightly.
            minimize_rotation_and_translation(reactant, product)
            e_p = float(product.get_potential_energy())
            f_p = np.asarray(product.get_forces())

            images = [reactant.copy() for _ in range(nimages - 1)] + [product.copy()]
            for image in images[1:-1]:
                image.calc = calc
            # Endpoints never move during a NEB (BaseNEB.set_positions only
            # touches images[1:-1]), so freezing their already-computed energy
            # and forces onto a SinglePointCalculator makes the two endpoint
            # evaluations that `improvedtangent` needs on EVERY iteration free
            # instead of two more MACE calls per step.
            images[0].calc = SinglePointCalculator(images[0], energy=e_r, forces=f_r)
            images[-1].calc = SinglePointCalculator(images[-1], energy=e_p, forces=f_p)

            neb = NEB(
                images,
                k=spring_k,
                climb=False,
                # 'improvedtangent' is the upwinding tangent of Henkelman &
                # Jónsson, J. Chem. Phys. 113, 9978 (2000). ASE's default
                # 'aseneb' uses the plain bisector tangent, which kinks when
                # adjacent images differ a lot in energy — precisely the region
                # near a saddle. It also never evaluates the endpoint energies
                # (neb.py:435-437), leaving neb.energies[0] and [-1] as
                # uninitialised np.empty garbage.
                method="improvedtangent",
                allow_shared_calculator=True,
            )
            neb.interpolate(method=interpolation, apply_constraint=False)

            budget.check("NEB phase 1")
            # The observer runs after every accepted optimizer step
            # (Dynamics.irun -> call_observers, optimize.py:342-357) and is not
            # wrapped in a try, so raising here unwinds out of run() with the
            # band left at a complete, freshly-stepped geometry — which is
            # exactly the partial result worth returning.
            opt_band = FIRE(neb, logfile=None)
            opt_band.attach(lambda: budget.check("NEB phase 1"))
            converged_band = bool(opt_band.run(fmax=fmax_band, steps=steps_band))
            steps_band_used = int(opt_band.nsteps)

            neb.climb = True
            opt_climb = FIRE(neb, logfile=None)
            opt_climb.attach(lambda: budget.check("NEB phase 2 (climbing image)"))
            converged_climb = bool(opt_climb.run(fmax=fmax, steps=steps_climb))
            steps_climb_used = int(opt_climb.nsteps)
        except BudgetExceeded as exc:
            stopped_early = True
            stop_reason = str(exc)
            converged_climb = False
            if opt_band is not None:
                steps_band_used = int(opt_band.nsteps)
            if opt_climb is not None:
                steps_climb_used = int(opt_climb.nsteps)
            if images is None:
                raise ValueError(
                    f"NEB stopped before a band existed: {stop_reason}. Nothing was "
                    f"computed."
                ) from exc

    force_calls = counter.count

    energies = np.array([float(im.get_potential_energy()) for im in images])
    forces = [np.asarray(im.get_forces()) for im in images]
    i_ts = int(np.argmax(energies))
    path = _path_lengths(images, images[0].get_cell(), images[0].pbc)

    forward = float(energies[i_ts] - energies[0])
    reverse = float(energies[i_ts] - energies[-1])
    reaction_energy = float(energies[-1] - energies[0])

    # ── Is this actually converged? ──────────────────────────────────────────
    # Two independent checks, because ASE's own answer is not sufficient on its
    # own. `NEB.get_residual()` (neb.py:540-548) is built from `self.residuals`,
    # and the climbing image's residual is deliberately NOT appended to that
    # list (neb.py:518-533) — so any optimizer that converges on get_residual()
    # ignores the force on the one image whose energy IS the barrier. FIRE and
    # BFGS go through Optimizable.converged(), which uses the raw force array
    # and therefore does include it; NEBOptimizer does not. Rather than depend
    # on which optimizer is wired up, the force on the climbing image is read
    # back here and checked directly.
    ts_is_interior = 0 < i_ts < len(images) - 1
    ts_fmax = (
        float(np.linalg.norm(forces[i_ts], axis=1).max()) if ts_is_interior else float("nan")
    )
    ts_force_ok = bool(ts_is_interior and ts_fmax <= fmax)
    converged = bool(converged_band and converged_climb and ts_force_ok and not stopped_early)

    if not ts_is_interior:
        warn.append(
            f"The highest-energy image is image {i_ts}, which is an ENDPOINT. There is "
            f"no barrier on this path: the band is monotonic, so either the reaction is "
            f"barrierless at this level of theory or one endpoint is not a minimum."
        )
    elif not ts_force_ok:
        warn.append(
            f"The climbing image still carries {ts_fmax:.4f} eV/Å, above the {fmax} eV/Å "
            f"target. The reported barrier is an estimate from an unconverged saddle, "
            f"not a converged transition state."
        )
    if not converged_band:
        warn.append(
            f"NEB phase 1 (plain band) did not reach its loose target of "
            f"{fmax_band:.3f} eV/Å in {steps_band_used}/{steps_band} FIRE steps, so the "
            f"climbing phase started from a band that had not settled."
        )
    if not converged_climb and not stopped_early:
        warn.append(
            f"NEB phase 2 (climbing image) did not converge to {fmax} eV/Å in "
            f"{steps_climb_used}/{steps_climb} FIRE steps. An unconverged band is not a "
            f"barrier — raise maxOptSteps or loosen forceThreshold and re-run."
        )
    if stopped_early:
        warn.append(
            f"NEB stopped early: {stop_reason}. The band below is the state the "
            f"optimizer had reached, not a converged minimum-energy path."
        )

    # ASE's spline fit through energies AND forces. Reported alongside the raw
    # image maximum because with a converged climbing image the raw maximum IS
    # the barrier, while the fit can overshoot it; a disagreement between the
    # two is a useful signal that the band is under-resolved.
    try:
        fit = fit_raw(list(energies), forces, [im.get_positions() for im in images],
                      images[0].get_cell(), images[0].pbc)
        fit_barrier = float(max(fit.fit_energies))
        fit_block = {
            "path": [float(x) for x in fit.fit_path],
            "energies": [float(y) for y in fit.fit_energies],
            "barrierEv": fit_barrier,
        }
    except Exception as exc:  # noqa: BLE001 — a failed cosmetic fit must not fail a run
        fit_block = {"unavailableReason": f"{type(exc).__name__}: {exc}"}
        fit_barrier = float("nan")

    eff.update({
        "calculationType": "neb",
        "nebImages": nimages,
        "forceThreshold": fmax,
        "maxOptSteps": total_steps,
        "springConstant": spring_k,
        "endpointFmax": endpoint_fmax,
        "interpolation": interpolation,
        "nebMethod": "improvedtangent",
        "climbingImage": True,
        "optimizer": "FIRE",
        "converged": converged,
        "wallClockBudget": budget.seconds,
        "forceCalls": force_calls,
    })

    profile = {
        "x": [float(p) for p in path],
        "xLabel": "reaction coordinate (cumulative path length)",
        "xUnit": "Å",
        "y": [float(e - energies[0]) for e in energies],
        "yAbsolute": [float(e) for e in energies],
        "yUnit": "eV",
        "yLabel": "energy relative to the reactant",
        "fit": fit_block,
    }

    neb_block = {
        "nImages": nimages,
        "transitionStateImage": i_ts,
        "transitionStateMaxForce": ts_fmax,
        "transitionStateForceConverged": ts_force_ok,
        "forwardBarrierEv": forward,
        "reverseBarrierEv": reverse,
        "reactionEnergyEv": reaction_energy,
        "forwardBarrierKcalPerMol": forward * _KCAL_PER_EV,
        "reverseBarrierKcalPerMol": reverse * _KCAL_PER_EV,
        "reactionEnergyKcalPerMol": reaction_energy * _KCAL_PER_EV,
        "forwardBarrierKjPerMol": forward * _KJ_PER_EV,
        "reverseBarrierKjPerMol": reverse * _KJ_PER_EV,
        "reactionEnergyKjPerMol": reaction_energy * _KJ_PER_EV,
        "splineFitBarrierEv": fit_barrier,
        "pathLengthA": float(path[-1]),
        "reactionCoordinateA": [float(p) for p in path],
        "imageMaxForce": [float(np.linalg.norm(f, axis=1).max()) for f in forces],
        "phase1": {"target": fmax_band, "converged": converged_band,
                   "steps": steps_band_used, "allowed": steps_band},
        "phase2": {"target": fmax, "converged": converged_climb,
                   "steps": steps_climb_used, "allowed": steps_climb, "climb": True},
        "endpoints": endpoint_records,
        "stoppedEarly": stopped_early,
        "stopReason": stop_reason,
        "budget": {**projection, "actualForceCalls": force_calls,
                   "elapsedSeconds": round(budget.elapsed, 1)},
    }

    status = "CONVERGED" if converged else "DID NOT CONVERGE"
    msg = (
        f"CI-NEB {status} for {filename}: {nimages} images, {interpolation} "
        f"interpolation, phase 1 {steps_band_used}/{steps_band} FIRE steps to "
        f"{fmax_band:.3f} eV/Å, phase 2 (climbing) {steps_climb_used}/{steps_climb} steps "
        f"to {fmax} eV/Å. Forward barrier {forward:.4f} eV = "
        f"{forward * _KCAL_PER_EV:.3f} kcal/mol = {forward * _KJ_PER_EV:.3f} kJ/mol; "
        f"reverse {reverse * _KCAL_PER_EV:.3f} kcal/mol; reaction energy "
        f"{reaction_energy * _KCAL_PER_EV:.3f} kcal/mol. Saddle at image {i_ts} of "
        f"{nimages - 1}, {path[i_ts]:.3f} Å along a {path[-1]:.3f} Å path, carrying "
        f"{ts_fmax:.4f} eV/Å. {force_calls} MACE force calls in {budget.elapsed:.1f} s."
    )

    ts_atoms = images[i_ts]
    trajectory = {
        "energies": [float(e) for e in energies],
        "positions": [im.get_positions().tolist() for im in images],
        "step": list(range(nimages)),
        "reactionCoordinate": [float(p) for p in path],
        "reactionCoordinateUnit": "Å",
    }

    result = _build_result(
        ts_atoms, float(energies[i_ts]), forces[i_ts], msg, calc_start, ref_data, eff,
        trajectory=trajectory, warnings=warn or None, manifest=manifest,
    )
    result["profile"] = profile
    result["neb"] = neb_block
    result["converged"] = converged
    result["reportedFrameIndex"] = i_ts
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 3. INTRINSIC REACTION COORDINATE
# ─────────────────────────────────────────────────────────────────────────────
#
# ASE has no IRC. Verified against the installed source, not from memory:
# ase/mep/__init__.py exports NEB, NEBTools, DyNEB, AutoNEB, interpolate,
# idpp_interpolate, SingleCalculatorNEB, DimerControl, MinModeAtoms and
# MinModeTranslate — and nothing else. `grep -rn "intrinsic reaction"` over
# ase 3.27.0 returns nothing, and the only file with "irc" in its name is
# ase/test/calculator/gaussian/test_optimizer_irc.py, which tests passing
# Gaussian's own `irc` keyword through to Gaussian. So this is implemented
# here.
#
# ALGORITHM: damped velocity Verlet in mass-weighted Cartesian coordinates, in
# the spirit of H. P. Hratchian and H. B. Schlegel, "Following reaction
# pathways using a damped classical trajectory algorithm", J. Phys. Chem. A
# 106, 165 (2002). The IRC itself is Fukui's steepest-descent path in
# mass-weighted coordinates (K. Fukui, Acc. Chem. Res. 14, 363 (1981)); DVV
# approximates it with a classical trajectory whose velocity is rescaled to a
# small constant magnitude at every step, so the trajectory stays in the
# low-kinetic-energy limit where it coincides with the steepest-descent path.
#
# ONE DELIBERATE DEVIATION from the published algorithm, and it is the reason
# this works at all: the velocity is rescaled at BOTH the half step and the
# full step, not only the full step. Rescaling only the full step leaves the
# half-step velocity v + a·Δt/2 unbounded, so the Cartesian displacement grows
# with the gradient and the trajectory diverges as soon as it reaches a steep
# region. Measured: with full-step damping alone and Δt = 5 fs the ethane
# trajectory climbed +30 eV in 37 steps and reported a small final gradient
# because the molecule had come apart. Damping the half step makes the
# displacement exactly v0·Δt per step, which turns the integrator into a
# constant-arc-length follower with velocity-Verlet direction smoothing —
# bounded by construction and, measured, insensitive to Δt: Δt = 0.5 fs and
# Δt = 1.0 fs gave the same path length (1.150 √amu·Å) and the same terminal
# energy to five decimals.
#
# What this buys over plain steepest descent, measured on the same system:
# constant-arc-length steepest descent zig-zagged (successive step directions
# reversing by up to 177°) and stalled at |g| = 0.09 eV/(√amu·Å) after 400
# steps; DVV descended MONOTONICALLY and reached |g| = 0.019 in 115.
#
# What it does NOT do: it is a first-order path follower. It cuts corners on
# sharply curved paths at finite Δs, and it does not implement the higher-order
# correctors (LQA, Gonzalez–Schlegel, or Hratchian–Schlegel's own Hessian-based
# stabilisation) that would fix that, because each of those wants a Hessian
# along the path and this has to fit in 2 vCPU. The arc length per step is
# reported so the error can be judged, and the turning angle between successive
# steps is monitored and warned about.


def _hessian(atoms, warn: list[str]) -> tuple[np.ndarray, str]:
    """
    Cartesian second-derivative matrix d²E/dR², eV/Å², shape (3N, 3N).

    Prefers MACE's analytic Hessian: `MACECalculator.get_hessian()` runs one
    second-order backward pass (mace/calculators/mace.py:558-578) where central
    differences need 6N force calls. Verified against a central-difference
    Hessian on ethane at δ = 0.01 Å: max absolute difference 0.012 eV/Å²
    against a matrix whose largest element is 55 eV/Å², i.e. 2.2e-4 relative —
    the same size as the finite-difference truncation error, so the two agree
    to the accuracy of the reference.

    Falls back to central differences when the calculator has no analytic
    Hessian. That is not a silent fallback: which one ran is returned and ends
    up in the result.
    """
    n = len(atoms)
    calc = atoms.calc
    getter = getattr(calc, "get_hessian", None)
    if callable(getter):
        try:
            raw = np.asarray(getter(atoms), dtype=float)
            if raw.size != (3 * n) ** 2:
                raise ValueError(
                    f"analytic Hessian has {raw.size} elements, expected {(3 * n) ** 2}"
                )
            hess = raw.reshape(3 * n, 3 * n)
            return 0.5 * (hess + hess.T), "analytic (MACECalculator.get_hessian)"
        except Exception as exc:  # noqa: BLE001
            warn.append(
                f"The analytic Hessian was unavailable ({type(exc).__name__}: {exc}); "
                f"fell back to central differences, which costs {6 * n} extra force calls."
            )

    delta = 0.01  # Å — ASE's own Vibrations default
    hess = np.zeros((3 * n, 3 * n))
    origin = atoms.get_positions().copy()
    try:
        for i in range(n):
            for j in range(3):
                for sign in (1, -1):
                    pos = origin.copy()
                    pos[i, j] += sign * delta
                    atoms.set_positions(pos)
                    hess[3 * i + j] += -sign * atoms.get_forces().ravel() / (2 * delta)
    finally:
        atoms.set_positions(origin)
    return 0.5 * (hess + hess.T), f"central differences, delta={delta} Å, {6 * n} force calls"


def _eckart_projector(atoms) -> tuple[np.ndarray, int]:
    """
    Projector onto the internal (vibrational) subspace of mass-weighted space.

    Removes the three rigid translations and — for a non-periodic system only —
    the three rigid rotations. Under PBC a rigid rotation of the cell contents
    is not a symmetry of the Hamiltonian, so projecting it out would delete
    three real directions; there only translations are removed.

    Projecting matters for the imaginary-mode count. Translations are exactly
    zero-frequency by translational invariance whatever the geometry, but the
    rotational eigenvalues are only zero AT a stationary point; away from one
    they mix with the gradient and can come out negative, which would be
    counted as extra imaginary modes and reject a perfectly good saddle. The
    number of directions actually removed is returned (a linear molecule has
    only two rotations, and the SVD below drops the null one on its own).
    """
    masses = atoms.get_masses()
    n = len(atoms)
    sqrt_m = np.sqrt(masses)
    positions = atoms.get_positions()
    com = (masses[:, None] * positions).sum(axis=0) / masses.sum()
    displaced = positions - com

    vectors = []
    for axis in range(3):
        trans = np.zeros((n, 3))
        trans[:, axis] = sqrt_m
        vectors.append(trans.ravel())
    if not atoms.pbc.any():
        for axis in range(3):
            unit = np.zeros(3)
            unit[axis] = 1.0
            rot = sqrt_m[:, None] * np.cross(np.tile(unit, (n, 1)), displaced)
            vectors.append(rot.ravel())

    stacked = np.column_stack(vectors)
    u, s, _ = np.linalg.svd(stacked, full_matrices=False)
    if s.size == 0 or s.max() <= 0:
        return np.eye(3 * n), 0
    keep = u[:, s > 1e-8 * s.max()]
    return np.eye(3 * n) - keep @ keep.T, int(keep.shape[1])


def _normal_modes(atoms, hess: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """
    Diagonalise the Eckart-projected mass-weighted Hessian.

    Returns (frequencies_cm, eigenvalues, mass_weighted_eigenvectors, n_removed).
    Frequencies are signed: an imaginary mode is reported as a NEGATIVE
    wavenumber, which is the universal convention in the quantum-chemistry
    output a chemist will compare against.

    The eV-per-sqrt(eigenvalue) constant is ASE's own
    (`ase/vibrations/data.py:314`), so a frequency printed here and one printed
    by `ase.vibrations` for the same Hessian agree exactly.
    """
    from ase import units

    masses = atoms.get_masses()
    weights = np.repeat(masses ** -0.5, 3)
    mass_weighted = weights[:, None] * hess * weights[None, :]
    projector, n_removed = _eckart_projector(atoms)
    mass_weighted = projector @ mass_weighted @ projector

    eigenvalues, eigenvectors = np.linalg.eigh(mass_weighted)
    conversion = units._hbar * units.m / math.sqrt(units._e * units._amu)
    energies = conversion * np.sqrt(eigenvalues.astype(complex))
    # Signed wavenumbers: real modes positive, imaginary modes negative.
    wavenumbers = np.where(energies.imag > 0, -energies.imag, energies.real) / units.invcm
    return np.real(wavenumbers), eigenvalues, eigenvectors, n_removed


def _validate_transition_state(atoms, params: dict, warn: list[str]) -> dict:
    """
    Refuse to start an IRC from anything that is not a first-order saddle.

    Two conditions, both necessary:

    *   The gradient must vanish. An IRC is defined as the steepest-descent
        path FROM a stationary point; started anywhere else it just rolls
        downhill from an arbitrary geometry and produces a curve that looks
        exactly like a reaction path and is not one.
    *   Exactly one imaginary frequency. Zero means a minimum (the "path" would
        be noise). Two or more means a higher-order saddle, where the
        steepest-descent path is not unique and following the most negative
        mode is a choice, not a result.

    Both are hard refusals. This is the one place in this module where getting
    it wrong produces output that is not merely inaccurate but meaningless
    while looking completely normal.
    """
    ts_fmax_target = _positive_float(
        params.get("tsForceThreshold"), TS_STATIONARY_FMAX, "tsForceThreshold"
    )
    forces = np.asarray(atoms.get_forces())
    ts_fmax = float(np.linalg.norm(forces, axis=1).max()) if len(forces) else 0.0
    if ts_fmax > ts_fmax_target:
        raise ValueError(
            f"The supplied structure is not a stationary point: its largest force is "
            f"{ts_fmax:.5f} eV/Å, above the {ts_fmax_target} eV/Å threshold an IRC "
            f"requires. An IRC is the steepest-descent path FROM a saddle point; from a "
            f"non-stationary geometry it is just a downhill roll that happens to look "
            f"like a reaction path. Locate and tighten the transition state first "
            f"(a CI-NEB saddle is a starting guess, not a converged TS). Nothing was "
            f"computed."
        )

    hess, hess_source = _hessian(atoms, warn)
    wavenumbers, eigenvalues, eigenvectors, n_removed = _normal_modes(atoms, hess)

    imaginary = np.where(wavenumbers < -IMAGINARY_FREQUENCY_CUTOFF_CM)[0]
    n_imag = int(imaginary.size)
    expected_modes = 3 * len(atoms) - n_removed

    if n_imag == 0:
        raise ValueError(
            f"The supplied structure has NO imaginary frequency below "
            f"-{IMAGINARY_FREQUENCY_CUTOFF_CM:g} cm⁻¹ (lowest mode "
            f"{wavenumbers.min():.1f} cm⁻¹), so it is a minimum, not a transition state. "
            f"There is no reaction coordinate to follow. Hessian source: {hess_source}. "
            f"Nothing was computed."
        )
    if n_imag > 1:
        listed = ", ".join(f"{wavenumbers[i]:.1f}" for i in imaginary[:6])
        raise ValueError(
            f"The supplied structure has {n_imag} imaginary frequencies ({listed} cm⁻¹), "
            f"so it is a higher-order saddle, not a first-order transition state. The "
            f"steepest-descent path from it is not unique and following the most "
            f"negative mode would be an arbitrary choice presented as a result. "
            f"Re-optimise to a first-order saddle. Hessian source: {hess_source}. "
            f"Nothing was computed."
        )

    index = int(imaginary[0])
    if index != int(np.argmin(eigenvalues)):  # pragma: no cover — defensive
        raise ValueError(
            "Internal inconsistency: the single imaginary mode is not the lowest "
            "eigenvalue of the projected Hessian. Nothing was computed."
        )

    return {
        "maxForce": ts_fmax,
        "maxForceThreshold": ts_fmax_target,
        "hessianSource": hess_source,
        "degreesOfFreedomRemoved": n_removed,
        "modeCount": expected_modes,
        "frequenciesCm": [float(x) for x in np.sort(wavenumbers)],
        "nImaginary": n_imag,
        "imaginaryFrequencyCm": float(wavenumbers[index]),
        "imaginaryModeIndex": index,
        "imaginaryCutoffCm": IMAGINARY_FREQUENCY_CUTOFF_CM,
        "_mode": eigenvectors[:, index],
    }


def _dvv_irc(atoms, mode_mw: np.ndarray, sign: int, *, arc_step: float,
             timestep: float, displacement: float, gradient_tol: float,
             max_steps: int, budget: _Budget) -> dict:
    """
    One direction of the IRC. See the ALGORITHM note above the section.

    Coordinates are mass-weighted Cartesians x = √m · R, in √amu·Å; the
    mass-weighted gradient is g = -F/√m in eV/(√amu·Å). `timestep` is in the
    natural time unit √(amu·Å²/eV) ≈ 10.18 fs; the speed is fixed at
    v0 = arc_step / timestep so that every step advances exactly `arc_step` of
    mass-weighted arc length.
    """
    masses = atoms.get_masses()
    sqrt_m = np.repeat(np.sqrt(masses), 3)
    speed = arc_step / timestep

    def evaluate(x_mw: np.ndarray) -> tuple[np.ndarray, float]:
        atoms.set_positions((x_mw / sqrt_m).reshape(-1, 3))
        gradient = -np.asarray(atoms.get_forces()).ravel() / sqrt_m
        return gradient, float(atoms.get_potential_energy())

    x = atoms.get_positions().ravel() * sqrt_m + sign * displacement * mode_mw
    gradient, energy = evaluate(x)
    velocity = sign * speed * mode_mw.copy()

    energies = [energy]
    arc = [0.0]
    grad_norms = [float(np.linalg.norm(gradient))]
    positions = [atoms.get_positions().tolist()]
    total_arc = 0.0
    max_turn = 0.0
    previous_direction: np.ndarray | None = None
    monotonic = True
    reason = "step ceiling"
    converged = False

    for step in range(max_steps):
        budget.check(f"IRC ({'forward' if sign > 0 else 'reverse'}) step {step + 1}")

        acceleration = -gradient
        half = velocity + 0.5 * acceleration * timestep
        norm = np.linalg.norm(half)
        if norm <= 0:  # pragma: no cover — only at an exact stationary point
            reason = "velocity vanished"
            break
        # THE deviation from published DVV: damping the half step is what
        # bounds |Δx| to arc_step per step. See the ALGORITHM note.
        half *= speed / norm
        direction = half / np.linalg.norm(half)

        x_next = x + half * timestep
        gradient_next, energy_next = evaluate(x_next)

        velocity = half + 0.5 * (-gradient_next) * timestep
        norm = np.linalg.norm(velocity)
        if norm > 0:
            velocity *= speed / norm

        if previous_direction is not None:
            cosine = float(np.clip(np.dot(direction, previous_direction), -1.0, 1.0))
            max_turn = max(max_turn, math.degrees(math.acos(cosine)))
        previous_direction = direction

        total_arc += float(np.linalg.norm(x_next - x))
        if energy_next > energy + 1e-9:
            monotonic = False
        x, gradient, energy = x_next, gradient_next, energy_next

        energies.append(energy)
        arc.append(total_arc)
        grad_norms.append(float(np.linalg.norm(gradient)))
        positions.append(atoms.get_positions().tolist())

        if grad_norms[-1] < gradient_tol:
            converged = True
            reason = "mass-weighted gradient below tolerance"
            break

    return {
        "direction": "forward" if sign > 0 else "reverse",
        "converged": converged,
        "stopReason": reason,
        "steps": len(energies) - 1,
        "energies": energies,
        "arcLength": arc,
        "gradientNorms": grad_norms,
        "positions": positions,
        "totalArcLength": total_arc,
        "energyDropEv": float(energies[0] - energies[-1]),
        "finalGradientNorm": grad_norms[-1],
        "maxTurnDeg": max_turn,
        "energyMonotonic": monotonic,
    }


def run_irc(
    atoms,
    params: dict,
    *,
    filename: str = "structure",
    calc_start: float | None = None,
    ref_data: dict | None = None,
    effective_params: dict | None = None,
    warnings: Sequence[str] | None = None,
    manifest: dict | None = None,
) -> dict:
    """
    Intrinsic reaction coordinate downhill from a transition state.

    The input MUST be a converged first-order saddle: gradient below
    `tsForceThreshold` (default 0.005 eV/Å) and exactly one imaginary frequency
    below -50 cm⁻¹ after Eckart projection. Both are checked before any path is
    followed and both are hard refusals — see `_validate_transition_state`.

    Params
    ------
    tsForceThreshold : eV/Å the TS must already satisfy, default 0.005
    ircStep          : mass-weighted arc length per step, √amu·Å, default 0.01
    ircSteps         : steps per direction, default 200, capped at 300
    ircTimeStep      : natural time units (×10.18 fs), default 0.1
    ircDisplacement  : initial kick along the imaginary mode, √amu·Å, default 0.10
    ircGradientTol   : mass-weighted gradient norm to stop at, default 0.02
    relaxTermini     : relax each terminus to a real minimum afterwards, default True
    wallClockBudget  : seconds, default 240
    """
    from ase.optimize import BFGS

    _require_calculator(atoms, "The transition-state structure")
    _require_size(atoms, MAX_ATOMS_IRC, "IRC")

    warn: list[str] = list(warnings or [])
    ref_data = dict(ref_data or {})
    eff: dict[str, Any] = dict(effective_params or {})
    calc_start = time.time() if calc_start is None else calc_start
    budget = _Budget(_resolve_budget(params.get("wallClockBudget")))

    arc_step = _positive_float(params.get("ircStep"), DEFAULT_IRC_STEP, "ircStep")
    max_steps = _positive_int(params.get("ircSteps"), DEFAULT_IRC_STEPS, "ircSteps",
                              MAX_IRC_STEPS_PER_DIRECTION)
    timestep = _positive_float(params.get("ircTimeStep"), DEFAULT_IRC_TIMESTEP,
                               "ircTimeStep")
    displacement = _positive_float(params.get("ircDisplacement"),
                                   DEFAULT_IRC_INITIAL_DISPLACEMENT, "ircDisplacement")
    gradient_tol = _positive_float(params.get("ircGradientTol"),
                                   DEFAULT_IRC_GRADIENT_TOL, "ircGradientTol")
    relax_termini = params.get("relaxTermini")
    relax_termini = True if relax_termini is None else bool(relax_termini)

    if atoms.pbc.any():
        warn.append(
            "Periodic structure: rigid rotations are not a symmetry of a cell, so only "
            "the three translations were projected out of the Hessian. The mode count "
            "is 3N-3 rather than 3N-6 and near-zero librational modes may sit close to "
            "the imaginary cutoff."
        )

    measured_call = _calibrate_force_call(atoms)
    # One Hessian (6N force calls if the analytic one is unavailable — the
    # pessimistic branch, deliberately) plus both directions.
    projection = _project_and_gate(
        "IRC", 6 * len(atoms) + 2 * max_steps + 40, measured_call, budget, warn,
    )

    ts_positions = atoms.get_positions().copy()
    ts_energy = float(atoms.get_potential_energy())
    ts_forces = np.asarray(atoms.get_forces())

    with _CallCounter(atoms.calc) as counter:
        validation = _validate_transition_state(atoms, params, warn)
        mode_mw = np.asarray(validation.pop("_mode"), dtype=float)
        mode_mw = mode_mw / np.linalg.norm(mode_mw)

        stopped_early = False
        stop_reason: str | None = None
        branches: list[dict] = []
        work = atoms.copy()
        work.calc = atoms.calc
        for sign in (+1, -1):
            work.set_positions(ts_positions)
            try:
                branches.append(_dvv_irc(
                    work, mode_mw, sign, arc_step=arc_step, timestep=timestep,
                    displacement=displacement, gradient_tol=gradient_tol,
                    max_steps=max_steps, budget=budget,
                ))
            except BudgetExceeded as exc:
                stopped_early = True
                stop_reason = str(exc)
                break

        # Relax each terminus. The IRC stops when the mass-weighted gradient
        # falls below tolerance, which is inside the product basin but not at
        # its bottom; without this the "product energy" is short of the real
        # minimum by whatever the tolerance allows. Reported separately from the
        # IRC terminus so the two are never confused.
        if relax_termini and not stopped_early:
            for branch in branches:
                work.set_positions(np.asarray(branch["positions"][-1]))
                try:
                    budget.check(f"{branch['direction']} terminus relaxation")
                    opt = BFGS(work, logfile=None)
                    ok = bool(opt.run(fmax=DEFAULT_ENDPOINT_FMAX, steps=DEFAULT_ENDPOINT_STEPS))
                    branch["relaxedTerminus"] = {
                        "converged": ok,
                        "steps": int(opt.nsteps),
                        "energy": float(work.get_potential_energy()),
                        "maxForce": float(np.linalg.norm(work.get_forces(), axis=1).max()),
                        "positions": work.get_positions().tolist(),
                    }
                except BudgetExceeded as exc:
                    stopped_early = True
                    stop_reason = str(exc)
                    branch["relaxedTerminus"] = {"unavailableReason": str(exc)}
                    break

    force_calls = counter.count

    if len(branches) < 2:
        warn.append(
            f"Only the {branches[0]['direction'] if branches else 'first'} direction was "
            f"followed before the budget ran out: {stop_reason}. An IRC with one branch "
            f"connects the saddle to one basin and says nothing about the other."
        )

    for branch in branches:
        if not branch["converged"]:
            warn.append(
                f"The {branch['direction']} IRC branch stopped at "
                f"|g| = {branch['finalGradientNorm']:.4f} eV/(√amu·Å) after "
                f"{branch['steps']} steps ({branch['stopReason']}) without reaching the "
                f"{gradient_tol} tolerance. It had not arrived in the product basin."
            )
        if not branch["energyMonotonic"]:
            warn.append(
                f"The {branch['direction']} IRC branch did NOT descend monotonically. A "
                f"steepest-descent path cannot go uphill, so the step size "
                f"({arc_step} √amu·Å) is too large for the curvature here — reduce "
                f"ircStep and re-run."
            )
        if branch["maxTurnDeg"] > 60.0:
            warn.append(
                f"The {branch['direction']} IRC branch turned by up to "
                f"{branch['maxTurnDeg']:.0f}° between consecutive steps. A first-order "
                f"follower cuts corners on a path that curves this fast; reduce ircStep "
                f"if the path shape matters as well as the endpoints."
            )
    if stopped_early:
        warn.append(f"IRC stopped early: {stop_reason}. The path below is partial.")

    # ── Assemble a single left-to-right path: reverse branch, TS, forward ────
    reverse = next((b for b in branches if b["direction"] == "reverse"), None)
    forward = next((b for b in branches if b["direction"] == "forward"), None)

    coordinates: list[float] = []
    energies: list[float] = []
    positions: list[list[list[float]]] = []
    if reverse is not None:
        for s, e, p in zip(reversed(reverse["arcLength"]), reversed(reverse["energies"]),
                           reversed(reverse["positions"])):
            coordinates.append(-float(s) - displacement)
            energies.append(float(e))
            positions.append(p)
    ts_frame_index = len(coordinates)
    coordinates.append(0.0)
    energies.append(ts_energy)
    positions.append(ts_positions.tolist())
    if forward is not None:
        for s, e, p in zip(forward["arcLength"], forward["energies"],
                           forward["positions"]):
            coordinates.append(float(s) + displacement)
            energies.append(float(e))
            positions.append(p)

    e_arr = np.asarray(energies)
    forward_drop = float(ts_energy - e_arr[-1])
    reverse_drop = float(ts_energy - e_arr[0])
    reaction_energy = float(e_arr[-1] - e_arr[0])

    eff.update({
        "calculationType": "irc",
        "ircStep": arc_step,
        "ircSteps": max_steps,
        "ircTimeStep": timestep,
        "ircTimeStepFs": timestep * _TIME_UNIT_FS,
        "ircDisplacement": displacement,
        "ircGradientTol": gradient_tol,
        "tsForceThreshold": validation["maxForceThreshold"],
        "algorithm": "damped velocity Verlet (mass-weighted), half-step damped",
        "hessianSource": validation["hessianSource"],
        "relaxTermini": relax_termini,
        "wallClockBudget": budget.seconds,
        "forceCalls": force_calls,
    })

    converged = bool(
        len(branches) == 2
        and all(b["converged"] for b in branches)
        and all(b["energyMonotonic"] for b in branches)
        and not stopped_early
    )

    profile = {
        "x": coordinates,
        "xLabel": "intrinsic reaction coordinate (mass-weighted arc length)",
        "xUnit": "√amu·Å",
        "y": [float(e - e_arr.min()) for e in energies],
        "yAbsolute": energies,
        "yUnit": "eV",
        "yLabel": "energy relative to the lowest point on the path",
    }

    irc_block = {
        "transitionState": {
            "energy": ts_energy,
            "maxForce": validation["maxForce"],
            "maxForceThreshold": validation["maxForceThreshold"],
            "nImaginary": validation["nImaginary"],
            "imaginaryFrequencyCm": validation["imaginaryFrequencyCm"],
            "frequenciesCm": validation["frequenciesCm"],
            "degreesOfFreedomRemoved": validation["degreesOfFreedomRemoved"],
            "imaginaryCutoffCm": validation["imaginaryCutoffCm"],
            "hessianSource": validation["hessianSource"],
        },
        "algorithm": (
            "damped velocity Verlet in mass-weighted Cartesian coordinates, after "
            "Hratchian & Schlegel, J. Phys. Chem. A 106, 165 (2002); the IRC itself is "
            "Fukui's steepest-descent path, Acc. Chem. Res. 14, 363 (1981). The velocity "
            "is rescaled to a constant speed at both the half and the full step, which "
            "is a deviation from the published algorithm — see the ALGORITHM note in "
            "reaction_paths.py."
        ),
        "branches": [
            {k: v for k, v in b.items() if k not in ("positions", "energies", "arcLength",
                                                     "gradientNorms")}
            for b in branches
        ],
        "forwardEnergyDropEv": forward_drop,
        "reverseEnergyDropEv": reverse_drop,
        "reactionEnergyEv": reaction_energy,
        "forwardEnergyDropKcalPerMol": forward_drop * _KCAL_PER_EV,
        "reverseEnergyDropKcalPerMol": reverse_drop * _KCAL_PER_EV,
        "reactionEnergyKcalPerMol": reaction_energy * _KCAL_PER_EV,
        "relaxedTermini": [b.get("relaxedTerminus") for b in branches],
        "stoppedEarly": stopped_early,
        "stopReason": stop_reason,
        "budget": {**projection, "actualForceCalls": force_calls,
                   "elapsedSeconds": round(budget.elapsed, 1)},
    }

    status = "COMPLETED" if converged else "DID NOT FULLY CONVERGE"
    msg = (
        f"IRC {status} for {filename}: transition state verified with exactly one "
        f"imaginary frequency at {validation['imaginaryFrequencyCm']:.1f} cm⁻¹ "
        f"(max force {validation['maxForce']:.5f} eV/Å, Hessian from "
        f"{validation['hessianSource']}). Followed downhill in both directions by damped "
        f"velocity Verlet in mass-weighted coordinates, Δs = {arc_step} √amu·Å. Reverse "
        f"branch dropped {reverse_drop * _KCAL_PER_EV:.3f} kcal/mol over "
        f"{abs(coordinates[0]):.2f} √amu·Å; forward branch dropped "
        f"{forward_drop * _KCAL_PER_EV:.3f} kcal/mol over {coordinates[-1]:.2f} √amu·Å; "
        f"reaction energy {reaction_energy * _KCAL_PER_EV:.3f} kcal/mol. "
        f"{force_calls} MACE force calls in {budget.elapsed:.1f} s."
    )

    # The reported geometry is the transition state, at s = 0.
    atoms.set_positions(ts_positions)
    trajectory = {
        "energies": energies,
        "positions": positions,
        "step": list(range(len(energies))),
        "reactionCoordinate": coordinates,
        "reactionCoordinateUnit": "√amu·Å",
    }

    result = _build_result(
        atoms, ts_energy, ts_forces, msg, calc_start, ref_data, eff,
        trajectory=trajectory, warnings=warn or None, manifest=manifest,
    )
    result["profile"] = profile
    result["irc"] = irc_block
    result["converged"] = converged
    result["reportedFrameIndex"] = ts_frame_index
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch
# ─────────────────────────────────────────────────────────────────────────────


def validate_reaction_path_type(raw: Any) -> str:
    """
    Normalise a reaction-path calculation type, or raise.

    Mirrors calculate.validate_calculation_type(): a value that is present but
    not implemented raises rather than quietly running something else. There is
    NO default — unlike a plain calculation, there is no sensible reaction path
    to fall back to.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError(
            f"Invalid reaction-path calculationType: expected one of "
            f"{', '.join(SUPPORTED_REACTION_PATH_TYPES)}, got {raw!r}."
        )
    value = raw.strip()
    if value not in SUPPORTED_REACTION_PATH_TYPES:
        raise ValueError(
            f"Unsupported reaction-path calculationType '{value}'. Supported: "
            f"{', '.join(SUPPORTED_REACTION_PATH_TYPES)}."
        )
    return value


def run_reaction_path(calc_type: str, atoms, params: dict, *, product=None, **bookkeeping):
    """
    Single entry point for the dispatcher in calculate.py.

    `product` is required for, and only for, "neb". Passing it to a scan or an
    IRC is an error rather than an ignored argument: silently dropping a second
    structure the user uploaded would compute a different calculation from the
    one they asked for.
    """
    resolved = validate_reaction_path_type(calc_type)

    if resolved == "neb":
        if product is None:
            raise ValueError(
                "A NEB needs two structures. Supply the product geometry as `product`; "
                "its atoms must be listed in the same order as the reactant's."
            )
        return run_neb(atoms, product, params, **bookkeeping)

    if product is not None:
        raise ValueError(
            f"A '{resolved}' calculation takes a single structure, but a product "
            f"geometry was supplied. Only 'neb' uses two. Nothing was computed."
        )

    if resolved == "coordinate-scan":
        return run_coordinate_scan(atoms, params, **bookkeeping)
    if resolved == "irc":
        return run_irc(atoms, params, **bookkeeping)

    # Unreachable — validate_reaction_path_type() gates this. Kept so that
    # adding a type to SUPPORTED_REACTION_PATH_TYPES without a handler fails
    # loudly instead of returning None.
    raise ValueError(f"No handler implemented for reaction-path type '{resolved}'")
