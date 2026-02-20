#!/usr/bin/env python3
"""
train_mace.py

Reproducible MACE training via Python:
- Fixes seeds
- Writes a run manifest (args, env, versions)
- Calls mace_run_train with explicit arguments

This is the most stable "Python-based" approach because
the CLI is consistent across MACE versions.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import numpy as np


@dataclass
class RunManifest:
    created_utc: str
    train_file: str
    valid_file: str
    work_dir: str
    name: str
    seed: int
    device: str
    mace_cli: str
    cli_args: List[str]
    python_version: str
    platform: str
    pip_freeze: Optional[str]


def set_all_seeds(seed: int) -> None:
    # Python randomness
    random.seed(seed)
    # Numpy randomness
    np.random.seed(seed)
    # Torch randomness (if torch exists in this env)
    try:
        import torch
        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        # More determinism (can be slower)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
        os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"
    except Exception:
        pass


def get_pip_freeze() -> Optional[str]:
    try:
        out = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
        return out
    except Exception:
        return None


def run(cmd: List[str]) -> None:
    print("Running:\n ", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train_file", required=True)
    ap.add_argument("--valid_file", required=True)
    ap.add_argument("--work_dir", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--device", default="cuda")
    # ap.add_argument("--mace_cli", default="mace_run_train")
    ap.add_argument("--extra", nargs=argparse.REMAINDER, default=[], help="Everything after --extra is forwarded to mace_run_train")
    args = ap.parse_args()

    def resolve_mace_cli() -> str:
        """
        Find mace_run_train that belongs to the SAME python
        interpreter running this script.
        """
        py = Path(sys.executable)
        scripts = py.parent / "Scripts" / "mace_run_train.exe"
        if scripts.exists():
            return str(scripts)
        return "mace_run_train"
    mace_cli = resolve_mace_cli()

    # ---------------------------------------------------
    # Prepare run directory
    # ---------------------------------------------------
    work_dir = Path(args.work_dir)
    run_dir = work_dir / args.name
    run_dir.mkdir(parents=True, exist_ok=True)

    # 1) Fix seeds for repeatability
    set_all_seeds(args.seed)

    # 2) Build the exact CLI command (make everything explicit)
    cli_cmd = [
        mace_cli,
        "--train_file", args.train_file,
        "--valid_file", args.valid_file,
        "--work_dir", str(run_dir),
        "--name", args.name,
        "--device", args.device,
        "--seed", str(args.seed),
        # put more explicit args here as you standardize:
        # "--epochs", "500",
        # "--batch_size", "10",
        # "--ema",
    ] + args.extra

    # 3) Write a manifest so the run is perfectly reproducible
    manifest = RunManifest(
        created_utc=datetime.utcnow().isoformat() + "Z",
        train_file=args.train_file,
        valid_file=args.valid_file,
        work_dir=str(run_dir),
        name=args.name,
        seed=args.seed,
        device=args.device,
        mace_cli=mace_cli,
        cli_args=cli_cmd,
        python_version=sys.version.replace("\n", " "),
        platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
        pip_freeze=get_pip_freeze(),
    )
    (run_dir / "manifest.json").write_text(json.dumps(asdict(manifest), indent=2))

    # 4) Run training
    run(cli_cmd)

    print(f"\nDone. Run directory: {run_dir}")
    print("Re-run exactly by copying cli_args from manifest.json")


if __name__ == "__main__":
    main()
