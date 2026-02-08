"""
MACE Calculation API
FastAPI backend for running MACE calculations on atomic structures.
"""

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="MACE Calculation API",
    description="Run MACE energy and force calculations on atomic structures",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CalculationParams(BaseModel):
    modelSize: str = "medium"
    modelType: str = "MACE-MP-0"
    precision: str = "float32"
    device: str = "cpu"
    calculationType: str = "single-point"
    dispersion: bool = False


def detect_format(filename: str) -> str:
    """Detect file format from extension."""
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
    """Return path to MACE model. Uses CS2535 trained models if available."""
    base = Path(__file__).resolve().parent.parent / "CS2535"
    models = {
        "water_1k_small": base / "water_1k_small.model",
        "water_1k_small_stagetwo": base / "water_1k_small_stagetwo.model",
        "water_1k_small_compiled": base / "water_1k_small_compiled.model",
    }
    for path in models.values():
        if path.exists():
            return path
    return None


@app.post("/calculate")
async def calculate(
    files: list[UploadFile] = File(...),
    params: str = Form(...),
):
    """
    Run MACE calculation on uploaded structure file(s).
    Accepts XYZ, CIF, POSCAR/VASP, PDB formats.
    """
    import json

    try:
        params_obj = json.loads(params)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid params JSON: {e}")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Use first file for single-point
    file = files[0]
    content = await file.read()

    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "struct").suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        from ase.io import read

        fmt = detect_format(file.filename or "")
        atoms = read(tmp_path, format=fmt)

        # Get MACE model and run calculation
        model_path = get_model_path(params_obj.get("modelType", "MACE-MP-0"))
        device = params_obj.get("device", "cpu")
        calc_type = params_obj.get("calculationType", "single-point")

        if model_path and model_path.exists():
            # Load MACE calculator — mace-torch ASE API
            try:
                from mace.calculators import MACECalculator

                calc = MACECalculator(model_path=str(model_path), device=device)
                atoms.calc = calc
            except ImportError as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"mace-torch not installed. Run: pip install mace-torch. {e}",
                )

            if calc_type == "geometry-opt":
                # Geometry optimization: fmax (eV/Å), max steps
                fmax = float(params_obj.get("forceThreshold", 0.05))
                max_steps = int(params_obj.get("maxOptSteps", 500))
                from ase.optimize import BFGS

                opt = BFGS(atoms, logfile=None)
                opt.run(fmax=fmax, steps=max_steps)
                energy = atoms.get_potential_energy()
                forces = atoms.get_forces()
                msg = f"Geometry optimization completed for {file.filename} (fmax={fmax}, steps={opt.nsteps})"
            elif calc_type == "molecular-dynamics":
                # MD: temperature, time step, friction, steps, ensemble
                temp_K = float(params_obj.get("temperature", 300))
                dt_fs = float(params_obj.get("timeStep", 1.0))
                friction = float(params_obj.get("friction", 0.005))
                md_steps = int(params_obj.get("mdSteps", 100))
                ensemble = params_obj.get("mdEnsemble", "NVT")

                from ase import units

                traj_energies: list[float] = []
                traj_positions: list[list[list[float]]] = []
                traj_steps: list[int] = []

                def write_frame():
                    traj_energies.append(float(atoms.get_potential_energy()))
                    traj_positions.append(atoms.get_positions().tolist())
                    traj_steps.append(dyn.get_number_of_steps())

                if ensemble == "NVT":
                    from ase.md.langevin import Langevin

                    dyn = Langevin(
                        atoms,
                        dt_fs * units.fs,
                        temperature_K=temp_K,
                        friction=friction,
                    )
                elif ensemble == "NPT":
                    from ase.md.npt import NPT

                    # NPT: thermostat + barostat
                    pressure_bar = float(params_obj.get("pressure", 0)) * 1e4  # GPa -> bar
                    dyn = NPT(
                        atoms,
                        dt_fs * units.fs,
                        temperature_K=temp_K,
                        externalstress=pressure_bar,
                        ttime=25 * units.fs,
                        pfactor=75 * units.fs**2,
                    )
                else:
                    # NVE
                    from ase.md.verlet import VelocityVerlet

                    from ase.md.velocitydistribution import MaxwellBoltzmannDistribution

                    MaxwellBoltzmannDistribution(atoms, temperature_K=temp_K)
                    dyn = VelocityVerlet(atoms, dt_fs * units.fs)

                dyn.attach(write_frame, interval=1)
                dyn.run(md_steps)

                energy = float(atoms.get_potential_energy())
                forces = atoms.get_forces().tolist()
                positions = atoms.get_positions().tolist()
                symbols = [a.symbol for a in atoms]
                lattice = atoms.get_cell().tolist() if atoms.pbc.any() else None
                return {
                    "status": "success",
                    "energy": energy,
                    "forces": forces,
                    "positions": positions,
                    "symbols": symbols,
                    "lattice": lattice,
                    "trajectory": {
                        "energies": traj_energies,
                        "positions": traj_positions,
                        "step": traj_steps,
                    },
                    "properties": {
                        "volume": float(atoms.get_volume()) if atoms.pbc.any() else None,
                    },
                    "message": f"MD ({ensemble}) completed for {file.filename} ({md_steps} steps)",
                }
            else:
                # single-point (default)
                energy = atoms.get_potential_energy()
                forces = atoms.get_forces()
                msg = f"Calculation completed for {file.filename} using MACE"

            symbols = [a.symbol for a in atoms]
            positions = atoms.get_positions().tolist()
            forces_list = forces.tolist()

            # Lattice if periodic
            lattice = None
            if atoms.pbc.any():
                lattice = atoms.get_cell().tolist()

            return {
                "status": "success",
                "energy": float(energy),
                "forces": forces_list,
                "positions": positions,
                "symbols": symbols,
                "lattice": lattice,
                "properties": {
                    "volume": float(atoms.get_volume()) if atoms.pbc.any() else None,
                },
                "message": msg,
            }

        else:
            # No model found: return ASE-only (no MACE) or fallback
            # Use EMT or similar if MACE unavailable
            try:
                from ase.calculators.emt import EMT

                atoms.calc = EMT()
                energy = atoms.get_potential_energy()
                forces = atoms.get_forces()
                symbols = [a.symbol for a in atoms]
                positions = atoms.get_positions().tolist()

                return {
                    "status": "success",
                    "energy": float(energy),
                    "forces": forces.tolist(),
                    "positions": positions,
                    "symbols": symbols,
                    "message": f"Calculation (EMT fallback) for {file.filename} - MACE model not found",
                }
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"MACE model not found and EMT fallback failed: {e}",
                )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "mace-api"}


@app.get("/")
async def root():
    """API info."""
    return {
        "name": "MACE API",
        "version": "1.0.0",
        "endpoints": {
            "POST /calculate": "Run MACE calculation on uploaded structure",
            "GET /health": "Health check",
        },
    }
