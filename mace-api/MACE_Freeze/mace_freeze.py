#!/usr/bin/env python3
"""
mace_freeze.py

Goal:
-----
Prepare a checkpoint for fine-tuning where we decide WHICH PARTS
of the neural network should be frozen.

Why this exists:
---------------
Freezing is usually done during optimizer construction, but:
• training APIs change between MACE versions
• CLI training is stable

So this script:
1) reads an existing checkpoint
2) figures out which parameter names match your freeze patterns
3) records that decision in metadata
4) writes a new checkpoint
5) you feed that checkpoint into mace_run_train

This is the safest cross-version workflow.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Dict, Any

import torch


# -----------------------------------------------------------
# Load checkpoint file from disk
# -----------------------------------------------------------
def load_ckpt(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {path}")
    return torch.load(path, map_location="cpu")


# -----------------------------------------------------------
# Save checkpoint file
# -----------------------------------------------------------
def save_ckpt(obj: Dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(obj, path)


# -----------------------------------------------------------
# Extract where the model weights live
# MACE versions store them differently.
# -----------------------------------------------------------
def extract_state_dict(ckpt: Dict[str, Any]) -> Dict[str, torch.Tensor]:
    if "state_dict" in ckpt:
        return ckpt["state_dict"]
    if "model" in ckpt:
        return ckpt["model"]
    return ckpt


# -----------------------------------------------------------
# Decide which keys should be frozen
# -----------------------------------------------------------
def compute_freeze_keys(keys: List[str], freeze: List[str], unfreeze: List[str]) -> List[str]:
    frozen = []
    for k in keys:
        if any(p in k for p in freeze) and not any(p in k for p in unfreeze):
            frozen.append(k)
    return frozen


# -----------------------------------------------------------
# Main entry
# -----------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in_ckpt", type=Path, required=True)
    ap.add_argument("--out_ckpt", type=Path, required=True)
    ap.add_argument("--freeze", nargs="*", default=["embedding"])
    ap.add_argument("--unfreeze", nargs="*", default=[])
    ap.add_argument("--out_plan", type=Path, default=None)
    args = ap.parse_args()

    # Step 1 — read original model
    ckpt = load_ckpt(args.in_ckpt)

    # Step 2 — find parameter dictionary
    state = extract_state_dict(ckpt)

    # Step 3 — compute which will be frozen
    all_keys = list(state.keys())
    frozen_keys = compute_freeze_keys(all_keys, args.freeze, args.unfreeze)

    # Step 4 — create a human-readable plan
    plan = {
        "freeze_patterns": args.freeze,
        "unfreeze_patterns": args.unfreeze,
        "num_total_params": len(all_keys),
        "num_frozen_params": len(frozen_keys),
        "frozen_keys_sample": frozen_keys[:50],
    }

    # Step 5 — attach metadata
    ckpt.setdefault("metadata", {})
    ckpt["metadata"]["freeze_plan"] = plan

    # Step 6 — save new checkpoint
    save_ckpt(ckpt, args.out_ckpt)

    # Optional report
    if args.out_plan:
        args.out_plan.write_text(json.dumps(plan, indent=2))

    print("Done.")
    print(f"Frozen: {len(frozen_keys)} / {len(all_keys)}")
    print("Use this checkpoint when restarting training.")


if __name__ == "__main__":
    main()
