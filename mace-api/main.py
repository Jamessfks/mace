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
            energy = atoms.get_potential_energy()
            forces = atoms.get_forces()

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
                "message": f"Calculation completed for {file.filename} using MACE",
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
        "name": "MACE Calculation API",
        "version": "1.0.0",
        "endpoints": {
            "POST /calculate": "Run MACE calculation on uploaded structure",
            "GET /health": "Health check",
        },
    }
