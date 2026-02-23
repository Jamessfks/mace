#!/usr/bin/env python3
"""
Standalone MACE calculation script — runs locally, no FastAPI needed.

Usage:
  python calculate_local.py <structure_file> [params_json]

Reads an atomic structure file, runs MACE, prints JSON result to stdout.
Called by the Next.js API route when no MACE_API_URL is set.
"""

import json
import sys
import os
import warnings
from pathlib import Path

# Suppress all warnings so only JSON goes to stdout
warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

# Redirect all non-JSON output (MACE/PyTorch info messages) to stderr
import logging
logging.disable(logging.CRITICAL)


def detect_format(filename: str) -> str:
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


def get_mace_calculator(model_type: str, model_size: str, device: str, dispersion: bool):
    model_size = model_size or "medium"

    if model_type in ("MACE-OFF", "MACE-OFF23"):
        from mace.calculators import mace_off
        return mace_off(model=model_size, device=device)

    # MACE-MP: materials (bulk crystals, 89 elements) — default
    from mace.calculators import mace_mp
    return mace_mp(model=model_size, device=device, dispersion=dispersion)


def resolve_device(requested: str) -> str:
    """Resolve the compute device, falling back to CPU if CUDA is unavailable."""
    if requested == "cuda":
        try:
            import torch
            if not torch.cuda.is_available():
                return "cpu"
        except ImportError:
            return "cpu"
    return requested


def get_custom_calculator(model_path: str, device: str):
    """Load a user-uploaded MACE model checkpoint."""
    from mace.calculators import MACECalculator

    if not Path(model_path).exists():
        raise ValueError(f"Model file not found: {model_path}")

    device = resolve_device(device)

    try:
        calc = MACECalculator(model_paths=model_path, device=device)
        return calc
    except Exception as e:
        raise ValueError(
            f"Failed to load custom model '{Path(model_path).name}': {e}. "
            "Ensure the file is a valid MACE .model checkpoint."
        )


def run_calculation(filepath: str, params: dict, model_path: str = None) -> dict:
    from ase.io import read

    fmt = detect_format(filepath)
    atoms = read(filepath, format=fmt)
    filename = Path(filepath).name

    model_type = params.get("modelType", "MACE-MP-0")
    model_size = params.get("modelSize", "medium")
    device = resolve_device(params.get("device", "cpu"))
    dispersion = params.get("dispersion", False)
    calc_type = params.get("calculationType", "single-point")

    if model_path:
        calc = get_custom_calculator(model_path, device)
    else:
        calc = get_mace_calculator(model_type, model_size, device, dispersion)
    atoms.calc = calc

    if calc_type == "geometry-opt":
        fmax = float(params.get("forceThreshold", 0.05))
        max_steps = int(params.get("maxOptSteps", 500))
        from ase.optimize import BFGS

        opt = BFGS(atoms, logfile=None)
        opt.run(fmax=fmax, steps=max_steps)
        energy = atoms.get_potential_energy()
        forces = atoms.get_forces()
        msg = f"Geometry optimization completed for {filename} (fmax={fmax}, steps={opt.nsteps})"

    elif calc_type == "molecular-dynamics":
        temp_K = float(params.get("temperature", 300))
        dt_fs = float(params.get("timeStep", 1.0))
        friction = float(params.get("friction", 0.005))
        md_steps = int(params.get("mdSteps", 100))
        ensemble = params.get("mdEnsemble", "NVT")

        from ase import units

        traj_energies = []
        traj_positions = []
        traj_steps = []

        def write_frame():
            traj_energies.append(float(atoms.get_potential_energy()))
            traj_positions.append(atoms.get_positions().tolist())
            traj_steps.append(dyn.get_number_of_steps())

        if ensemble == "NVT":
            from ase.md.langevin import Langevin
            dyn = Langevin(atoms, dt_fs * units.fs, temperature_K=temp_K, friction=friction)
        elif ensemble == "NPT":
            from ase.md.npt import NPT
            pressure_bar = float(params.get("pressure", 0)) * 1e4
            dyn = NPT(atoms, dt_fs * units.fs, temperature_K=temp_K,
                       externalstress=pressure_bar, ttime=25 * units.fs, pfactor=75 * units.fs ** 2)
        else:
            from ase.md.verlet import VelocityVerlet
            from ase.md.velocitydistribution import MaxwellBoltzmannDistribution
            MaxwellBoltzmannDistribution(atoms, temperature_K=temp_K)
            dyn = VelocityVerlet(atoms, dt_fs * units.fs)

        dyn.attach(write_frame, interval=1)
        dyn.run(md_steps)

        return {
            "status": "success",
            "energy": float(atoms.get_potential_energy()),
            "forces": atoms.get_forces().tolist(),
            "positions": atoms.get_positions().tolist(),
            "symbols": [a.symbol for a in atoms],
            "lattice": atoms.get_cell().tolist() if atoms.pbc.any() else None,
            "trajectory": {"energies": traj_energies, "positions": traj_positions, "step": traj_steps},
            "properties": {"volume": float(atoms.get_volume()) if atoms.pbc.any() else None},
            "message": f"MD ({ensemble}) completed for {filename} ({md_steps} steps)",
        }
    else:
        energy = atoms.get_potential_energy()
        forces = atoms.get_forces()
        msg = f"Calculation completed for {filename} using MACE"

    symbols = [a.symbol for a in atoms]
    positions = atoms.get_positions().tolist()
    forces_list = forces.tolist()
    lattice = atoms.get_cell().tolist() if atoms.pbc.any() else None

    return {
        "status": "success",
        "energy": float(energy),
        "forces": forces_list,
        "positions": positions,
        "symbols": symbols,
        "lattice": lattice,
        "properties": {"volume": float(atoms.get_volume()) if atoms.pbc.any() else None},
        "message": msg,
    }


if __name__ == "__main__":
    # Parse arguments: <file> <params_json> [--model-path <path>]
    model_path = None
    args = sys.argv[1:]

    if "--model-path" in args:
        idx = args.index("--model-path")
        model_path = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    if not args:
        print(json.dumps({"status": "error", "message": "Usage: python calculate_local.py <file> [params_json] [--model-path <path>]"}))
        sys.exit(1)

    filepath = args[0]
    params_json = args[1] if len(args) > 1 else "{}"

    try:
        params = json.loads(params_json)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "message": "Invalid params JSON"}))
        sys.exit(1)

    try:
        result = run_calculation(filepath, params, model_path=model_path)
        print(json.dumps(result))
    except Exception as e:
        err_msg = str(e)
        # Provide actionable hints for common errors
        if "CUDA" in err_msg or "cuda" in err_msg:
            err_msg += " (Hint: CUDA/GPU not available on this machine. Switch Device to CPU.)"
        elif "No module named" in err_msg:
            err_msg += " (Hint: required Python package not installed.)"
        print(json.dumps({"status": "error", "message": err_msg}))
        sys.exit(1)
