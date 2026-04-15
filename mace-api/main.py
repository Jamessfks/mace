"""
MACE Calculation API — FastAPI server for remote deployment.

Thin wrapper around calculate.py. Handles file upload/cleanup and HTTP concerns.
Deploy: uvicorn main:app --host 0.0.0.0 --port 7860
"""

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# PyTorch 2.6+ defaults torch.load to weights_only=True, but MACE checkpoints
# contain custom model classes (ScaleShiftMACE etc.) that require full unpickling.
import torch
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    if "weights_only" not in kwargs:
        kwargs["weights_only"] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from calculate import run_calculation
from pydantic import BaseModel
from smiles_to_xyz import smiles_to_xyz

app = FastAPI(
    title="MACE Calculation API",
    description="Run MACE energy and force calculations on atomic structures",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/calculate")
async def calculate(
    files: list[UploadFile] = File(...),
    params: str = Form(...),
    model: UploadFile | None = None,
):
    """
    Run MACE calculation on uploaded structure file(s).
    Accepts XYZ, CIF, POSCAR/VASP, PDB formats.
    Optionally accepts a custom .model file.
    """
    try:
        params_obj = json.loads(params)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid params JSON: {e}")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    file = files[0]
    content = await file.read()

    with tempfile.NamedTemporaryFile(
        suffix=Path(file.filename or "struct").suffix, delete=False
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    # Handle custom model file if provided
    model_path = None
    if model is not None:
        model_content = await model.read()
        with tempfile.NamedTemporaryFile(
            suffix=Path(model.filename or "model").suffix, delete=False
        ) as mtmp:
            mtmp.write(model_content)
            model_path = mtmp.name

    try:
        result = run_calculation(tmp_path, params_obj, model_path=model_path)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message", "Calculation failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if model_path and os.path.exists(model_path):
            os.unlink(model_path)


class SmilesRequest(BaseModel):
    smiles: str


@app.post("/smiles-to-xyz")
async def convert_smiles(req: SmilesRequest):
    """Convert a SMILES string to a 3D XYZ structure using RDKit."""
    if not req.smiles or not req.smiles.strip():
        raise HTTPException(status_code=400, detail="Missing or empty SMILES string")
    try:
        result = smiles_to_xyz(req.smiles.strip())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "mace-api"}


@app.get("/")
async def root():
    """API info."""
    return {
        "name": "MACE API",
        "version": "1.2.0",
        "endpoints": {
            "POST /calculate": "Run MACE calculation on uploaded structure",
            "POST /smiles-to-xyz": "Convert SMILES to 3D XYZ structure",
            "GET /health": "Health check",
        },
    }
