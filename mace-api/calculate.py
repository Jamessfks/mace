"""
Shared MACE calculation engine.

Contains all scientific logic for running MACE calculations (single-point,
geometry optimization, molecular dynamics). Both the CLI wrapper
(calculate_local.py) and the FastAPI server (main.py) call into this module.
"""

import time
from pathlib import Path


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
                  trajectory=None):
    """Assemble the standard JSON result dict."""
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
    """
    from ase.io import read

    fmt = detect_format(filepath)
    atoms = read(filepath, format=fmt)
    filename = Path(filepath).name

    ref_data = extract_reference_data(atoms)

    model_type = params.get("modelType", "MACE-MP-0")
    model_size = params.get("modelSize", "medium")
    device = resolve_device(params.get("device", "cpu"))
    dispersion = params.get("dispersion", False)
    calc_type = params.get("calculationType", "single-point")
    precision = params.get("precision", "float32")

    if model_path:
        calc = get_custom_calculator(model_path, device)
    else:
        calc = get_mace_calculator(model_type, model_size, device, dispersion, precision)
    atoms.calc = calc

    calc_start = time.time()

    if calc_type == "geometry-opt":
        return _run_geometry_opt(atoms, params, filename, calc_start, ref_data)
    elif calc_type == "molecular-dynamics":
        return _run_md(atoms, params, filename, calc_start, ref_data)
    else:
        return _run_single_point(atoms, filename, calc_start, ref_data)


def _run_single_point(atoms, filename, calc_start, ref_data):
    energy = atoms.get_potential_energy()
    forces = atoms.get_forces()
    msg = f"Calculation completed for {filename} using MACE"
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data)


def _run_geometry_opt(atoms, params, filename, calc_start, ref_data):
    from ase.optimize import BFGS

    fmax = float(params.get("forceThreshold", 0.05))
    max_steps = int(params.get("maxOptSteps", 500))

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
                         trajectory=trajectory)


def _run_md(atoms, params, filename, calc_start, ref_data):
    from ase import units
    from ase.md.velocitydistribution import MaxwellBoltzmannDistribution

    temp_K = float(params.get("temperature", 300))
    dt_fs = float(params.get("timeStep", 1.0))
    friction = float(params.get("friction", 0.005))
    md_steps = int(params.get("mdSteps", 100))
    ensemble = params.get("mdEnsemble", "NVT")

    traj_energies = []
    traj_positions = []
    traj_steps = []

    def write_frame():
        traj_energies.append(float(atoms.get_potential_energy()))
        traj_positions.append(atoms.get_positions().tolist())
        traj_steps.append(dyn.get_number_of_steps())

    # Initialize velocities at target temperature to avoid equilibration transient
    MaxwellBoltzmannDistribution(atoms, temperature_K=temp_K)

    if ensemble == "NVT":
        from ase.md.langevin import Langevin
        dyn = Langevin(atoms, dt_fs * units.fs, temperature_K=temp_K,
                       friction=friction / units.fs)
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
    msg = f"MD ({ensemble}) completed for {filename} ({md_steps} steps)"

    trajectory = {
        "energies": traj_energies,
        "positions": traj_positions,
        "step": traj_steps,
    }
    return _build_result(atoms, energy, forces, msg, calc_start, ref_data,
                         trajectory=trajectory)
