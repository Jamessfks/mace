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
from pathlib import Path
from typing import Optional


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


def get_model_path(model_type: str) -> Optional[Path]:
    if model_type not in ("water", "MACE-Water"):
        return None
    base = Path(__file__).resolve().parent.parent / "CS2535"
    for name in ("water_1k_small.model", "water_1k_small_stagetwo.model", "water_1k_small_compiled.model"):
        p = base / name
        if p.exists():
            return p
    return None


def get_mace_calculator(model_type: str, model_size: str, device: str, dispersion: bool):
    model_size = model_size or "medium"

    if model_type in ("water", "MACE-Water"):
        path = get_model_path(model_type)
        if path:
            from mace.calculators import MACECalculator
            return MACECalculator(model_path=str(path), device=device)
        from mace.calculators import mace_off
        return mace_off(model=model_size, device=device)

    if model_type in ("MACE-OFF", "MACE-OFF23"):
        from mace.calculators import mace_off
        return mace_off(model=model_size, device=device)

    from mace.calculators import mace_mp
    return mace_mp(model=model_size, device=device, dispersion=dispersion)


def run_calculation(filepath: str, params: dict) -> dict:
    from ase.io import read

    fmt = detect_format(filepath)
    atoms = read(filepath, format=fmt)
    filename = Path(filepath).name

    model_type = params.get("modelType", "MACE-MP-0")
    model_size = params.get("modelSize", "medium")
    device = params.get("device", "cpu")
    dispersion = params.get("dispersion", False)
    calc_type = params.get("calculationType", "single-point")

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
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Usage: python calculate_local.py <file> [params_json]"}))
        sys.exit(1)

    filepath = sys.argv[1]
    params_json = sys.argv[2] if len(sys.argv) > 2 else "{}"

    try:
        params = json.loads(params_json)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "message": "Invalid params JSON"}))
        sys.exit(1)

    try:
        result = run_calculation(filepath, params)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
