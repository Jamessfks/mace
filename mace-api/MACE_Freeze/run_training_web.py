#!/usr/bin/env python3
"""
run_training_web.py — Wrapper for no-code MACE training from the web UI.

Reads config from environment variables, runs split_dataset then mace_train,
and streams JSON progress events to stdout so the Next.js API can forward
them to the client for live graphs.

Environment:
  RUN_ID       — Unique run id (e.g. UUID). work_dir = runs_web/RUN_ID
  USE_BUNDLED  — "1" to use data/Liquid_Water.xyz, else "0"
  DATASET_PATH — Absolute path to uploaded .xyz (when USE_BUNDLED=0)
  RUN_NAME     — Name for this training run (e.g. "web_train_1")
  SEED         — Random seed (default 1)
  DEVICE       — "cpu" or "cuda"
  QUICK_DEMO   — "1" for 15 epochs quick run, "0" for full

Stdout: One JSON object per line. Events:
  {"event": "log", "message": "..."}
  {"event": "progress", "epoch": int, "loss": float, "mae_energy": float, "mae_force": float}
  {"event": "done", "run_dir": str, "checkpoint_path": str}
  {"event": "error", "message": str}
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Script dir = MACE_Freeze (we are run with cwd = MACE_Freeze)
SCRIPT_DIR = Path(__file__).resolve().parent

# MACE log line: "INFO: Epoch 0: loss=1.6e-02, MAE_E_per_atom=187.21 meV, MAE_F=115.81 meV / A, ..."
EPOCH_RE = re.compile(
    r"Epoch\s+(\d+):\s+loss=([\d.eE+-]+).*?MAE_E_per_atom=([\d.]+)\s*meV.*?MAE_F=([\d.]+)\s*meV(?:\s*/\s*A)?",
    re.IGNORECASE | re.DOTALL,
)


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def main() -> int:
    run_id = os.environ.get("RUN_ID", "web_run")
    use_bundled = os.environ.get("USE_BUNDLED", "1") == "1"
    dataset_path = os.environ.get("DATASET_PATH", "")
    run_name = os.environ.get("RUN_NAME", "web_train")
    seed = int(os.environ.get("SEED", "1"))
    device = os.environ.get("DEVICE", "cpu")
    quick_demo = os.environ.get("QUICK_DEMO", "1") == "1"

    work_dir = SCRIPT_DIR / "runs_web" / run_id
    data_dir = work_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    train_file = data_dir / "train.xyz"
    valid_file = data_dir / "valid.xyz"

    # ---- Input path for split ----
    if use_bundled:
        input_path = SCRIPT_DIR / "data" / "Liquid_Water.xyz"
        if not input_path.exists():
            emit({"event": "error", "message": f"Bundled data not found: {input_path}"})
            return 1
    else:
        if not dataset_path or not Path(dataset_path).exists():
            emit({"event": "error", "message": "Uploaded dataset path missing or file not found."})
            return 1
        input_path = Path(dataset_path)

    # ---- Split ----
    emit({"event": "log", "message": "Splitting dataset..."})
    try:
        subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "split_dataset.py"),
                "--input", str(input_path),
                "--train_out", str(train_file),
                "--valid_out", str(valid_file),
                "--valid_fraction", "0.1",
                "--seed", str(seed),
            ],
            check=True,
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        emit({"event": "error", "message": f"Split failed: {e.stderr or str(e)}"})
        return 1

    emit({"event": "log", "message": "Starting MACE training..."})

    # ---- Build mace_train extra args ----
    if quick_demo:
        extra = [
            "--E0s", "average",
            "--energy_key", "TotEnergy",
            "--forces_key", "force",
            "--num_interactions", "1",
            "--num_channels", "32",
            "--max_L", "0",
            "--correlation", "2",
            "--r_max", "5.0",
            "--batch_size", "8",
            "--valid_batch_size", "8",
            "--max_num_epochs", "15",
            "--forces_weight", "100",
            "--energy_weight", "1",
            "--default_dtype", "float32",
            "--save_cpu",
        ]
    else:
        extra = [
            "--E0s", "average",
            "--model", "MACE",
            "--num_interactions", "2",
            "--num_channels", "64",
            "--max_L", "0",
            "--correlation", "3",
            "--r_max", "6.0",
            "--forces_weight", "1000",
            "--energy_weight", "10",
            "--energy_key", "TotEnergy",
            "--forces_key", "force",
            "--batch_size", "2",
            "--valid_batch_size", "4",
            "--max_num_epochs", "800",
            "--start_swa", "400",
            "--scheduler_patience", "15",
            "--patience", "30",
            "--eval_interval", "4",
            "--ema", "--swa",
            "--error_table", "PerAtomMAE",
            "--default_dtype", "float64",
            "--restart_latest",
            "--save_cpu",
        ]

    cmd = [
        sys.executable, "-u",
        str(SCRIPT_DIR / "mace_train.py"),
        "--train_file", str(train_file),
        "--valid_file", str(valid_file),
        "--work_dir", str(work_dir),
        "--name", run_name,
        "--seed", str(seed),
        "--device", device,
        "--extra",
    ] + extra

    run_dir = work_dir / run_name
    checkpoint_path = run_dir / "checkpoints" / "best.pt"

    proc = subprocess.Popen(
        cmd,
        cwd=SCRIPT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        m = EPOCH_RE.search(line)
        if m:
            epoch, loss, mae_e, mae_f = int(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4))
            emit({
                "event": "progress",
                "epoch": epoch,
                "loss": loss,
                "mae_energy": mae_e,
                "mae_force": mae_f,
            })
        else:
            emit({"event": "log", "message": line})

    proc.wait()
    if proc.returncode != 0:
        emit({"event": "error", "message": f"Training exited with code {proc.returncode}"})
        return proc.returncode

    emit({
        "event": "done",
        "run_id": run_id,
        "run_name": run_name,
        "run_dir": str(run_dir),
        "checkpoint_path": str(checkpoint_path),
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
