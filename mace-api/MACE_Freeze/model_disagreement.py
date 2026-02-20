#!/usr/bin/env python3
"""
model_disagreement.py

Purpose
-------
Given multiple trained MACE models, evaluate them on the same structures
and measure how much they disagree.

Big disagreement → model uncertain → good candidate for DFT.

We compute:
- energy std
- force rms std
- force vector std

Output:
JSON per structure.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
from ase.io import read
from mace.calculators import MACECalculator

EPOCH_SUFFIX_RE = re.compile(r"_epoch-\d+(?:_swa)?$", re.IGNORECASE)


def resolve_inference_model_path(model_path: Path) -> Path:
    """
    Prefer an exported .model artifact when a training checkpoint (.pt) is given.
    MACECalculator expects files that deserialize to a model object, while many
    *_epoch-*.pt files are optimizer checkpoints (dict payloads).
    """
    if model_path.suffix.lower() == ".model" and model_path.exists():
        return model_path

    parent = model_path.parent
    if not parent.exists():
        return model_path

    model_candidates = [p for p in parent.glob("*.model") if p.is_file()]
    if not model_candidates:
        return model_path

    base_stem = EPOCH_SUFFIX_RE.sub("", model_path.stem)
    matching = [p for p in model_candidates if p.stem == base_stem]
    ranked = matching if matching else model_candidates
    ranked.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return ranked[0]


# -----------------------------------------------------------
# Predict energies + forces using ONE model
# -----------------------------------------------------------
def predict_model(model_path: Path, atoms_list, device: str):
    """
    Returns:
        energies: List[float] length N
        forces:   List[(A,3)] length N
    """
    resolved_model = resolve_inference_model_path(model_path)
    try:
        calc = MACECalculator(model_paths=str(resolved_model), device=device)
    except AttributeError as exc:
        if "'dict' object has no attribute 'to'" in str(exc):
            raise RuntimeError(
                f"Model file is not inference-ready: {resolved_model}. "
                "This usually means a training checkpoint dict was passed. "
                "Use the exported *.model artifact in the same run directory."
            ) from exc
        raise

    energies = []
    forces = []

    for atoms in atoms_list:
        atoms.calc = calc  # attach calculator
        energies.append(atoms.get_potential_energy())
        forces.append(atoms.get_forces())

    return energies, forces


# -----------------------------------------------------------
# Score functions
# -----------------------------------------------------------

def score_force_rms_std(forces_stack):
    """
    forces_stack: (num_models, atoms, 3)

    1) magnitude per atom
    2) RMS per model
    3) std across models
    """
    mags = np.linalg.norm(forces_stack, axis=-1)
    rms = np.sqrt(np.mean(mags**2, axis=1))
    return float(np.std(rms))


def score_force_vec_std_mean(forces_stack):
    """
    std across models per vector → average magnitude.
    """
    std_vec = np.std(forces_stack, axis=0)
    per_atom = np.linalg.norm(std_vec, axis=-1)
    return float(np.mean(per_atom))


# -----------------------------------------------------------
# Main
# -----------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", type=Path, required=True)
    ap.add_argument("--xyz", type=Path, required=True)
    ap.add_argument("--out_json", type=Path, required=True)
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--score", default="force_rms_std")
    args = ap.parse_args()

    # Step 1 — load dataset
    atoms_list = read(str(args.xyz), ":")

    # Step 2 — predict with each model
    all_E = []
    all_F = []
    for m in args.models:
        e, f = predict_model(m, atoms_list, args.device)
        all_E.append(e)
        all_F.append(f)

    M = len(args.models)
    N = len(atoms_list)

    per_structure = []

    # Step 3 — compute disagreement per structure
    for i in range(N):
        energies = np.array([all_E[m][i] for m in range(M)])
        forces = np.stack([all_F[m][i] for m in range(M)], axis=0)

        if args.score == "energy_std":
            score = float(np.std(energies))
        elif args.score == "force_vec_std_mean":
            score = score_force_vec_std_mean(forces)
        else:
            score = score_force_rms_std(forces)

        per_structure.append({
            "i": i,
            "score": score,
            "energy_std": float(np.std(energies)),
        })

    # Step 4 — write result
    args.out_json.write_text(json.dumps({
        "models": [str(m) for m in args.models],
        "xyz": str(args.xyz),
        "per_structure": per_structure,
    }, indent=2))

    print("Finished disagreement calculation.")


if __name__ == "__main__":
    main()
