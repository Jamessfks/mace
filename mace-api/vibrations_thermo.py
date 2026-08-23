"""
Harmonic vibrational analysis and ideal-gas thermochemistry for SimpleAtom.

Self-contained module. Nothing in calculate.py, main.py or calculate_local.py
is imported from here and nothing here is imported by them yet — the dispatch
is wired separately against the contract below.

CONTRACT
--------
    run_vibrational_analysis(atoms, params, *, filename, ref_data,
                             effective_params, warnings, manifest) -> dict

`atoms` must be an `ase.Atoms` with a MACE calculator ALREADY ATTACHED. The
returned dict matches the shape produced by `calculate._build_result()` —
same keys, same units (energy eV, forces eV/Å, positions Å), plus two new
top-level sections, `vibrations` and `thermochemistry`. It is JSON-serialisable
with no custom encoder: every value is a str/int/float/bool/None/list/dict.

WHAT THIS COMPUTES
------------------
1. Harmonic frequencies by finite displacement (`ase.vibrations.Vibrations`),
   reported in cm^-1, with the 6 (or 5, if linear) translational/rotational
   modes SEPARATED from the 3N-6 (or 3N-5) genuine vibrations. Linearity is
   determined from the moments of inertia, not assumed.
2. Imaginary frequencies, reported as negative numbers AND flagged with an
   explicit boolean, never dropped and never shown as positive.
3. Zero-point energy, from the genuine real modes only.
4. Ideal-gas thermochemistry (`ase.thermochemistry.IdealGasThermo`): U, H, S, G.
5. Normal-mode Cartesian eigenvectors, pre-scaled for browser animation.
6. IR intensities ONLY when the attached calculator can really produce a
   dipole moment. It cannot, for every model SimpleAtom currently ships — see
   IR_UNAVAILABLE_EVIDENCE below. The honest result is frequencies with
   `intensities: null`, not a spectrum with fabricated numbers.

WHAT IT REFUSES
---------------
* A structure that is not at a stationary point (max force above
  `fmaxTolerance`, default 0.005 eV/Å) — unless `optimizeFirst` is set, in
  which case it relaxes first and records the before/after fmax.
* A calculator running in float32 (see FLOAT64 note below).
* A periodic cell. Γ-point phonons of a crystal are a different calculation:
  there are 3 acoustic modes and no rotations, and ideal-gas translational and
  rotational entropy is meaningless for a solid.
* Constrained atoms — `ase.vibrations` silently drops FixAtoms indices from the
  Hessian, which invalidates the 3N-6 counting and the thermochemistry.
* More atoms than the cost gate allows (see CPU BUDGET below).

FLOAT64
-------
This module requires float64 and refuses float32 by default (override:
`params["allowFloat32"] = True`, which produces a loud warning and a flag in
the result). This is a **SimpleAtom convention, not an upstream MACE rule** —
upstream states no dtype requirement for Hessian work and
`MACECalculator.get_hessian()` has no dtype guard at all. The reason is local
and empirical: a central-difference Hessian divides a force *difference* by
2*delta = 0.02 Å. In float32 the ~1e-7 relative representation error on forces
of order 1 eV/Å becomes a ~1e-5 eV/Å² floor on Hessian elements, which is a
few cm^-1 of noise on a stiff mode and tens of cm^-1 on a soft one — exactly
where the low-frequency modes that dominate the vibrational entropy live.
`mace_off()` already defaults to float64; `mace_mp()` defaults to float32, so
a materials-model caller must ask for float64 explicitly.

FINITE-DIFFERENCE SCHEME (and its cost)
---------------------------------------
Central differences, `delta = 0.01 Å`, `nfree = 2`. Cost: **6N force
evaluations plus 1 at the equilibrium geometry** — ASE evaluates the
undisplaced point too (`Vibrations.displacements()` yields `eq` first). A
9-atom molecule is therefore 55 MACE force calls, not 54.

Why central and not forward: forward differences cost 3N+1 instead of 6N+1,
but their error is O(delta) rather than O(delta^2), and they lean on the
equilibrium forces being exactly zero. Ours are only guaranteed below
`fmaxTolerance` (0.005 eV/Å), so the residual gradient contaminates every
forward-difference Hessian row. Central differences cancel both the residual
gradient and the leading cubic anharmonicity. Halving the cost is not worth
losing the ability to say the frequencies are converged.

Why delta = 0.01 Å: the total error is (truncation ~ delta^2 * quartic term)
plus (noise ~ epsilon / delta). MACE forces are analytic autograd gradients, so
in float64 epsilon is ~1e-10 eV/Å rather than the ~1e-4 typical of an SCF code;
the noise term is negligible and delta can be small. 0.01 Å is ASE's default,
is small enough that the quartic truncation is sub-cm^-1 on stiff modes, and
was checked directly: on MACE-OFF23(small) water, delta = 0.005 / 0.01 / 0.02 Å
move every fundamental by less than 1 cm^-1 (see test_vibrations_thermo.py,
`test_delta_convergence`). `nfree = 4` (5-point, 12N+1 evaluations) is
available via params but is not the default — it buys nothing measurable here.

One consequence of finite differences is reported rather than hidden: the
translational and rotational modes come out at tens of cm^-1 instead of
exactly zero. See TR_RESIDUAL_RELATIVE_WARN below for the measured scaling and
why that is expected. It is why the mode classification here uses subspace
projection rather than "drop the six smallest frequencies".

CPU BUDGET
----------
Two gates, because a fixed atom count cannot know what CPU it landed on.

* Static: `MAX_ATOMS` (50). Documented, overridable via `params["maxAtoms"]`
  with a warning.
* Dynamic and self-calibrating: the entry force evaluation needed for the fmax
  check is TIMED, and the run is refused up front if
  (6N+1) * t_force > `params["timeBudgetSeconds"]` (default 240 s).

Measured with MACE-OFF23(small), float64, on the development machine
(Apple Silicon, `torch.set_num_threads(2)`), median over repeated evaluations:

      N     t_force      6N+1     projected wall time
      3     0.022 s        19       0.4 s   (water)
      5     0.008 s        31       0.3 s   (methane)
      9     0.046 s        55       2.5 s   (ethanol)
     18     0.023 s       109       2.6 s   (naphthalene)
     32     0.039 s       193       7.5 s   (n-decane)
     62     0.072 s       373      26.8 s   (n-icosane)
     74     0.095 s       445      42.4 s   (cholesterol)
     92     0.105 s       553      57.9 s   (n-triacontane)

So on that machine ~90 atoms fit a 60 s budget at 2 threads (~76 atoms at 1
thread). The free Hugging Face Space is 2 shared vCPU of an older x86 part,
which cannot be benchmarked from here; assuming the usual ~3x per-core
slowdown puts the 60 s budget nearer 25-30 atoms.

MAX_ATOMS is therefore set to 50 rather than 90. The ceiling case was then run
end to end rather than interpolated — n-hexadecane, C16H34, exactly 50 atoms,
relaxed to fmax < 0.001 eV/Å:

    303 force evaluations, 0.0479 s each measured, 18.8 s wall clock,
    144 vibrational modes, 0 imaginary, lowest mode 9.9 cm^-1.

Under the 3x assumption that is about a minute on the Space, which is the
right shape for a web request. The dynamic gate is what actually protects a
slow box, because it measures the real hardware instead of trusting this
table; the static ceiling exists so a UI can state a limit before anything is
uploaded.

IR INTENSITIES
--------------
See IR_UNAVAILABLE_EVIDENCE. Short version: `ase.vibrations.Infrared` needs
`calc.get_dipole_moment(atoms)`, and the MACECalculator that `mace_mp()` and
`mace_off()` build does not have one. The capability is probed at runtime, not
assumed, so a dipole-capable model would light the feature up on its own.
"""

import math
import os
import shutil
import tempfile
import time
from typing import Any

# The dispatcher in calculate.py should add this string to
# SUPPORTED_CALCULATION_TYPES and route it here, rather than hardcoding it.
CALCULATION_TYPE = "vibrations"

# ── Defaults ────────────────────────────────────────────────────────────────

# Standard-state temperature.
DEFAULT_TEMPERATURE_K = 298.15

# Standard-state pressure, in Pa. 101325 Pa is 1 atm — the reference state used
# by Gaussian and by most tabulated thermochemistry. It is NOT 1 bar: 1 bar is
# exactly 100000 Pa, which is the IUPAC standard state and the value
# `IdealGasThermo.referencepressure` is fixed at. ASE applies the correction
# itself (S_p = -kB*ln(P/1 bar)), so both are handled correctly; the only thing
# that matters is that the result says which one was used. At 298.15 K the
# difference is -kB*ln(1.01325) = -3.4e-7 eV/K on S, i.e. +0.34 meV on G.
DEFAULT_PRESSURE_PA = 101325.0

# Finite-difference displacement (Å) and points per degree of freedom.
DEFAULT_DELTA_ANGSTROM = 0.01
DEFAULT_NFREE = 2

# A Hessian is only meaningful at a stationary point. CLAUDE.md fixes this at
# 0.005 eV/Å for frequency work.
DEFAULT_FMAX_TOLERANCE = 0.005
DEFAULT_MAX_OPT_STEPS = 500

# Static atom ceiling — see CPU BUDGET in the module docstring.
MAX_ATOMS = 50
DEFAULT_TIME_BUDGET_S = 240.0

# |f| below this is treated as numerical noise rather than real negative
# curvature when deciding minimum vs transition state. Both counts are
# reported, so the verdict can always be re-derived with another threshold.
DEFAULT_IMAGINARY_THRESHOLD_CM1 = 30.0

