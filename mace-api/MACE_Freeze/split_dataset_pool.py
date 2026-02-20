#!/usr/bin/env python3
"""
split_dataset_pool.py — Split dataset into train, validation, and pool.

For active learning we need a pool of unlabeled structures to select from.
This script splits: train (70%), valid (10%), pool (20%) by default.

Usage:
  python split_dataset_pool.py \\
    --input data/Liquid_Water.xyz \\
    --train_out data/train.xyz \\
    --valid_out data/valid.xyz \\
    --pool_out data/pool.xyz \\
    --valid_fraction 0.1 \\
    --pool_fraction 0.2
"""

import argparse
import random
from ase.io import read, write


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--train_out", required=True)
    ap.add_argument("--valid_out", required=True)
    ap.add_argument("--pool_out", required=True)
    ap.add_argument("--valid_fraction", type=float, default=0.1)
    ap.add_argument("--pool_fraction", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    atoms_list = read(args.input, ":")

    n_total = len(atoms_list)
    n_valid = int(n_total * args.valid_fraction)
    n_pool = int(n_total * args.pool_fraction)
    n_train = n_total - n_valid - n_pool
    n_train = max(1, n_train)

    indices = list(range(n_total))
    random.shuffle(indices)

    valid_idx = set(indices[:n_valid])
    pool_idx = set(indices[n_valid : n_valid + n_pool])
    train_idx = set(indices[n_valid + n_pool :])

    train = [atoms_list[i] for i in range(n_total) if i in train_idx]
    valid = [atoms_list[i] for i in range(n_total) if i in valid_idx]
    pool = [atoms_list[i] for i in range(n_total) if i in pool_idx]

    write(args.train_out, train, format="extxyz")
    write(args.valid_out, valid, format="extxyz")
    write(args.pool_out, pool, format="extxyz")

    print(f"Total: {n_total} | Train: {len(train)} | Valid: {len(valid)} | Pool: {len(pool)}")


if __name__ == "__main__":
    main()
