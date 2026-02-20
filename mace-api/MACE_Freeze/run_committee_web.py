#!/usr/bin/env python3
"""
run_committee_web.py — Train a committee of MACE models (different seeds) for active learning.

Reads config from env. Assumes data/train.xyz and data/valid.xyz already exist
(from run_training_web with SPLIT_WITH_POOL or from a previous iteration).
Trains COMMITTEE_SIZE models (c0, c1, ...) with seeds 0, 1, 2, ...
Streams progress as JSON to stdout.

Environment:
  RUN_ID, ITER (e.g. 0), COMMITTEE_SIZE (default 2 for quick demo)
  DATA_DIR (path to dir with train.xyz, valid.xyz)
  DEVICE, QUICK_DEMO
  MODEL_PATH (optional, e.g. freeze_init.pt for fine-tuning)
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from checkpoint_resolver import resolve_checkpoint_in_dir

SCRIPT_DIR = Path(__file__).resolve().parent
EPOCH_RE = re.compile(
    r"Epoch\s+(\d+):\s+loss=([\d.eE+-]+).*?MAE_E_per_atom=([\d.]+)\s*meV.*?MAE_F=([\d.]+)\s*meV(?:\s*/\s*A)?",
    re.IGNORECASE | re.DOTALL,
)


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def parse_positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def build_extra(quick_demo: bool, model_path: str | None, max_epochs: int) -> list[str]:
    max_epochs = max(1, int(max_epochs))
    if quick_demo:
        extra = [
            "--E0s", "average", "--energy_key", "TotEnergy", "--forces_key", "force",
            "--num_interactions", "1", "--num_channels", "32", "--max_L", "0",
            "--correlation", "2", "--r_max", "5.0", "--batch_size", "8",
            "--valid_batch_size", "8", "--max_num_epochs", str(max_epochs),
            "--forces_weight", "100", "--energy_weight", "1",
            "--default_dtype", "float32", "--save_cpu",
        ]
    else:
        extra = [
            "--E0s", "average", "--energy_key", "TotEnergy", "--forces_key", "force",
            "--num_interactions", "2", "--num_channels", "64", "--max_L", "0",
            "--correlation", "3", "--r_max", "6.0", "--batch_size", "2",
            "--valid_batch_size", "4", "--max_num_epochs", str(max_epochs),
            "--forces_weight", "1000", "--energy_weight", "10",
            "--default_dtype", "float64", "--save_cpu",
        ]
    if model_path:
        if "--restart_latest" not in extra:
            extra.append("--restart_latest")
        return extra
    if not quick_demo:
        return ["--model", "MACE"] + extra
    return extra


def seed_checkpoint_for_run(source_ckpt: Path, work_dir: Path, name: str, seed: int) -> Path:
    if not source_ckpt.exists():
        raise FileNotFoundError(f"Seed checkpoint not found: {source_ckpt}")
    ckpt_dir = work_dir / name / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    existing = resolve_checkpoint_in_dir(ckpt_dir)
    if existing is not None:
        return existing
    target = ckpt_dir / f"{name}_run-{seed}_epoch-0.pt"
    shutil.copy2(source_ckpt, target)
    return target


def main() -> int:
    run_id = os.environ.get("RUN_ID", "web_run")
    iter_num = int(os.environ.get("ITER", "0"))
    committee_size = int(os.environ.get("COMMITTEE_SIZE", "2"))
    data_dir = Path(os.environ.get("DATA_DIR", ""))
    device = os.environ.get("DEVICE", "cpu")
    quick_demo = os.environ.get("QUICK_DEMO", "1") == "1"
    max_epochs_default = 5 if quick_demo else 200
    max_epochs = parse_positive_int("MAX_EPOCHS", max_epochs_default)
    model_path_env = os.environ.get("MODEL_PATH", "").strip()
    model_path = Path(model_path_env).expanduser() if model_path_env else None

    if not data_dir or not data_dir.exists():
        emit({"event": "error", "message": "DATA_DIR missing or invalid"})
        return 1
    if model_path and not model_path.exists():
        emit({"event": "error", "message": f"MODEL_PATH not found: {model_path}"})
        return 1

    train_file = data_dir / "train.xyz"
    valid_file = data_dir / "valid.xyz"
    if not train_file.exists() or not valid_file.exists():
        emit({"event": "error", "message": "train.xyz or valid.xyz not found in DATA_DIR"})
        return 1

    work_dir = SCRIPT_DIR / "runs_web" / run_id / f"iter_{iter_num:02d}"
    work_dir.mkdir(parents=True, exist_ok=True)

    extra = build_extra(
        quick_demo=quick_demo,
        model_path=str(model_path) if model_path else None,
        max_epochs=max_epochs,
    )

    checkpoints = []
    for i in range(committee_size):
        name = f"c{i}"
        seed = i
        emit({"event": "log", "message": f"Training committee model {name} (seed {seed})..."})
        if model_path is not None:
            try:
                seeded_path = seed_checkpoint_for_run(model_path, work_dir, name, seed)
                emit({
                    "event": "log",
                    "message": f"Loaded fine-tune init checkpoint for {name}: {seeded_path}",
                })
            except Exception as e:
                emit({"event": "error", "message": f"Failed to prepare fine-tune checkpoint for {name}: {e}"})
                return 1
        cmd = [
            sys.executable, "-u",
            str(SCRIPT_DIR / "mace_train.py"),
            "--train_file", str(train_file),
            "--valid_file", str(valid_file),
            "--work_dir", str(work_dir),
            "--name", name,
            "--seed", str(seed),
            "--device", device,
            "--extra",
        ] + extra

        proc = subprocess.Popen(
            cmd,
            cwd=SCRIPT_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            m = EPOCH_RE.search(line)
            if m:
                emit({
                    "event": "progress",
                    "model": name,
                    "epoch": int(m.group(1)),
                    "loss": float(m.group(2)),
                    "mae_energy": float(m.group(3)),
                    "mae_force": float(m.group(4)),
                })
            else:
                emit({"event": "log", "message": line})
        proc.wait()
        if proc.returncode != 0:
            emit({"event": "error", "message": f"Model {name} failed with code {proc.returncode}"})
            return proc.returncode
        resolved_ckpt = resolve_checkpoint_in_dir(work_dir / name / "checkpoints")
        if resolved_ckpt is not None:
            checkpoints.append(str(resolved_ckpt))

    emit({
        "event": "done",
        "run_id": run_id,
        "iter": iter_num,
        "work_dir": str(work_dir),
        "checkpoints": checkpoints,
        "model_path": str(model_path) if model_path else None,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
