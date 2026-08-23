"""
MACE Calculation API — FastAPI server for remote deployment.

Thin wrapper around calculate.py. Handles file upload/cleanup and HTTP concerns.
Deploy: uvicorn main:app --host 0.0.0.0 --port 7860
"""

import asyncio
import json
import logging
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
_logger = logging.getLogger("mace-api")
_app_dir = os.path.dirname(os.path.abspath(__file__))
_logger.info(
    "App dir: %s — Python files: %s",
    _app_dir,
    [f for f in sorted(os.listdir(_app_dir)) if f.endswith(".py")],
)

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

try:
    from smiles_to_xyz import smiles_to_xyz as _smiles_to_xyz
except Exception as _import_err:
    _logger.warning("Failed to import smiles_to_xyz: %s", _import_err)
    _smiles_to_xyz = None

app = FastAPI(
    title="MACE Calculation API",
    description="Run MACE energy and force calculations on atomic structures",
    version="1.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Public-endpoint guards
#
# This Space is free CPU-basic: 2 vCPU, shared, and open to anyone with no
# sign-in. That is the product, and it is also the attack surface. Three
# separate limits, because they fail differently:
#
#   1. ADMISSION CONTROL is the one that actually protects the box. A Python
#      thread cannot be killed, so a wall-clock timeout alone frees the client
#      but not the CPU. Serialising calculations means a long job delays the
#      next visitor instead of thrashing both cores against them.
#   2. A COOPERATIVE BUDGET injected into params. The scan/NEB/IRC and
#      vibrational modules check a deadline between force calls and return
#      partial results with an honest "did not converge in budget" rather than
#      running forever. A client may ask for less, never for more.
#   3. A REQUEST DEADLINE so the HTTP caller always gets an answer. This is the
#      weakest of the three and is documented as such below.
# ─────────────────────────────────────────────────────────────────────────────

# Ceiling on the cooperative budget. A client may request a shorter one.
MAX_REQUEST_SECONDS = 300.0
DEFAULT_REQUEST_SECONDS = 240.0

# How long a caller may wait for a slot before being told to come back. Kept
# well under a typical proxy idle timeout so the client sees our 429, not a
# gateway error with no explanation.
MAX_QUEUE_WAIT_SECONDS = 20.0

# One calculation at a time. torch will happily use both cores for a single
# MACE forward pass, so a second concurrent job does not double throughput --
# it halves both jobs and doubles the chance neither finishes.
_CALC_SLOTS = asyncio.Semaphore(1)

# Keep torch from oversubscribing. Without this, torch defaults to one thread
# per visible core and then competes with itself under the semaphore.
try:
    torch.set_num_threads(2)
except Exception:  # noqa: BLE001 -- never let a tuning call break startup
    pass


def _clamp_time_budget(params_obj: dict) -> dict:
    """
    Bound the cooperative budget, and record what was done.

    A client-supplied value is honoured when it is SHORTER than our ceiling and
    silently raised to nothing -- a request for a 3-hour NEB on a shared free
    Space is not a request we can grant, and pretending otherwise would hang
    every other visitor behind it.
    """
    requested = params_obj.get("timeBudgetSeconds")
    try:
        value = float(requested) if requested is not None else DEFAULT_REQUEST_SECONDS
    except (TypeError, ValueError):
        value = DEFAULT_REQUEST_SECONDS
    params_obj["timeBudgetSeconds"] = max(1.0, min(value, MAX_REQUEST_SECONDS))
    return params_obj


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

    # A second structure is the NEB product endpoint. The endpoint has always
    # accepted a list and used only files[0]; a second entry is now meaningful
    # instead of silently discarded. run_calculation() rejects a product sent
    # with any calculation type other than "neb" rather than ignoring it — a
    # dropped second upload would compute a different calculation from the one
    # the user asked for.
    product_path = None
    if len(files) > 1:
        product = files[1]
        product_content = await product.read()
        with tempfile.NamedTemporaryFile(
            suffix=Path(product.filename or "product").suffix, delete=False
        ) as ptmp:
            ptmp.write(product_content)
            product_path = ptmp.name

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
        params_obj = _clamp_time_budget(params_obj)

        # Admission control. Waiting briefly is better than a 429 for a visitor
        # who arrived a second after someone else; waiting a minute is not.
        try:
            await asyncio.wait_for(_CALC_SLOTS.acquire(),
                                   timeout=MAX_QUEUE_WAIT_SECONDS)
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=429,
                detail=(
                    "This free CPU Space runs one calculation at a time and is "
                    "busy. Nothing was computed. Try again in a moment, or run "
                    "SimpleAtom locally for unqueued access."
                ),
                headers={"Retry-After": "30"},
            )

        try:
            # run_calculation is synchronous and CPU-bound, so it goes to the
            # threadpool. wait_for bounds what the CLIENT waits, and is honest
            # about its limit: a Python thread cannot be cancelled, so on
            # timeout the worker keeps running until its own cooperative budget
            # stops it. The semaphore -- released in the finally below only when
            # the work truly ends -- is what stops a second job piling on.
            result = await asyncio.wait_for(
                asyncio.to_thread(run_calculation, tmp_path, params_obj,
                                  model_path=model_path, product_path=product_path),
                timeout=MAX_REQUEST_SECONDS + 30.0,
            )
        finally:
            _CALC_SLOTS.release()

        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message", "Calculation failed"))
        return result
    except ValueError as e:
        # Validation failures -- an unknown calculationType or modelType, an
        # element the chosen model does not cover, a malformed seed, a NEB with
        # no product. These are the CALLER's error, and returning 500 would tell
        # an API consumer the server broke when in fact it correctly refused.
        # The message is the one the engine wrote and already names the fix.
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Calculation exceeded the {MAX_REQUEST_SECONDS:.0f}s limit for this "
                f"free CPU Space and was abandoned. No partial result is returned, "
                f"because a half-converged geometry reported as finished is worse "
                f"than an error. Try a smaller structure, a smaller model, or fewer "
                f"steps."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if model_path and os.path.exists(model_path):
            os.unlink(model_path)
        if product_path and os.path.exists(product_path):
            os.unlink(product_path)


class SmilesRequest(BaseModel):
    smiles: str


@app.post("/smiles-to-xyz")
async def convert_smiles(req: SmilesRequest):
    """Convert a SMILES string to a 3D XYZ structure using RDKit."""
    if _smiles_to_xyz is None:
        raise HTTPException(
            status_code=503,
            detail="SMILES conversion unavailable (smiles_to_xyz module not found)",
        )
    if not req.smiles or not req.smiles.strip():
        raise HTTPException(status_code=400, detail="Missing or empty SMILES string")
    try:
        result = _smiles_to_xyz(req.smiles.strip())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
async def models():
    """
    The model catalog as structured data.

    Served rather than hardcoded in the frontend so that the licence, element
    coverage and level of theory a user sees are the ones this deployment can
    actually load — a UI listing a checkpoint the installed mace-torch does not
    have would offer a calculation that can only fail.
    """
    import model_catalog
    return {
        "schemaVersion": model_catalog.CATALOG_SCHEMA_VERSION,
        "verifiedAgainstMaceVersion": model_catalog.VERIFIED_AGAINST_MACE_VERSION,
        "models": model_catalog.list_models(),
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "mace-api"}


@app.get("/")
async def root():
    """API info."""
    return {
        "name": "MACE API",
        "version": "1.3.0",
        "endpoints": {
            "POST /calculate": "Run MACE calculation on uploaded structure",
            "POST /smiles-to-xyz": "Convert SMILES to 3D XYZ structure",
            "GET /health": "Health check",
        },
    }