# Residual translation/rotation frequencies. These are exact zeros of the
# ANALYTIC Hessian, but not of a finite-difference one: the O(delta^2)
# truncation error is a small eigenvalue error, and frequency goes as the
# square root of the eigenvalue, so the residual scales as O(delta) — first
# order, not second. Measured on the toy X-H force field in
# test_vibrations_thermo.py, where the analytic answer is exactly zero:
#
#     delta (Å)   0.0025   0.005   0.010   0.020   0.040
#     residual    6.5      12.9    25.8    51.7    103.3   cm^-1
#
# Dead linear, as predicted. The genuine frequencies converge quadratically
# over the same range (1182.15 -> 1182.04 cm^-1, 0.1 cm^-1 in total).
#
# Measured again with MACE-OFF23(small) on real relaxed geometries (fmax <
# 0.001 eV/Å), max residual in cm^-1, and as a fraction of that molecule's
# LOWEST genuine mode:
#
#     delta (Å)          0.005          0.010          0.020
#     H2O            29.4 (0.018)   54.2 (0.033)  106.0 (0.065)
#     CH4            17.9 (0.013)   30.4 (0.023)   57.9 (0.044)
#     CH3OH          12.8 (0.045)   17.8 (0.063)   31.1 (0.108)
#     C2H6            8.4 (0.028)   20.4 (0.069)   42.4 (0.144)
#     CH3CH2OCH3      8.8 (0.079)   16.7 (0.151)   33.0 (0.304)
#
# So a flat cm^-1 threshold is the wrong instrument: water, the SMALLEST and
# best-behaved molecule here, has the LARGEST absolute residual, because the
# residual tracks the stiffness of the bonds (O-H at 3949 cm^-1) rather than
# any error. What actually matters is whether the contamination is comparable
# to the softest REAL mode, since that is the mode whose entropy contribution
# it would corrupt. Hence a relative test with an absolute backstop: 0.5 is
# more than 3x the worst ratio observed at the default delta, and 150 cm^-1 is
# above the worst absolute value observed even at delta = 0.02.
TR_RESIDUAL_RELATIVE_WARN = 0.5
TR_RESIDUAL_ABSOLUTE_WARN_CM1 = 150.0

# Peak Cartesian displacement (Å) of the animation vectors handed to the UI.
DEFAULT_ANIMATION_AMPLITUDE_ANGSTROM = 0.5

# Geometric linearity threshold: maximum perpendicular distance (Å) of any atom
# from the principal axis of smallest inertia. A genuinely linear molecule
# relaxed to fmax < 0.005 eV/Å sits at ~1e-6 Å; a bent one is at ~0.5 Å.
LINEAR_TOLERANCE_ANGSTROM = 1e-3

# Position tolerances (Å) for the rotational-symmetry search, run at all three
# so that a symmetry number that depends on how hard you squint is reported as
# unconfident rather than as fact.
SYMMETRY_TOLERANCES_ANGSTROM = (0.01, 0.05, 0.10)
DEFAULT_SYMMETRY_TOLERANCE_ANGSTROM = 0.05
# Hard stop on the (pure numpy, no MACE) symmetry search.
SYMMETRY_SEARCH_BUDGET_S = 10.0
MAX_SYMMETRY_CANDIDATE_AXES = 4000

# Evidence for the IR decision, quoted in the result so a user does not have to
# take it on faith. Read from the installed mace-torch 0.3.15.
IR_UNAVAILABLE_EVIDENCE = (
    "ase.vibrations.Infrared derives IR intensities from dipole derivatives "
    "and requires calc.get_dipole_moment(atoms). MACECalculator only adds "
    "'dipole' to implemented_properties when model_type is one of "
    "DipoleMACE / EnergyDipoleMACE / DipolePolarizabilityMACE "
    "(mace/calculators/mace.py:170-171). mace_mp() and mace_off() construct "
    "MACECalculator without passing model_type "
    "(mace/calculators/foundations_models.py:168-170 and 282-284), so it "
    "defaults to 'MACE' and implemented_properties is "
    "['energy', 'energies', 'free_energy', 'node_energy', 'forces', 'stress'] "
    "— no dipole. Verified at runtime on this deployment: "
    "calc.get_dipole_moment() raises PropertyNotImplementedError. "
    "MACE-MP-0 and MACE-OFF therefore CANNOT produce IR intensities. "
    "Frequencies are exact and reported in full; intensities are null. A "
    "stick spectrum drawn with uniform or invented intensities would be a "
    "fabrication, so none is produced."
)


# ── Small helpers ───────────────────────────────────────────────────────────


def _f(value: Any) -> float:
    """numpy scalar -> plain float, so the result stays JSON-serialisable."""
    return float(value)


def _param(params: dict, key: str, default):
    """Read a parameter, treating None and blank strings as absent."""
    if key not in params:
        return default
    raw = params[key]
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return default
    return raw


def _positive_float(params: dict, key: str, default: float) -> float:
    raw = _param(params, key, default)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {key}: expected a number, got {raw!r}.")
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"Invalid {key}: must be a finite positive number, got {value}.")
    return value


def _positive_int(params: dict, key: str, default: int) -> int:
    raw = _param(params, key, default)
    if isinstance(raw, bool):  # bool is an int subclass — reject explicitly
        raise ValueError(f"Invalid {key}: expected an integer, got a boolean.")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {key}: expected an integer, got {raw!r}.")
    if value <= 0:
        raise ValueError(f"Invalid {key}: must be a positive integer, got {value}.")
    return value


