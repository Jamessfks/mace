#!/usr/bin/env python3
"""
Split liquid water dataset into train and test sets for MACE training.
Dataset: BingqingCheng/ab-initio-thermodynamics-of-water (1593 configs).
"""
import numpy as np
from ase.io import read, write

def main():
    data_dir = "water_dataset/training-set"
    xyz_path = f"{data_dir}/dataset_1593.xyz"
    out_dir = "water_data"
    
    configs = read(xyz_path, index=":")
    n = len(configs)
    print(f"Loaded {n} configurations from {xyz_path}")
    
    # Shuffle and split: 90% train, 10% test (MACE will split train into train/valid via valid_fraction)
    rng = np.random.default_rng(123)
    indices = np.arange(n)
    rng.shuffle(indices)
    n_test = max(1, int(0.1 * n))
    n_train = n - n_test
    train_idx = indices[:n_train]
    test_idx = indices[n_train:]
    
    train_configs = [configs[i] for i in train_idx]
    test_configs = [configs[i] for i in test_idx]
    
    import os
    os.makedirs(out_dir, exist_ok=True)
    train_path = f"{out_dir}/train.xyz"
    test_path = f"{out_dir}/test.xyz"
    write(train_path, train_configs, format="extxyz")
    write(test_path, test_configs, format="extxyz")
    print(f"Train: {len(train_configs)} configs -> {train_path}")
    print(f"Test:  {len(test_configs)} configs -> {test_path}")

if __name__ == "__main__":
    main()
