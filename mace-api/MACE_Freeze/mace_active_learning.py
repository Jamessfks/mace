#!/usr/bin/env python3
"""
mace_active_learning.py

This script chooses which structures should be labeled next.

Idea:
-----
High disagreement → model confused → valuable data.

We:
1) run committee
2) compute scores
3) pick top K
4) write them to extxyz
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

import numpy as np
from ase.io import read, write
from mace.calculators import MACECalculator


# -----------------------------------------------------------
# Prediction for one model
# -----------------------------------------------------------
def predict(model_path: Path, atoms_list, device: str):
    calc = MACECalculator(model_path=str(model_path), device=device)
    energies = []
    forces = []
    for atoms in atoms_list:
        atoms.calc = calc
        energies.append(atoms.get_potential_energy())
        forces.append(atoms.get_forces())
    return energies, forces


# -----------------------------------------------------------
# Disagreement metric
# -----------------------------------------------------------
def force_rms_std(forces_stack):
    mags = np.linalg.norm(forces_stack, axis=-1)
    rms = np.sqrt(np.mean(mags**2, axis=1))
    return float(np.std(rms))


# -----------------------------------------------------------
# Pick highest uncertainty
# -----------------------------------------------------------
def top_k(scores, k):
    idx = np.argpartition(-scores, k)[:k]
    return idx[np.argsort(-scores[idx])]


# -----------------------------------------------------------
# Main
# -----------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", type=Path, required=True)
    ap.add_argument("--pool_xyz", type=Path, required=True)
    ap.add_argument("--out_selected", type=Path, required=True)
    ap.add_argument("--k", type=int, default=50)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()

    # Step 1 — read pool
    atoms_list = read(str(args.pool_xyz), ":")

    # Step 2 — run each model
    all_forces: List[List[np.ndarray]] = []
    for m in args.models:
        _, f = predict(m, atoms_list, args.device)
        all_forces.append(f)

    M = len(args.models)
    N = len(atoms_list)

    # Step 3 — compute scores
    scores = np.zeros(N)
    for i in range(N):
        f_stack = np.stack([all_forces[m][i] for m in range(M)], axis=0)
        scores[i] = force_rms_std(f_stack)

    # Step 4 — select most uncertain
    sel_idx = top_k(scores, args.k)

    selected = [atoms_list[i] for i in sel_idx]
    write(str(args.out_selected), selected, format="extxyz")

    print(f"Selected {len(selected)} most uncertain structures.")


if __name__ == "__main__":
    main()
