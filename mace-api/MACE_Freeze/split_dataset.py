#!/usr/bin/env python3
"""
Split an XYZ / extxyz dataset into train and validation sets.

Example:
  python split_dataset.py \
    --input data/Liquid_Water.xyz \
    --train_out data/train.xyz \
    --valid_out data/valid.xyz \
    --valid_fraction 0.1
"""

import argparse
import random
from ase.io import read, write


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--train_out", required=True)
    ap.add_argument("--valid_out", required=True)
    ap.add_argument("--valid_fraction", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    # Fix randomness → reproducible split
    random.seed(args.seed)

    # Read all structures
    atoms_list = read(args.input, ":")

    n_total = len(atoms_list)
    n_valid = int(n_total * args.valid_fraction)

    # Shuffle indices
    indices = list(range(n_total))
    random.shuffle(indices)

    valid_idx = set(indices[:n_valid])

    train = []
    valid = []

    for i, atoms in enumerate(atoms_list):
        if i in valid_idx:
            valid.append(atoms)
        else:
            train.append(atoms)

    write(args.train_out, train, format="extxyz")
    write(args.valid_out, valid, format="extxyz")

    print(f"Total structures: {n_total}")
    print(f"Train: {len(train)}")
    print(f"Valid: {len(valid)}")


if __name__ == "__main__":
    main()