def detect_calculator_dtype(calc) -> str | None:
    """
    Report the dtype the attached model is ACTUALLY running in.

    Deliberately reads the loaded torch parameters rather than trusting any
    `precision` string the caller passed around: `MACECalculator` adopts the
    checkpoint's own dtype when `default_dtype` is empty, and converts the
    checkpoint with `.float()` / `.double()` when it is not
    (mace/calculators/mace.py:293-306). Only the parameters know the truth.

    Mirrors `calculate.detect_calculator_dtype()`; duplicated rather than
    imported so this module has no dependency on calculate.py (which will
    import THIS module once dispatch is wired, and a cycle would break both).
    Returns None when the dtype cannot be determined.
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


def dipole_capability(calc, atoms) -> tuple[bool, str]:
    """
    Decide whether real IR intensities are obtainable — by trying, not guessing.

    Two-stage on purpose. `Calculator.get_dipole_moment()` exists on every ASE
    calculator by inheritance and raises PropertyNotImplementedError, so
    `hasattr(calc, "get_dipole_moment")` is always True and is worthless as a
    capability test. The declaration in `implemented_properties` is the real
    signal; the trial call then confirms the declaration is not a lie. The
    trial costs one evaluation and only runs when the declaration is present,
    so it is free for every model SimpleAtom currently ships.

    Returns (capable, reason). `reason` is non-empty in both cases and is
    surfaced verbatim in the result.
    """
    declared = list(getattr(calc, "implemented_properties", []) or [])
    if "dipole" not in declared:
        return False, (
            f"The attached calculator ({type(calc).__name__}) does not declare "
            f"'dipole' in implemented_properties (it declares: "
            f"{', '.join(declared) if declared else 'nothing'}). "
            + IR_UNAVAILABLE_EVIDENCE
        )

    # Declared — verify it actually works before promising a spectrum.
    try:
        probe = atoms.copy()
        probe.calc = calc
        calc.get_dipole_moment(probe)
    except Exception as exc:  # noqa: BLE001 — any failure means "not capable"
        return False, (
            f"The attached calculator declares 'dipole' in "
            f"implemented_properties but calling get_dipole_moment() raised "
            f"{type(exc).__name__}: {exc}. Intensities are reported as "
            f"unavailable rather than guessed."
        )
    return True, (
        f"The attached calculator ({type(calc).__name__}) provides "
        f"get_dipole_moment(); IR intensities were computed from finite-"
        f"difference dipole derivatives via ase.vibrations.Infrared."
    )


# ── Geometry: linearity and the translation/rotation subspace ───────────────


def classify_geometry(atoms, tol: float = LINEAR_TOLERANCE_ANGSTROM) -> dict:
    """
    'monatomic' | 'linear' | 'nonlinear', from the moments of inertia.

    Never assumed from the formula or the atom count. The test is geometric and
    reportable: take the principal axis with the smallest moment of inertia and
    measure how far the furthest atom sits off that line. A linear molecule at
    a stationary point is on it to ~1e-6 Å; water is 0.52 Å off.

    Using the perpendicular distance rather than a ratio of moments keeps the
    threshold in Å, where a chemist can judge it, instead of in amu·Å² where a
    heavy near-linear molecule and a light bent one are indistinguishable. The
    moments are reported alongside so the call can be checked.
    """
    import numpy as np

    n_atoms = len(atoms)
    if n_atoms == 1:
        return {
            "geometry": "monatomic",
            "nTranslationRotation": 3,
            "momentsOfInertiaAmuA2": [0.0, 0.0, 0.0],
            "maxOffAxisDistanceAngstrom": 0.0,
            "linearToleranceAngstrom": tol,
            "borderline": False,
        }

    moments, axes = atoms.get_moments_of_inertia(vectors=True)
    order = np.argsort(moments)
    axis = axes[order[0]]
    axis = axis / np.linalg.norm(axis)

    rel = atoms.get_positions() - atoms.get_center_of_mass()
    along = rel @ axis
    perp = np.linalg.norm(rel - np.outer(along, axis), axis=1)
    max_perp = float(perp.max())

    linear = max_perp < tol
    return {
        "geometry": "linear" if linear else "nonlinear",
        "nTranslationRotation": 5 if linear else 6,
        "momentsOfInertiaAmuA2": [_f(m) for m in np.sort(moments)],
        "maxOffAxisDistanceAngstrom": max_perp,
        "linearToleranceAngstrom": tol,
        # Within a decade of the threshold either way: the classification flips
        # 3N-6 to 3N-5 and changes the rotational entropy formula, so a
        # borderline case must be said out loud rather than silently decided.
        "borderline": tol <= max_perp < 10 * tol or 0.1 * tol < max_perp < tol,
    }


def translation_rotation_basis(atoms, n_keep: int):
    """
    Orthonormal basis of the mass-weighted translation + rotation subspace.

    Columns are unit vectors in the same 3N-dimensional mass-weighted space the
    Hessian is diagonalised in, so the overlap of a normal mode with this
    subspace is a clean number in [0, 1].

    The three translations are sqrt(m_i) * e_k. The three rotations are
    sqrt(m_i) * (e_k x r_i) with r_i measured from the centre of mass — the
    displacement field of an infinitesimal rotation. For a linear molecule the
    rotation about the molecular axis produces the zero vector, so the SVD
    returns rank 5 on its own; `n_keep` (from classify_geometry) selects the
    leading singular vectors and the degenerate direction drops out.

    Returns (basis (3N, n_keep), singular values (6,)).
    """
    import numpy as np

    masses = atoms.get_masses()
    rel = atoms.get_positions() - atoms.get_center_of_mass()
    n_atoms = len(atoms)
    sqm = np.sqrt(masses)

    columns = []
    for k in range(3):
        t = np.zeros((n_atoms, 3))
        t[:, k] = sqm
        columns.append(t.ravel())
    for k in range(3):
        e = np.zeros(3)
        e[k] = 1.0
        r = np.cross(np.broadcast_to(e, (n_atoms, 3)), rel) * sqm[:, None]
        columns.append(r.ravel())

    raw = np.array(columns).T  # (3N, 6)
    u, s, _ = np.linalg.svd(raw, full_matrices=False)
    return u[:, :n_keep], s


# ── Rotational symmetry number ──────────────────────────────────────────────
#
# The rotational symmetry number sigma that IdealGasThermo needs is the ORDER
# OF THE PROPER-ROTATION SUBGROUP of the molecular point group — not the order
# of the full point group. Water is C2v (order 4) but its rotation subgroup is
# C2, so sigma = 2. Methane is Td (order 24) but its rotation subgroup is T, so
# sigma = 12. Because sigma is exactly a group order, it can be computed
# directly by finding every proper rotation that maps the molecule onto itself
# and counting them — no point-group table, no name lookup, no hardcoded 1.


def _canonical_axis(v, eps: float = 1e-9):
    """Unit vector with a deterministic sign, so +u and -u dedupe together."""
    import numpy as np

    norm = float(np.linalg.norm(v))
    if norm < eps:
        return None
    u = np.asarray(v, dtype=float) / norm
    # Largest-magnitude component made positive. Ties broken by later
    # components; exact zeros are left alone.
    for component in u:
        if abs(component) > 1e-8:
            if component < 0:
                u = -u
            break
    return u


def _candidate_axes(rel, numbers):
    """
    Every direction that could plausibly be a proper rotation axis.

    A rotation axis of a molecule passes through the centre of mass and, by
    symmetry, must be fixed by the operation. In practice it always lies along
    one of: a COM->atom vector (an atom sits on the axis), the bisector of two
    equivalent atoms (a C2 through an edge midpoint — this is how methane's
    three C2 axes are found), the normal to the plane of two atoms (a Cn
    perpendicular to a ring), or a principal axis of inertia (which catches
    anything the first three miss for a highly symmetric top).

    The closure step in `rotational_symmetry_number()` then generates any
    element this enumeration happened to miss, so a gap here costs nothing.
    """
    import numpy as np

    axes: list = []
    seen: list = []

    def add(v):
        u = _canonical_axis(v)
        if u is None:
            return
        for w in seen:
            if np.linalg.norm(u - w) < 1e-6:
                return
        seen.append(u)
        axes.append(u)

    n = len(rel)
    for i in range(n):
        add(rel[i])
    for i in range(n):
        for j in range(i + 1, n):
            if numbers[i] == numbers[j]:
                add(rel[i] + rel[j])
            add(np.cross(rel[i], rel[j]))
            if len(axes) > MAX_SYMMETRY_CANDIDATE_AXES:
                return axes
    return axes


def _rotation_matrix(axis, angle: float):
    """Rodrigues rotation by `angle` radians about the unit vector `axis`."""
    import numpy as np

    k = np.asarray(axis, dtype=float)
    kx = np.array([[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]])
    return np.eye(3) + math.sin(angle) * kx + (1 - math.cos(angle)) * (kx @ kx)


def _maps_onto_self(rot, rel, numbers, tol: float) -> bool:
    """
    True when `rot` maps every atom onto an atom of the same element, bijectively.

    The bijection check matters: without it, a rotation that collapses two
    atoms onto the same partner (and leaves a third unmatched) would pass a
    naive nearest-neighbour test and inflate sigma.
    """
    import numpy as np

    moved = rel @ rot.T
    dist = np.linalg.norm(moved[:, None, :] - rel[None, :, :], axis=-1)
    dist = np.where(numbers[:, None] == numbers[None, :], dist, np.inf)
    partner = np.argmin(dist, axis=1)
    if not np.all(dist[np.arange(len(rel)), partner] < tol):
        return False
    return len(set(partner.tolist())) == len(rel)


def _rotation_order(rot) -> int:
    """Order n of a proper rotation (rotation by 2*pi/n). Identity -> 1."""
    cos_theta = min(1.0, max(-1.0, (float(rot.trace()) - 1.0) / 2.0))
    theta = math.acos(cos_theta)
    if theta < 1e-6:
        return 1
    return int(round(2 * math.pi / theta))


def rotational_symmetry_number(atoms, tol: float, deadline: float | None = None) -> dict:
    """
    sigma = |proper-rotation subgroup|, found by exhaustive search and closure.

    Algorithm:
      1. Monatomic -> sigma is unused (S_rot = 0); return 1.
      2. Linear -> the only proper rotation other than identity and the
         (continuous, already handled analytically by the linear rotational
         partition function) axial one is the C2 perpendicular to the axis,
         which reverses the molecule. Present -> D(inf)h, sigma = 2. Absent ->
         C(inf)v, sigma = 1.
      3. Nonlinear -> enumerate candidate axes, test rotation by 2*pi/n for
         every n that could divide the orbits, then close the resulting set
         under multiplication (re-verifying each product against the actual
         geometry, so floating-point drift cannot smuggle in a fake element).
         sigma is the size of the closed set.

    `tol` is a position tolerance in Å. It is a real knob: a MACE-relaxed
    geometry is only approximately symmetric because the model itself is not
    exactly symmetric, so too tight a tolerance loses real symmetry and too
    loose a one invents it. The caller runs this at three tolerances and only
    trusts an answer that is stable across all three.
    """
    import numpy as np

    numbers = np.asarray(atoms.get_atomic_numbers())
    rel = atoms.get_positions() - atoms.get_center_of_mass()
    n_atoms = len(atoms)

    if n_atoms == 1:
        return {"symmetryNumber": 1, "group": "K", "maxAxisOrder": 0,
                "toleranceAngstrom": tol, "timedOut": False}

    geometry = classify_geometry(atoms)["geometry"]

    if geometry == "linear":
        # Build a unit vector perpendicular to the molecular axis and test the
        # C2 about it. Same code path as the general case, so the tolerance
        # means the same thing here as everywhere else.
        moments, axes_i = atoms.get_moments_of_inertia(vectors=True)
        axis = axes_i[int(np.argsort(moments)[0])]
        perp = np.cross(axis, [1.0, 0.0, 0.0])
        if np.linalg.norm(perp) < 1e-6:
            perp = np.cross(axis, [0.0, 1.0, 0.0])
        perp = perp / np.linalg.norm(perp)
        if _maps_onto_self(_rotation_matrix(perp, math.pi), rel, numbers, tol):
            return {"symmetryNumber": 2, "group": "Dinfh", "maxAxisOrder": 2,
                    "toleranceAngstrom": tol, "timedOut": False}
        return {"symmetryNumber": 1, "group": "Cinfv", "maxAxisOrder": 1,
                "toleranceAngstrom": tol, "timedOut": False}

    # --- nonlinear ---------------------------------------------------------
    timed_out = False
    generators = []
    for axis in _candidate_axes(rel, numbers):
        if deadline is not None and time.time() > deadline:
            timed_out = True
            break
        # Prune the orders worth testing. Under a Cn about this axis every atom
        # is either ON the axis (fixed) or in an orbit of exactly n atoms of the
        # same element, so n must divide the off-axis count of every element
        # present. For water this leaves n in {2}; for benzene, {2, 3, 6}.
        along = rel @ axis
        off_axis = np.linalg.norm(rel - np.outer(along, axis), axis=1) > tol
        if not off_axis.any():
            continue
        counts = [int((numbers[off_axis] == z).sum())
                  for z in np.unique(numbers[off_axis])]
        for n in range(2, n_atoms + 1):
            if any(c % n for c in counts):
                continue
            rot = _rotation_matrix(axis, 2 * math.pi / n)
            if _maps_onto_self(rot, rel, numbers, tol):
                generators.append(rot)

    # Close under multiplication. Every product is re-checked against the
    # geometry: closure is guaranteed in exact arithmetic, so a product that
    # fails the check is floating-point drift and must not be counted.
    group = [np.eye(3)]
    frontier = list(generators)
    while frontier:
        if deadline is not None and time.time() > deadline:
            timed_out = True
            break
        rot = frontier.pop()
        if any(np.allclose(rot, g, atol=1e-4) for g in group):
            continue
        if not _maps_onto_self(rot, rel, numbers, tol):
            continue
        group.append(rot)
        if len(group) > 120:  # icosahedral (I) is 60; anything above is a bug
            timed_out = True
            break
        for g in list(group):
            frontier.append(rot @ g)
            frontier.append(g @ rot)

    sigma = len(group)
    max_order = max((_rotation_order(g) for g in group), default=1)

    # Name the rotation subgroup from its order and highest axis. Reported for
    # the user's benefit only — sigma is what the thermochemistry consumes.
    if sigma == 1:
        label = "C1"
    elif sigma == max_order:
        label = f"C{max_order}"
    elif sigma == 2 * max_order:
        label = f"D{max_order}"
    elif sigma == 12 and max_order == 3:
        label = "T"
    elif sigma == 24 and max_order == 4:
        label = "O"
    elif sigma == 60 and max_order == 5:
        label = "I"
    else:
        label = f"order-{sigma}"

    return {"symmetryNumber": int(sigma), "group": label,
            "maxAxisOrder": int(max_order), "toleranceAngstrom": tol,
            "timedOut": timed_out}


def resolve_symmetry_number(atoms, params: dict, warnings: list[str]) -> dict:
    """
    Settle on the sigma the entropy will actually use, and say what it costs.

    Order of precedence:
      1. `params["symmetryNumber"]` — an explicit integer always wins.
      2. Detection at three tolerances (0.01 / 0.05 / 0.10 Å). Agreement across
         all three -> confident. Disagreement -> take the 0.05 Å answer, mark
         it unconfident, and warn.
      3. Detection failure or timeout -> sigma = 1 with a loud warning, because
         sigma = 1 is the value that makes S too LARGE and G too LOW; erring
         that way is at least the direction a reader is used to checking.

    Whatever happens, the returned dict states the sigma used, where it came
    from, and the exact numerical effect on S and G: S depends on sigma only
    through -kB*ln(sigma), so G shifts by +kB*T*ln(sigma).
    """
    from ase import units

    temperature = _positive_float(params, "temperature", DEFAULT_TEMPERATURE_K)
    explicit = _param(params, "symmetryNumber", None)

    detected: list[dict] = []
    detection_error: str | None = None
    if explicit is None:
        deadline = time.time() + SYMMETRY_SEARCH_BUDGET_S
        try:
            detected = [rotational_symmetry_number(atoms, tol, deadline)
                        for tol in SYMMETRY_TOLERANCES_ANGSTROM]
        except Exception as exc:  # noqa: BLE001 — never fail the calculation
            detection_error = f"{type(exc).__name__}: {exc}"

    if explicit is not None:
        if isinstance(explicit, bool):
            raise ValueError("Invalid symmetryNumber: expected an integer, got a boolean.")
        try:
            sigma = int(explicit)
        except (TypeError, ValueError):
            raise ValueError(
                f"Invalid symmetryNumber: expected a positive integer, got {explicit!r}."
            )
        if sigma < 1:
            raise ValueError(f"Invalid symmetryNumber: must be >= 1, got {sigma}.")
        source = "user"
        confident = True
        group = None
        agreement = None
        warnings.append(
            f"Rotational symmetry number sigma={sigma} was supplied by the caller and "
            f"used as given; no symmetry detection was run. The rotational entropy "
            f"is only correct for this sigma."
        )
    elif detection_error is not None:
        sigma, source, confident, group, agreement = 1, "fallback", False, None, None
        warnings.append(
            f"Rotational symmetry detection FAILED ({detection_error}); sigma=1 was "
            f"assumed. If the molecule has any rotational symmetry this OVERESTIMATES "
            f"the rotational entropy and UNDERESTIMATES the Gibbs free energy. Pass "
            f"params['symmetryNumber'] explicitly to fix it."
        )
    else:
        values = [d["symmetryNumber"] for d in detected]
        default_index = SYMMETRY_TOLERANCES_ANGSTROM.index(
            DEFAULT_SYMMETRY_TOLERANCE_ANGSTROM
        )
        chosen = detected[default_index]
        sigma = chosen["symmetryNumber"]
        group = chosen["group"]
        agreement = {f"{d['toleranceAngstrom']:g}A": d["symmetryNumber"] for d in detected}
        confident = len(set(values)) == 1 and not any(d["timedOut"] for d in detected)
        source = "detected"
        if any(d["timedOut"] for d in detected):
            confident = False
            warnings.append(
                f"Rotational symmetry search hit its {SYMMETRY_SEARCH_BUDGET_S:g} s "
                f"budget and may be incomplete; sigma={sigma} is a LOWER bound, so the "
                f"rotational entropy may be overestimated. Pass "
                f"params['symmetryNumber'] to override."
            )
        elif not confident:
            warnings.append(
                f"Rotational symmetry number is tolerance-dependent: {agreement}. "
                f"sigma={sigma} (the {DEFAULT_SYMMETRY_TOLERANCE_ANGSTROM} Å answer) "
                f"was used. The geometry is close to, but not exactly at, a higher "
                f"symmetry — tighten the optimisation or pass "
                f"params['symmetryNumber'] explicitly."
            )

    # The whole numerical consequence of sigma, in one place.
    delta_s = -units.kB * math.log(sigma)             # eV/K
    delta_g = -temperature * delta_s                  # eV, i.e. +kB*T*ln(sigma)
    ev_per_k_to_j_per_mol_k = units._e * units._Nav

    return {
        "symmetryNumber": int(sigma),
        "source": source,
        "confident": bool(confident),
        "rotationalSubgroup": group,
        "detectionByTolerance": agreement,
        "detectionError": detection_error,
        "effectOnEntropy": (
            f"sigma enters the entropy only as -kB*ln(sigma). At sigma={sigma} and "
            f"T={temperature:g} K it lowers S by {abs(delta_s):.3e} eV/K "
            f"({abs(delta_s) * ev_per_k_to_j_per_mol_k:.2f} J/(mol*K)) and raises G by "
            f"{delta_g:.4f} eV relative to sigma=1. Every entropy and Gibbs number "
            f"below is correct ONLY for sigma={sigma}."
        ),
        "entropyShiftEvPerK": _f(delta_s),
        "gibbsShiftEv": _f(delta_g),
    }


# ── Result assembly ─────────────────────────────────────────────────────────


def _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                  effective_params, trajectory=None, warnings=None, manifest=None):
    """
    Assemble the standard SimpleAtom result dict.

    Deliberately a local copy of `calculate._build_result()` rather than an
    import: calculate.py will import THIS module to dispatch the new
    calculation type, and importing back would be a cycle. The key set, the
    units and the "warnings are appended to the message as well as exposed as
    result['warnings']" rule are identical, and
    test_vibrations_thermo.py::test_result_shape_matches_calculate_py asserts
    that they stay identical, so the duplication cannot drift unnoticed.
    """
    symbols = [a.symbol for a in atoms]
    lattice = atoms.get_cell().tolist() if atoms.pbc.any() else None

    if warnings:
        msg = f"{msg} | Warnings: {' '.join(warnings)}"

    result = {
        "status": "success",
        "energy": _f(energy),
        "forces": forces.tolist(),
        "positions": atoms.get_positions().tolist(),
        "symbols": symbols,
        "lattice": lattice,
        "properties": {"volume": _f(atoms.get_volume()) if atoms.pbc.any() else None},
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


# ── Entry gates ─────────────────────────────────────────────────────────────


def _reject_unsupported_system(atoms) -> None:
    """Systems for which this calculation is not defined. No silent fallback."""
    if atoms.calc is None:
        raise ValueError(
            "Vibrational analysis requires an ASE calculator attached to the "
            "Atoms object (atoms.calc). None was found; nothing was computed."
        )
    if atoms.pbc.any():
        raise ValueError(
            "Vibrational analysis is implemented for isolated molecules only, "
            f"but this structure is periodic (pbc={atoms.pbc.tolist()}). The "
            "Gamma-point phonons of a periodic cell are a different "
            "calculation: there are 3 acoustic modes and no molecular "
            "rotations, and the ideal-gas translational and rotational "
            "entropy this module reports is meaningless for a solid. Strip the "
            "cell to treat it as a cluster, or use a phonon code. Nothing was "
            "computed."
        )
    if atoms.constraints:
        raise ValueError(
            f"Vibrational analysis refuses constrained structures "
            f"({len(atoms.constraints)} constraint(s) attached). "
            "ase.vibrations.Vibrations silently excludes FixAtoms indices from "
            "the Hessian, which makes the 3N-6 mode counting, the "
            "translation/rotation separation and the ideal-gas "
            "thermochemistry all wrong without saying so. Remove the "
            "constraints and re-run. Nothing was computed."
        )
    if len(atoms) < 1:
        raise ValueError("Vibrational analysis requires at least one atom.")


def _check_precision(atoms, params: dict, warnings: list[str]) -> str:
    """
    Verify the attached calculator is really running in float64.

    See the FLOAT64 note in the module docstring: this is a SimpleAtom
    convention, not an upstream MACE requirement, and the comment must not
    claim otherwise. Refuses by default; `allowFloat32` opts in loudly.
    """
    dtype = detect_calculator_dtype(atoms.calc)
    allow_float32 = bool(_param(params, "allowFloat32", False))

    # Torch's PROCESS-GLOBAL default dtype has to agree with the model's, and
    # it is not the same thing as the model's. `MACECalculator.__init__` calls
    # `torch_tools.set_default_dtype(default_dtype)` (mace/calculators/mace.py
    # :307), which mutates global state: building a float32 calculator anywhere
    # in the process leaves the global default at float32, and a float64 model
    # built EARLIER then gets float32 input tensors. The failure is a
    # RuntimeError from inside torch.matmul reading "expected m1 and m2 to have
    # the same dtype, but got: float != double", tens of frames deep, with no
    # mention of MACE or of dtype settings. Caught here instead, by name.
    if dtype is not None:
        try:
            import torch
            global_dtype = str(torch.get_default_dtype()).rsplit(".", 1)[-1]
        except Exception:  # noqa: BLE001 — torch is MACE's dependency, not ours
            global_dtype = None
        if global_dtype is not None and global_dtype != dtype:
            raise ValueError(
                f"Refusing to run: the loaded model is {dtype} but torch's "
                f"global default dtype is {global_dtype}. MACECalculator sets "
                f"that global at construction, so another calculator built "
                f"later in this process has changed it out from under this "
                f"one, and the force evaluations would fail deep inside torch "
                f"with 'expected m1 and m2 to have the same dtype'. Rebuild "
                f"the calculator immediately before this calculation. Nothing "
                f"was computed."
            )

    if dtype is None:
        warnings.append(
            "Could not determine the dtype of the attached calculator, so the "
            "float64 requirement for finite-difference Hessians could not be "
            "verified. If this ran in float32, the low-frequency modes and the "
            "vibrational entropy derived from them are unreliable."
        )
        return "unknown"

    if dtype == "float64":
        return dtype

    if not allow_float32:
        raise ValueError(
            f"Vibrational analysis requires float64, but the attached "
            f"calculator is running in {dtype}. A central-difference Hessian "
            f"divides a force difference by 2*delta = "
            f"{2 * DEFAULT_DELTA_ANGSTROM} Å, so {dtype} rounding becomes tens "
            f"of cm^-1 of noise on the soft modes that dominate the "
            f"vibrational entropy. Rebuild the calculator with "
            f"default_dtype='float64' (mace_off() already defaults to it; "
            f"mace_mp() defaults to float32 and must be told), or set "
            f"params['allowFloat32']=true to accept the noise. Nothing was "
            f"computed."
        )

    warnings.append(
        f"Running the Hessian in {dtype} because allowFloat32 was set. "
        f"Frequencies below ~500 cm^-1, the zero-point energy and every "
        f"entropy and Gibbs number derived from them carry finite-difference "
        f"rounding noise and should not be quoted."
    )
    return dtype


def _enforce_stationary_point(atoms, params: dict, warnings: list[str],
                              effective: dict) -> dict:
    """
    Refuse (or first relax) a geometry that is not at a stationary point.

    Returns the optimisation record.
    """
    import numpy as np
    from ase.optimize import BFGS

    fmax_tol = _positive_float(params, "fmaxTolerance", DEFAULT_FMAX_TOLERANCE)
    optimize_first = bool(_param(params, "optimizeFirst", False))
    max_steps = _positive_int(params, "maxOptSteps", DEFAULT_MAX_OPT_STEPS)

    forces = atoms.get_forces()
    fmax_in = _f(np.linalg.norm(forces, axis=1).max()) if len(forces) else 0.0

    record: dict = {
        "fmaxToleranceEvPerAngstrom": fmax_tol,
        "fmaxOnEntryEvPerAngstrom": fmax_in,
        "optimizedFirst": False,
        "fmaxAfterOptimizationEvPerAngstrom": None,
        "optSteps": None,
        "converged": None,
    }

    if fmax_in <= fmax_tol:
        record["converged"] = True
        return record

    if not optimize_first:
        raise ValueError(
            f"Refusing to compute a Hessian: the structure is not at a "
            f"stationary point. Max force is {fmax_in:.6f} eV/Å, above the "
            f"required {fmax_tol} eV/Å. Frequencies from a non-stationary "
            f"geometry are not harmonic frequencies — the linear term in the "
            f"energy expansion is not zero, so the eigenvalues mix curvature "
            f"with gradient and the imaginary-mode count stops meaning "
            f"anything. Run a geometry optimisation to fmax <= {fmax_tol} "
            f"eV/Å first, or set params['optimizeFirst']=true to have this "
            f"calculation do it. Nothing was computed."
        )

    # Optimise in place. BFGS only — the house optimiser (see CLAUDE.md);
    # this module deliberately exposes no optimizer parameter.
    opt = BFGS(atoms, logfile=None)
    converged = bool(opt.run(fmax=fmax_tol, steps=max_steps))
    forces = atoms.get_forces()
    fmax_out = _f(np.linalg.norm(forces, axis=1).max()) if len(forces) else 0.0

    record.update({
        "optimizedFirst": True,
        "fmaxAfterOptimizationEvPerAngstrom": fmax_out,
        "optSteps": int(opt.nsteps),
        "converged": converged,
    })
    effective.update({"optimizeFirst": True, "maxOptSteps": max_steps})

    if not converged:
        raise ValueError(
            f"Refusing to compute a Hessian: optimizeFirst was requested but "
            f"the pre-optimisation DID NOT CONVERGE. Max force went from "
            f"{fmax_in:.6f} to {fmax_out:.6f} eV/Å in {opt.nsteps} BFGS steps "
            f"(limit {max_steps}), still above {fmax_tol} eV/Å. Raise "
            f"maxOptSteps or start from a better geometry. No frequencies were "
            f"computed."
        )

    warnings.append(
        f"The submitted geometry was not a stationary point (max force "
        f"{fmax_in:.6f} eV/Å > {fmax_tol} eV/Å), so it was relaxed with BFGS "
        f"before the Hessian: {opt.nsteps} steps, max force now "
        f"{fmax_out:.6f} eV/Å. The frequencies, the energy and the positions "
        f"below belong to the RELAXED geometry, not to the one submitted."
    )
    return record


def _measure_force_cost(atoms, delta: float) -> float:
    """
    Time one REAL force evaluation, on a displaced copy so it cannot be cached.

    This must not reuse the fmax-check evaluation. ASE's `Calculator` caches
    results and `check_state()` returns no changes when the positions are
    unchanged, so if the caller (or `optimizeFirst`) already evaluated this
    geometry, `atoms.get_forces()` returns instantly from the cache and the
    measurement is 0.000 s — which silently disables the time-budget gate on
    exactly the common path, a geometry that was just optimised.

    A copy displaced by `delta` is the honest probe: identical in cost to the
    6N evaluations about to be run, guaranteed to miss the cache, and it does
    not touch the caller's Atoms object. The price is one extra force call out
    of 6N+2.
    """
    probe = atoms.copy()
    probe.calc = atoms.calc
    probe.positions[0, 0] += delta
    t0 = time.time()
    probe.get_forces()
    elapsed = time.time() - t0
    # The calculator now holds the probe's results. Restore its state to the
    # real geometry so the next caller is not served the displaced forces.
    atoms.get_forces()
    return elapsed


def _check_atom_ceiling(atoms, params: dict, warnings: list[str],
                        effective: dict) -> tuple[int, int]:
    """
    The documented static ceiling. Checked BEFORE any force evaluation, so a
    hopeless system is rejected instantly rather than after a model load and an
    optimisation. Returns (n_evaluations, nfree).
    """
    n_atoms = len(atoms)
    nfree = _positive_int(params, "nfree", DEFAULT_NFREE)
    if nfree not in (2, 4):
        raise ValueError(f"Invalid nfree: ase.vibrations supports 2 or 4, got {nfree}.")

    # 6N+1 for nfree=2, 12N+1 for nfree=4 — the +1 is ASE's equilibrium point.
    n_evals = 3 * nfree * n_atoms + 1
    max_atoms = _positive_int(params, "maxAtoms", MAX_ATOMS)

    if max_atoms > MAX_ATOMS:
        warnings.append(
            f"The atom ceiling was raised from the documented {MAX_ATOMS} to "
            f"{max_atoms} by params['maxAtoms']. The cost of a finite-"
            f"difference Hessian grows faster than N^2 (6N+1 force "
            f"evaluations, each itself growing with N); this run may exceed "
            f"the server's request timeout."
        )

    if n_atoms > max_atoms:
        raise ValueError(
            f"Vibrational analysis is limited to {max_atoms} atoms and this "
            f"structure has {n_atoms}. A central-difference Hessian needs "
            f"{n_evals} MACE force evaluations ({3 * nfree}N+1), and on the "
            f"2-vCPU CPU-only deployment that is minutes to hours. Measured "
            f"with MACE-OFF23(small) on the development machine: 9 atoms = 55 "
            f"evaluations = 2.5 s, 32 atoms = 193 = 7.5 s, 74 atoms = 445 = "
            f"42 s, 92 atoms = 553 = 58 s; the free Space is roughly 3x slower "
            f"again. Reduce the system, or raise params['maxAtoms'] if you own "
            f"the hardware and accept the wait. Nothing was computed."
        )

    effective.update({"nfree": nfree, "maxAtoms": max_atoms})
    return n_evals, nfree


def _check_time_budget(params: dict, n_evals: int, nfree: int, t_force: float,
                       effective: dict) -> dict:
    """
    The gate that actually protects the machine, because it measured it.

    `t_force` comes from `_measure_force_cost()`: one real, uncached MACE
    evaluation on this structure on this CPU. The static atom ceiling is a
    table compiled on a developer's laptop; this is not.
    """
    budget = _positive_float(params, "timeBudgetSeconds", DEFAULT_TIME_BUDGET_S)
    estimate = n_evals * t_force
    effective["timeBudgetSeconds"] = budget

    if estimate > budget:
        raise ValueError(
            f"Refusing to start: the measured cost of one MACE force "
            f"evaluation on this structure and this CPU is {t_force:.4f} s, so "
            f"{n_evals} of them will take about {estimate:.0f} s, over the "
            f"{budget:.0f} s budget. This is a measurement on the machine "
            f"actually running the job, not an extrapolation. Reduce the "
            f"system, use a smaller model, or raise "
            f"params['timeBudgetSeconds']. Nothing was computed."
        )

    return {
        "nForceEvaluations": int(n_evals),
        # The gates cost two more: the fmax check on entry and the uncached
        # timing probe. Stated rather than rounded away, because "6N+1" is a
        # claim about how many times the model was called and it should be true.
        "nForceEvaluationsTotal": int(n_evals + 2),
        "scheme": f"{3 * nfree}N+1 (central differences, nfree={nfree})",
        "schemeNote": (
            f"{n_evals} evaluations for the Hessian ({3 * nfree}N displacements "
            f"plus the equilibrium point), and 2 more for the gates: one for "
            f"the entry fmax check and one uncached probe to measure the cost."
        ),
        "measuredForceEvalSeconds": round(t_force, 5),
        "estimatedSeconds": round(estimate, 1),
        "timeBudgetSeconds": budget,
        "atomCeiling": int(effective["maxAtoms"]),
    }


# ── The Hessian run ─────────────────────────────────────────────────────────


def _run_finite_difference(atoms, delta: float, nfree: int, want_ir: bool):
    """
    Run the displacements in a PRIVATE, UNIQUE, DELETED-AFTERWARDS cache.

    This is a correctness requirement, not tidiness. `ase.vibrations.Vibrations`
    keys its on-disk cache by displacement NAME ('0x+', '1y-', 'eq', ...) inside
    a directory taken from its `name` argument, whose default is the relative
    path 'vib'. `run()` skips any displacement already present in that cache and
    reuses the stored forces. On a shared web server with a fixed name, two
    users' molecules collide on identical keys and user B is served user A's
    forces — silently, with no error and a perfectly plausible-looking spectrum.

    The fix is a fresh `tempfile.mkdtemp()` per run (unique by construction,
    0700, never reused) and an unconditional `shutil.rmtree` in `finally`. The
    pre-check below is belt-and-braces: it asserts the invariant that makes the
    reuse impossible, so if mkdtemp is ever replaced by something weaker the
    assertion fires instead of the bug.

    Returns (VibrationsData, intensities or None, cache_removed, cache_note).
    """
    from ase.vibrations import Infrared, Vibrations

    cache_root = tempfile.mkdtemp(prefix="simpleatom-vib-")
    cache_name = os.path.join(cache_root, "run")
    try:
        if os.path.exists(cache_name):
            raise RuntimeError(
                f"Refusing to run: the private vibration cache {cache_name} "
                "already exists, so ase.vibrations could reuse forces from "
                "another calculation. This should be impossible with "
                "tempfile.mkdtemp()."
            )

        if want_ir:
            vib = Infrared(atoms, name=cache_name, delta=delta, nfree=nfree)
        else:
            vib = Vibrations(atoms, name=cache_name, delta=delta, nfree=nfree)

        vib.run()
        vib.read()
        data = vib.get_vibrations()
        intensities = [_f(x) for x in vib.intensities] if want_ir else None
        # Diagonalise now, inside the try: a singular or NaN Hessian should
        # surface here, with the run's context, not three frames later.
        data.get_energies_and_modes(all_atoms=True)
    finally:
        # Unconditional. `cache_survived` is read AFTER the try/finally rather
        # than folded into the return above, because a value assigned in a
        # `finally` block cannot change a return expression that has already
        # been evaluated.
        shutil.rmtree(cache_root, ignore_errors=True)
        cache_survived = os.path.exists(cache_root)

    cache_note = None
    if cache_survived:
        # Reported, not raised: the physics is already computed and correct.
        # But a cache that survives is exactly the condition that lets the next
        # run reuse it, so it must not pass unnoticed.
        cache_note = (
            "The private vibration cache directory could not be removed after "
            "the run. Stale ase.vibrations caches are a correctness hazard for "
            "subsequent runs on this server."
        )
    return data, intensities, cache_note


def _mode_table(atoms, data, geometry_info: dict, intensities, params: dict,
                warnings: list[str]) -> dict:
    """
    Split 3N eigenmodes into genuine vibrations and translations/rotations, and
    build the per-mode records a frequency table, a stick spectrum and an
    animation all read from.

    The split is NOT done by sorting on |frequency| and lopping off the six
    smallest, which is the usual shortcut (and what IdealGasThermo does
    internally). That shortcut misidentifies a transition state: a reaction
    coordinate with a small imaginary frequency, say 90i cm^-1, can be smaller
    in magnitude than a poorly-converged rotational mode, and then the
    imaginary mode is discarded as "rotation" and the saddle point is reported
    as a minimum. That is precisely the diagnostic the user came for.

    Instead each eigenvector is projected onto the mass-weighted
    translation+rotation subspace and classified by how much of it lies there.
    Translation and rotation are exact zero modes of a Hessian at a stationary
    point, so their overlap is ~1 and every genuine vibration's is ~0,
    regardless of frequency or sign. The gap between the two clusters is
    measured and reported; a small gap means the geometry is not converged
    enough to separate them and is warned about rather than papered over.
    """
    import numpy as np
    from ase import units

    n_atoms = len(atoms)
    n_tr = geometry_info["nTranslationRotation"]
    energies, modes = data.get_energies_and_modes(all_atoms=True)  # eV, (3N,N,3)
    n_modes = len(energies)

    masses = atoms.get_masses()
    sqm = np.sqrt(masses)[:, None]

    basis, singular = translation_rotation_basis(atoms, n_tr)
    tr_character = np.zeros(n_modes)
    reduced_mass = np.zeros(n_modes)
    for k in range(n_modes):
        cart = modes[k]                      # Cartesian displacement, (N,3)
        mw = (cart * sqm).ravel()            # back to mass-weighted coordinates
        norm = np.linalg.norm(mw)
        if norm > 0:
            mw = mw / norm
        tr_character[k] = _f(np.sum((basis.T @ mw) ** 2))
        # mu = 1 / sum|d|^2 for the mass-weighted-normalised eigenvector, in amu.
        denom = _f(np.sum(cart ** 2))
        reduced_mass[k] = 1.0 / denom if denom > 0 else float("nan")

    order = np.argsort(-tr_character)
    tr_indices = set(int(i) for i in order[:n_tr])

    # How cleanly did the two clusters separate?
    tr_values = sorted(tr_character[i] for i in tr_indices)
    vib_values = sorted((tr_character[i] for i in range(n_modes)
                         if i not in tr_indices), reverse=True)
    separation = _f(tr_values[0] - vib_values[0]) if tr_values and vib_values else 1.0
    if separation < 0.5:
        warnings.append(
            f"The translation/rotation modes did not separate cleanly from the "
            f"vibrations (overlap gap {separation:.3f}, expected close to 1.0). "
            f"The 3N-{n_tr} split below may be wrong. This normally means the "
            f"geometry is not converged tightly enough or delta is too large."
        )

    imaginary_threshold = _positive_float(
        params, "imaginaryThresholdCm1", DEFAULT_IMAGINARY_THRESHOLD_CM1
    )
    amplitude = _positive_float(
        params, "animationAmplitudeAngstrom", DEFAULT_ANIMATION_AMPLITUDE_ANGSTROM
    )

    records = []
    for k in range(n_modes):
        energy = complex(energies[k])
        imaginary = abs(energy.imag) > 0.0
        magnitude_ev = abs(energy.imag) if imaginary else energy.real
        # SIGNED frequency: negative means imaginary. Universal convention in
        # Gaussian/ORCA output, and `imaginary` is carried explicitly as well so
        # no consumer ever has to infer it from a minus sign.
        freq = magnitude_ev / units.invcm
        signed = -freq if imaginary else freq

        cart = modes[k]
        peak = _f(np.abs(cart).max())
        scaled = (cart * (amplitude / peak)) if peak > 0 else cart

        # k = mu * omega^2, carried through SI so the units cannot drift.
        omega = magnitude_ev * units._e / units._hbar          # rad/s
        mu_kg = reduced_mass[k] * units._amu                   # kg
        k_si = mu_kg * omega ** 2                              # N/m
        force_constant = k_si * 1e-20 / units._e               # eV/Å^2

        records.append({
            "index": int(k),
            "kind": "translation-rotation" if k in tr_indices else "vibration",
            "frequencyCm1": round(_f(signed), 4),
            "imaginary": bool(imaginary),
            "energyEv": round(_f(magnitude_ev), 8),
            "reducedMassAmu": round(_f(reduced_mass[k]), 5),
            "forceConstantEvPerAngstrom2": round(_f(force_constant), 6),
            "translationRotationCharacter": round(_f(tr_character[k]), 5),
            "irIntensityDebye2PerAngstrom2PerAmu": (
                round(_f(intensities[k]), 6) if intensities is not None else None
            ),
            "displacementsAngstrom": [[round(_f(c), 6) for c in row] for row in scaled],
        })

    vibrational = [r for r in records if r["kind"] == "vibration"]
    vibrational.sort(key=lambda r: r["frequencyCm1"])
    tr_records = [r for r in records if r["kind"] == "translation-rotation"]

    expected = 3 * n_atoms - n_tr
    if len(vibrational) != expected:
        raise RuntimeError(
            f"Internal error: expected {expected} vibrational modes for a "
            f"{geometry_info['geometry']} molecule of {n_atoms} atoms, found "
            f"{len(vibrational)}."
        )

    imaginary_modes = [r for r in vibrational if r["imaginary"]]
    significant = [r for r in imaginary_modes
                   if abs(r["frequencyCm1"]) >= imaginary_threshold]

    tr_residual = [abs(r["frequencyCm1"]) for r in tr_records]
    max_residual = max(tr_residual) if tr_residual else 0.0
    lowest_genuine = min((abs(r["frequencyCm1"]) for r in vibrational), default=0.0)
    # Relative test with an absolute backstop — see TR_RESIDUAL_RELATIVE_WARN
    # for the measurements behind both numbers.
    relative = (max_residual / lowest_genuine) if lowest_genuine > 0 else 0.0
    if relative > TR_RESIDUAL_RELATIVE_WARN or max_residual > TR_RESIDUAL_ABSOLUTE_WARN_CM1:
        warnings.append(
            f"The translational/rotational modes, which are exactly zero for an "
            f"analytic Hessian at a stationary point, came out as large as "
            f"{max_residual:.1f} cm^-1 — {relative:.0%} of the lowest genuine "
            f"vibration at {lowest_genuine:.1f} cm^-1. At that level the "
            f"finite-difference error is comparable to the soft modes "
            f"themselves, so those frequencies and the vibrational entropy "
            f"derived from them are unreliable. Tighten fmaxTolerance, or "
            f"reduce delta (the residual falls linearly with it, the real "
            f"frequencies quadratically)."
        )

    # Verdict. Uses the significant count so that a 5i cm^-1 numerical artefact
    # does not get a molecule labelled a transition state; both counts are
    # reported so the verdict can be re-derived under another threshold.
    n_sig = len(significant)
    if n_sig == 0:
        point_type = "minimum"
        statement = (
            f"MINIMUM: no imaginary frequencies above {imaginary_threshold:g} cm^-1. "
            f"This geometry is a local minimum on the MACE potential energy surface."
        )
    elif n_sig == 1:
        point_type = "transition-state"
        statement = (
            f"TRANSITION STATE (first-order saddle point): exactly one imaginary "
            f"frequency, {significant[0]['frequencyCm1']:.1f} cm^-1 (i.e. "
            f"{abs(significant[0]['frequencyCm1']):.1f}i). The mode with that "
            f"frequency is the reaction coordinate. This geometry is NOT a minimum."
        )
    else:
        point_type = "higher-order-saddle"
        listed = ", ".join("%.1f" % r["frequencyCm1"] for r in significant)
        statement = (
            f"HIGHER-ORDER SADDLE POINT: {n_sig} imaginary frequencies "
            f"({listed} cm^-1). This is neither a minimum nor a transition state; "
            f"the geometry needs further optimisation along the imaginary modes."
        )
    if imaginary_modes and n_sig < len(imaginary_modes):
        statement += (
            f" {len(imaginary_modes) - n_sig} further imaginary mode(s) below the "
            f"{imaginary_threshold:g} cm^-1 significance threshold were treated as "
            f"numerical noise; they are still listed in full."
        )
    if imaginary_modes:
        listed_all = ", ".join("%.1fi" % abs(r["frequencyCm1"]) for r in imaginary_modes)
        warnings.append(
            f"{len(imaginary_modes)} imaginary frequency/frequencies found "
            f"({listed_all} cm^-1). {statement}"
        )

    # ZPE from the genuine REAL modes only. Imaginary modes have no zero-point
    # energy to contribute (there is no bound state along that coordinate), and
    # translations/rotations are not oscillators.
    zpe = 0.5 * sum(r["energyEv"] for r in vibrational if not r["imaginary"])

    return {
        "geometry": geometry_info["geometry"],
        "linearity": geometry_info,
        "nAtoms": int(n_atoms),
        "nModesTotal": int(n_modes),
        "nTranslationRotation": int(n_tr),
        "nVibrational": len(vibrational),
        "modeCountFormula": f"3N-{n_tr} = {expected}",
        "frequenciesCm1": [r["frequencyCm1"] for r in vibrational],
        "nImaginary": len(imaginary_modes),
        "nImaginarySignificant": n_sig,
        "imaginaryThresholdCm1": imaginary_threshold,
        "imaginaryFrequenciesCm1": [r["frequencyCm1"] for r in imaginary_modes],
        "stationaryPointType": point_type,
        "stationaryPointStatement": statement,
        "zeroPointEnergyEv": round(_f(zpe), 8),
        "translationRotationResidualCm1": [round(_f(x), 3) for x in tr_residual],
        "maxTranslationRotationResidualCm1": round(_f(max_residual), 3),
        "translationRotationResidualFraction": round(_f(relative), 5),
        "translationRotationSeparation": round(_f(separation), 5),
        "translationRotationSingularValues": [_f(s) for s in singular],
        "modes": vibrational,
        "translationRotationModes": tr_records,
        "animation": {
            "scheme": "positions(t) = positions + sin(2*pi*t) * displacementsAngstrom",
            "amplitudeAngstrom": amplitude,
            "note": (
                "displacementsAngstrom is the Cartesian normal-mode eigenvector "
                "rescaled so the largest single-atom displacement equals "
                "amplitudeAngstrom. Relative magnitudes and directions within a "
                "mode are physical; the overall scale is a display choice."
            ),
            "suggestedFrames": 20,
        },
    }


def _thermochemistry(atoms, vib_block: dict, params: dict, symmetry: dict,
                     warnings: list[str]) -> dict:
    """
    Ideal-gas U, H, S and G from `ase.thermochemistry.IdealGasThermo`.

    Only the genuine REAL vibrations are handed over. IdealGasThermo would
    otherwise raise on any imaginary energy, and the alternative
    (`ignore_imag_modes=True`) discards them without telling the caller which
    or how many. Excluding the reaction coordinate is the standard convention
    for transition-state thermochemistry, but it is a convention, so it is
    stated in a warning rather than assumed to be understood.
    """
    from ase import units
    from ase.thermochemistry import IdealGasThermo

    temperature = _positive_float(params, "temperature", DEFAULT_TEMPERATURE_K)
    pressure = _positive_float(params, "pressure", DEFAULT_PRESSURE_PA)
    multiplicity = _positive_int(params, "spinMultiplicity", 1)
    spin = (multiplicity - 1) / 2.0

    if multiplicity != 1:
        warnings.append(
            f"Spin multiplicity {multiplicity} (S={spin:g}) was supplied by the "
            f"caller and contributes an electronic entropy of kB*ln({multiplicity}) "
            f"= {units.kB * math.log(multiplicity):.3e} eV/K. MACE-MP-0 and "
            f"MACE-OFF are trained on ground-state DFT energies and know nothing "
            f"about the spin state; this number is an assertion by the caller, not "
            f"a property of the potential."
        )

    real_vib_energies = [r["energyEv"] for r in vib_block["modes"]
                         if not r["imaginary"]]
    n_excluded = vib_block["nImaginary"]
    if n_excluded:
        warnings.append(
            f"{n_excluded} imaginary mode(s) were EXCLUDED from the zero-point "
            f"energy and from every thermochemical quantity below. This is the "
            f"standard convention for a transition state (the reaction "
            f"coordinate is not a bound vibration and has no partition "
            f"function), but it means the thermochemistry describes a "
            f"{len(real_vib_energies)}-mode oscillator, not the full "
            f"{vib_block['nVibrational']}-mode system."
        )

    thermo = IdealGasThermo(
        vib_energies=real_vib_energies,
        geometry=vib_block["geometry"],
        potentialenergy=_f(atoms.get_potential_energy()),
        atoms=atoms,
        symmetrynumber=symmetry["symmetryNumber"],
        spin=spin,
        ignore_imag_modes=False,  # nothing imaginary is passed in; see above
    )

    enthalpy = _f(thermo.get_enthalpy(temperature, verbose=False))
    entropy = _f(thermo.get_entropy(temperature, pressure, verbose=False))
    gibbs = enthalpy - temperature * entropy
    # H = U + PV and PV = kB*T per molecule for an ideal gas, so U = H - kB*T.
    # IdealGasThermo has no get_internal_energy(); HarmonicThermo's is a
    # different quantity (no PV term, no translation or rotation).
    internal = enthalpy - units.kB * temperature
    potential = _f(atoms.get_potential_energy())
    zpe = _f(thermo.get_ZPE_correction())

    ev_per_k_to_j_per_mol_k = units._e * units._Nav

    return {
        "temperatureK": temperature,
        "pressurePa": pressure,
        "pressureNote": (
            f"P = {pressure:g} Pa. The default, 101325 Pa, is 1 atm — the "
            f"reference state of most tabulated thermochemistry. It is not 1 bar "
            f"(exactly 100000 Pa), which is the IUPAC standard state and the "
            f"reference ase.thermochemistry uses internally; ASE applies the "
            f"-kB*ln(P/1 bar) correction, worth +0.34 meV on G at 298.15 K."
        ),
        "geometry": vib_block["geometry"],
        "symmetry": symmetry,
        "spinMultiplicity": multiplicity,
        "spin": spin,
        "nVibrationalModesUsed": len(real_vib_energies),
        "nImaginaryModesExcluded": int(n_excluded),
        "potentialEnergyEv": round(potential, 8),
        "zeroPointEnergyEv": round(zpe, 8),
        "internalEnergyEv": round(_f(internal), 8),
        "enthalpyEv": round(enthalpy, 8),
        "entropyEvPerK": round(entropy, 10),
        "entropyJPerMolPerK": round(_f(entropy * ev_per_k_to_j_per_mol_k), 4),
        "minusTSEv": round(_f(-temperature * entropy), 8),
        "gibbsEnergyEv": round(_f(gibbs), 8),
        "enthalpyCorrectionEv": round(_f(enthalpy - potential), 8),
        "gibbsCorrectionEv": round(_f(gibbs - potential), 8),
        "unitConversions": {
            "evToKjPerMol": round(_f(units._e * units._Nav / 1000.0), 6),
            "evToKcalPerMol": round(_f(units._e * units._Nav / 4184.0), 6),
            "evPerKToJPerMolPerK": round(_f(ev_per_k_to_j_per_mol_k), 4),
            "evToCm1": round(_f(1.0 / units.invcm), 4),
        },
        "definitions": {
            "internalEnergyEv": "U = H - kB*T (ideal gas, PV = kB*T per molecule)",
            "enthalpyEv": "H = E_pot + ZPE + Cv_trans*T + Cv_rot*T + dU_vib(T) + kB*T",
            "gibbsEnergyEv": "G = H - T*S",
            "entropyEvPerK": "S = S_trans + S_rot + S_elec + S_vib + S(1 bar -> P)",
        },
    }


# ── Public entry point ──────────────────────────────────────────────────────


def run_vibrational_analysis(
    atoms,
    params: dict | None = None,
    *,
    filename: str = "structure",
    ref_data: dict | None = None,
    effective_params: dict | None = None,
    warnings: list[str] | None = None,
    manifest: dict | None = None,
) -> dict:
    """
    Harmonic frequencies, ZPE and ideal-gas thermochemistry for one molecule.

    Args:
        atoms: `ase.Atoms` with a MACE calculator ALREADY attached
            (`atoms.calc`). Non-periodic and unconstrained. NOTE: this function
            mutates `atoms` when `params["optimizeFirst"]` is set — the
            returned positions are then the relaxed ones, and the result says
            so in both `warnings` and `vibrations.stationaryPoint`.
        params: parameters. All optional:
            temperature (K, default 298.15)
            pressure (Pa, default 101325 = 1 atm)
            symmetryNumber (int; skips detection, used verbatim)
            spinMultiplicity (int >= 1, default 1)
            delta (Å, default 0.01)
            nfree (2 or 4, default 2)
            fmaxTolerance (eV/Å, default 0.005)
            optimizeFirst (bool, default False)
            maxOptSteps (int, default 500)
            maxAtoms (int, default MAX_ATOMS = 50)
            timeBudgetSeconds (float, default 240)
            imaginaryThresholdCm1 (float, default 30)
            animationAmplitudeAngstrom (float, default 0.5)
            allowFloat32 (bool, default False)
        filename: name used in the human-readable message.
        ref_data: reference energies/forces from the input file, merged into
            the result exactly as `calculate._build_result()` does.
        effective_params: the caller's already-resolved parameter record
            (model, device, precision, ...). Copied, then extended with the
            vibrational parameters that were actually used. Never the raw
            request dict — this function only ever adds its own known keys.
        warnings: the caller's running warnings list; extended, not replaced.
        manifest: provenance record, attached as result["provenance"].

    Returns:
        A JSON-serialisable result dict: the standard SimpleAtom keys (status,
        energy, forces, positions, symbols, lattice, properties, params,
        message, timeTaken, warnings, provenance) plus:

        result["vibrations"]:
            geometry, linearity evidence, mode counts, signed frequenciesCm1
            (negative = imaginary), nImaginary / stationaryPointType /
            stationaryPointStatement, zeroPointEnergyEv, per-mode records with
            displacementsAngstrom for animation, translation/rotation residuals,
            and the `infrared` block.
        result["thermochemistry"]:
            U, H, S, G at the requested T and P, the symmetry number used and
            what it does to S, and the unit conversions a UI needs.

    Raises:
        ValueError for every refusal listed in the module docstring (not at a
        stationary point, float32, periodic, constrained, over budget, bad
        parameter). Nothing is ever computed and returned under a false label.
    """
    import numpy as np

    params = dict(params or {})
    warnings = list(warnings) if warnings else []
    ref_data = dict(ref_data or {})
    effective = dict(effective_params or {})
    effective["calculationType"] = CALCULATION_TYPE

    calc_start = time.time()

    # 1. System-level refusals, before anything expensive.
    _reject_unsupported_system(atoms)

    # 2. Precision. Cheap, and pointless to spend 6N force calls in float32.
    precision = _check_precision(atoms, params, warnings)
    effective["hessianPrecision"] = precision

    # 3. Static atom ceiling, before any force evaluation at all, so a hopeless
    #    system is rejected instantly instead of after an optimisation.
    delta = _positive_float(params, "delta", DEFAULT_DELTA_ANGSTROM)
    n_evals, nfree = _check_atom_ceiling(atoms, params, warnings, effective)

    # 4. Stationary-point gate (optionally relaxing first).
    stationary = _enforce_stationary_point(atoms, params, warnings, effective)

    # 5. Measured cost gate. Deliberately AFTER the optimisation, because the
    #    geometry that will be displaced 6N times is the relaxed one, and
    #    deliberately on a displaced copy, because the entry force call is
    #    served from ASE's cache and would time as 0.000 s.
    t_force = _measure_force_cost(atoms, delta)
    cost = _check_time_budget(params, n_evals, nfree, t_force, effective)

    # 6. Geometry class from the moments of inertia — never assumed.
    geometry_info = classify_geometry(atoms)
    if geometry_info["borderline"]:
        warnings.append(
            f"Linearity is borderline: the furthest atom sits "
            f"{geometry_info['maxOffAxisDistanceAngstrom']:.2e} Å off the "
            f"principal axis against a {geometry_info['linearToleranceAngstrom']:g} Å "
            f"threshold, so this was classed as {geometry_info['geometry']}. That "
            f"choice sets 3N-5 vs 3N-6 and picks the rotational partition function; "
            f"check the geometry."
        )
    # Independent cross-check: the rank of the mass-weighted translation +
    # rotation block is 5 for a linear molecule and 6 otherwise, computed from
    # the same coordinates but by a completely different route.
    _, singular = translation_rotation_basis(atoms, geometry_info["nTranslationRotation"])
    if len(atoms) > 1:
        rank = int((np.asarray(singular) > singular[0] * 1e-6).sum())
        if rank != geometry_info["nTranslationRotation"]:
            warnings.append(
                f"Linearity cross-check disagrees: the moments of inertia say "
                f"{geometry_info['geometry']} ({geometry_info['nTranslationRotation']} "
                f"zero modes) but the rank of the translation+rotation subspace is "
                f"{rank}. The moments-of-inertia classification was used."
            )

    # 7. IR capability — probed, never assumed. See IR_UNAVAILABLE_EVIDENCE.
    ir_capable, ir_reason = dipole_capability(atoms.calc, atoms)
    if not ir_capable:
        warnings.append(
            "IR intensities are NOT available for this model, so none are "
            "reported and no spectrum should be drawn from this result. "
            + ir_reason
        )

    effective["delta"] = delta
    effective["fmaxTolerance"] = stationary["fmaxToleranceEvPerAngstrom"]

    # 8. The Hessian itself, in a private cache that is deleted afterwards.
    positions_before = atoms.get_positions().copy()
    data, intensities, cache_note = _run_finite_difference(
        atoms, delta, nfree, ir_capable
    )
    if cache_note:
        warnings.append(cache_note)
    # ase.vibrations displaces in place and restores; verify rather than trust,
    # because everything reported below is attributed to these coordinates.
    drift = _f(np.abs(atoms.get_positions() - positions_before).max())
    if drift > 1e-9:
        atoms.set_positions(positions_before)
        warnings.append(
            f"ase.vibrations left the geometry displaced by up to {drift:.2e} Å "
            f"after the run; the original coordinates were restored before "
            f"reporting."
        )

    # 9. Mode classification, imaginary-frequency verdict, ZPE.
    vib_block = _mode_table(atoms, data, geometry_info, intensities, params, warnings)

    frequencies = vib_block["frequenciesCm1"]
    vib_block["infrared"] = {
        "available": bool(ir_capable),
        "reason": ir_reason,
        "intensityUnits": "(D/Å)^2/amu" if ir_capable else None,
        "kmPerMolConversionFactor": 42.255 if ir_capable else None,
        "stickSpectrum": {
            "frequenciesCm1": frequencies,
            # Explicitly null, not zeros and not ones. A frontend must render
            # "intensities unavailable for this model" and may draw the sticks
            # at uniform height ONLY if it labels them as positions, not
            # intensities.
            "intensities": (
                [r["irIntensityDebye2PerAngstrom2PerAmu"] for r in vib_block["modes"]]
                if ir_capable else None
            ),
        },
    }

    # 10. Thermochemistry, with a symmetry number that is detected, not assumed.
    symmetry = resolve_symmetry_number(atoms, params, warnings)
    thermo_block = _thermochemistry(atoms, vib_block, params, symmetry, warnings)

    vib_block["stationaryPoint"] = stationary
    vib_block["cost"] = cost
    vib_block["finiteDifference"] = {
        "deltaAngstrom": delta,
        "nfree": nfree,
        "scheme": "central",
        "nForceEvaluations": cost["nForceEvaluations"],
        "note": (
            f"Central differences: {3 * nfree}N+1 = {cost['nForceEvaluations']} MACE "
            f"force evaluations (ASE also evaluates the undisplaced geometry). "
            f"Forward differences would cost {(3 * nfree) // 2}N+1 but carry O(delta) "
            f"error and assume exactly zero equilibrium forces, which a geometry "
            f"converged only to {stationary['fmaxToleranceEvPerAngstrom']} eV/Å does "
            f"not provide."
        ),
    }
    vib_block["units"] = {
        "frequency": "cm^-1 (negative value = imaginary frequency)",
        "energy": "eV",
        "displacement": "Å",
        "reducedMass": "amu",
        "forceConstant": "eV/Å^2",
        "irIntensity": "(D/Å)^2/amu",
    }

    effective.update({
        "temperature": thermo_block["temperatureK"],
        "pressure": thermo_block["pressurePa"],
        "spinMultiplicity": thermo_block["spinMultiplicity"],
        "symmetryNumber": symmetry["symmetryNumber"],
        "symmetryNumberSource": symmetry["source"],
        "imaginaryThresholdCm1": vib_block["imaginaryThresholdCm1"],
        "irIntensitiesAvailable": bool(ir_capable),
    })

    # The message is the one field that survives PDF export and MACE Link, so
    # the verdict, the symmetry number and the IR status all go in it.
    msg = (
        f"Vibrational analysis completed for {filename}: "
        f"{vib_block['nVibrational']} vibrational modes "
        f"({vib_block['modeCountFormula']}, {vib_block['geometry']}), "
        f"{vib_block['nImaginary']} imaginary. {vib_block['stationaryPointStatement']} "
        f"ZPE {vib_block['zeroPointEnergyEv']:.4f} eV. Thermochemistry at "
        f"{thermo_block['temperatureK']:g} K / {thermo_block['pressurePa']:g} Pa with "
        f"symmetry number sigma={symmetry['symmetryNumber']} "
        f"({symmetry['source']}): G = {thermo_block['gibbsEnergyEv']:.4f} eV. "
        f"IR intensities: {'computed' if ir_capable else 'UNAVAILABLE for this model'}."
    )

    result = _build_result(
        atoms,
        atoms.get_potential_energy(),
        atoms.get_forces(),
        msg,
        calc_start,
        ref_data,
        effective,
        warnings=warnings,
        manifest=manifest,
    )
    result["vibrations"] = vib_block
    result["thermochemistry"] = thermo_block
    return result
