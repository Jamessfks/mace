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
  QUICK_DEMO   — "1" for 5 epochs quick run, "0" for full
  SPLIT_WITH_POOL — "1" to produce pool.xyz for active learning (uses split_dataset_pool.py)
  POOL_FRACTION   — Fraction for pool when SPLIT_WITH_POOL=1 (default 0.2)
  COMMITTEE       — "1" to train multiple models (c0, c1, ...) for active learning
  COMMITTEE_SIZE  — Number of committee models when COMMITTEE=1 (default 2)
  ITER            — Iteration number for work_dir (default 0)
  FINE_TUNE       — "1" to use freeze fine-tuning workflow
  TRAIN_BASE_FIRST — "1" to train base model before freezing (default 1)
  BASE_CHECKPOINT_PATH — Optional path to an existing base checkpoint
  FREEZE_INIT_PATH — Optional path to existing freeze_init.pt
  FREEZE_PATTERNS_JSON / UNFREEZE_PATTERNS_JSON — JSON arrays for mace_freeze.py

Stdout: One JSON object per line. Events:
  {"event": "log", "message": "..."}
  {"event": "progress", "epoch": int, "loss": float, "mae_energy": float, "mae_force": float}
  {"event": "done", "run_dir": str, "checkpoint_path": str, "freeze_init_path": str?}
  {"event": "error", "message": str}
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

# Script dir = MACE_Freeze (we are run with cwd = MACE_Freeze)
SCRIPT_DIR = Path(__file__).resolve().parent

# MACE log line: "INFO: Epoch 0: loss=1.6e-02, MAE_E_per_atom=187.21 meV, MAE_F=115.81 meV / A, ..."
EPOCH_RE = re.compile(
    r"Epoch\s+(\d+):\s+loss=([\d.eE+-]+).*?MAE_E_per_atom=([\d.]+)\s*meV.*?MAE_F=([\d.]+)\s*meV(?:\s*/\s*A)?",
    re.IGNORECASE | re.DOTALL,
)


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def parse_patterns(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name, "")
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            values = [str(v).strip() for v in parsed if str(v).strip()]
            return values or default
    except json.JSONDecodeError:
        pass
    values = [v.strip() for v in raw.split(",") if v.strip()]
    return values or default


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
            "--max_num_epochs", str(max_epochs),
            "--forces_weight", "100",
            "--energy_weight", "1",
            "--default_dtype", "float32",
            "--save_cpu",
        ]
    else:
        swa_start = 1 if max_epochs <= 1 else max(1, min(max_epochs - 1, max_epochs // 2))
        extra = [
            "--E0s", "average",
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
            "--max_num_epochs", str(max_epochs),
            "--start_swa", str(swa_start),
            "--scheduler_patience", "15",
            "--patience", "30",
            "--eval_interval", "4",
            "--ema", "--swa",
            "--error_table", "PerAtomMAE",
            "--default_dtype", "float64",
            "--restart_latest",
            "--save_cpu",
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


def run_mace_train(
    train_file: Path,
    valid_file: Path,
    work_dir: Path,
    name: str,
    seed: int,
    device: str,
    extra: list[str],
    progress_model: str | None = None,
) -> int:
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
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        m = EPOCH_RE.search(line)
        if m:
            payload = {
                "event": "progress",
                "epoch": int(m.group(1)),
                "loss": float(m.group(2)),
                "mae_energy": float(m.group(3)),
                "mae_force": float(m.group(4)),
            }
            if progress_model:
                payload["model"] = progress_model
            emit(payload)
        else:
            emit({"event": "log", "message": line})
    proc.wait()
    return proc.returncode


def main() -> int:
    run_id = os.environ.get("RUN_ID", "web_run")
    use_bundled = os.environ.get("USE_BUNDLED", "1") == "1"
    dataset_path = os.environ.get("DATASET_PATH", "")
    run_name = os.environ.get("RUN_NAME", "web_train")
    seed = int(os.environ.get("SEED", "1"))
    device = os.environ.get("DEVICE", "cpu")
    quick_demo = os.environ.get("QUICK_DEMO", "1") == "1"
    iter_num = int(os.environ.get("ITER", "0"))
    committee_mode = os.environ.get("COMMITTEE", "0") == "1"
    committee_size = int(os.environ.get("COMMITTEE_SIZE", "2"))
    split_with_pool = os.environ.get("SPLIT_WITH_POOL", "0") == "1"
    if committee_mode:
        split_with_pool = True

    fine_tune = os.environ.get("FINE_TUNE", "0") == "1"
    train_base_first = os.environ.get("TRAIN_BASE_FIRST", "1") == "1"
    max_epochs_default = 5 if quick_demo else 800
    max_epochs = parse_positive_int("MAX_EPOCHS", max_epochs_default)
    base_checkpoint_path_env = os.environ.get("BASE_CHECKPOINT_PATH", "").strip()
    freeze_init_path_env = os.environ.get("FREEZE_INIT_PATH", "").strip()
    freeze_patterns = parse_patterns("FREEZE_PATTERNS_JSON", ["embedding", "radial"])
    unfreeze_patterns = parse_patterns("UNFREEZE_PATTERNS_JSON", ["readout"])

    run_root = SCRIPT_DIR / "runs_web" / run_id
    if committee_mode:
        work_dir = run_root / f"iter_{iter_num:02d}"
        data_dir = run_root / "data"
    else:
        work_dir = run_root
        data_dir = work_dir / "data"
    work_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    train_file = data_dir / "train.xyz"
    valid_file = data_dir / "valid.xyz"
    pool_file = data_dir / "pool.xyz"

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

    pool_fraction = float(os.environ.get("POOL_FRACTION", "0.2"))
    emit({"event": "log", "message": "Splitting dataset..." + (" (with pool for active learning)" if split_with_pool else "")})
    try:
        if split_with_pool:
            split_cmd = [
                sys.executable,
                str(SCRIPT_DIR / "split_dataset_pool.py"),
                "--input", str(input_path),
                "--train_out", str(train_file),
                "--valid_out", str(valid_file),
                "--pool_out", str(pool_file),
                "--valid_fraction", "0.1",
                "--pool_fraction", str(pool_fraction),
                "--seed", str(seed),
            ]
        else:
            split_cmd = [
                sys.executable,
                str(SCRIPT_DIR / "split_dataset.py"),
                "--input", str(input_path),
                "--train_out", str(train_file),
                "--valid_out", str(valid_file),
                "--valid_fraction", "0.1",
                "--seed", str(seed),
            ]
        subprocess.run(split_cmd, check=True, cwd=SCRIPT_DIR, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        emit({"event": "error", "message": f"Split failed: {e.stderr or str(e)}"})
        return 1

    model_override_path: str | None = None
    freeze_plan_path: str | None = None
    if fine_tune:
        emit({"event": "log", "message": "Fine-tune mode enabled. Preparing freeze-init checkpoint..."})
        if freeze_init_path_env:
            freeze_init_path = Path(freeze_init_path_env).expanduser()
            if not freeze_init_path.exists():
                emit({"event": "error", "message": f"Provided freeze_init checkpoint not found: {freeze_init_path}"})
                return 1
            model_override_path = str(freeze_init_path)
        else:
            if base_checkpoint_path_env:
                base_checkpoint_path = Path(base_checkpoint_path_env).expanduser()
                if not base_checkpoint_path.exists():
                    emit({"event": "error", "message": f"Provided base checkpoint not found: {base_checkpoint_path}"})
                    return 1
            else:
                if not train_base_first:
                    emit({
                        "event": "error",
                        "message": "Fine-tune mode requires base checkpoint path or TRAIN_BASE_FIRST=1.",
                    })
                    return 1
                emit({"event": "log", "message": "Training base model before freezing..."})
                base_work_dir = run_root / "base"
                base_name = "base_model"
                base_extra = build_extra(quick_demo=quick_demo, model_path=None, max_epochs=max_epochs)
                rc = run_mace_train(
                    train_file=train_file,
                    valid_file=valid_file,
                    work_dir=base_work_dir,
                    name=base_name,
                    seed=seed,
                    device=device,
                    extra=base_extra,
                    progress_model="base",
                )
                if rc != 0:
                    emit({"event": "error", "message": f"Base model training failed with code {rc}"})
                    return rc
                base_ckpt_dir = base_work_dir / base_name / "checkpoints"
                resolved_base_ckpt = resolve_checkpoint_in_dir(base_ckpt_dir)
                if resolved_base_ckpt is None:
                    emit({"event": "error", "message": f"Base checkpoint missing in: {base_ckpt_dir}"})
                    return 1
                base_checkpoint_path = resolved_base_ckpt

            freeze_dir = run_root / "freeze"
            freeze_dir.mkdir(parents=True, exist_ok=True)
            freeze_init_path = freeze_dir / "freeze_init.pt"
            freeze_plan = freeze_dir / "freeze_plan.json"

            freeze_cmd = [
                sys.executable,
                str(SCRIPT_DIR / "mace_freeze.py"),
                "--in_ckpt", str(base_checkpoint_path),
                "--out_ckpt", str(freeze_init_path),
                "--out_plan", str(freeze_plan),
                "--freeze", *freeze_patterns,
            ]
            if unfreeze_patterns:
                freeze_cmd += ["--unfreeze", *unfreeze_patterns]
            try:
                subprocess.run(freeze_cmd, check=True, cwd=SCRIPT_DIR, capture_output=True, text=True)
            except subprocess.CalledProcessError as e:
                emit({"event": "error", "message": f"mace_freeze.py failed: {e.stderr or str(e)}"})
                return 1
            model_override_path = str(freeze_init_path)
            freeze_plan_path = str(freeze_plan)
            try:
                plan_data = json.loads(freeze_plan.read_text())
                if int(plan_data.get("num_frozen_params", 0)) == 0:
                    emit({
                        "event": "log",
                        "message": "Warning: freeze patterns matched 0 parameters. Training will continue.",
                    })
            except Exception:
                pass
            emit({
                "event": "log",
                "message": f"Freeze complete. init={freeze_init_path} plan={freeze_plan}",
            })

    emit({"event": "log", "message": "Starting MACE training..." + (" (committee mode)" if committee_mode else "")})
    extra = build_extra(quick_demo=quick_demo, model_path=model_override_path, max_epochs=max_epochs)

    checkpoints: list[str] = []
    if committee_mode:
        for i in range(committee_size):
            name = f"c{i}"
            emit({"event": "log", "message": f"Training committee model {name}..."})
            if model_override_path:
                try:
                    seeded_path = seed_checkpoint_for_run(
                        Path(model_override_path), work_dir, name, i
                    )
                    emit({
                        "event": "log",
                        "message": f"Loaded fine-tune init checkpoint for {name}: {seeded_path}",
                    })
                except Exception as e:
                    emit({"event": "error", "message": f"Failed to prepare fine-tune checkpoint for {name}: {e}"})
                    return 1
            rc = run_mace_train(
                train_file=train_file,
                valid_file=valid_file,
                work_dir=work_dir,
                name=name,
                seed=i,
                device=device,
                extra=extra,
                progress_model=name,
            )
            if rc != 0:
                emit({"event": "error", "message": f"Model {name} failed with code {rc}"})
                return rc
            resolved_ckpt = resolve_checkpoint_in_dir(work_dir / name / "checkpoints")
            if resolved_ckpt is not None:
                checkpoints.append(str(resolved_ckpt))

        result = {
            "event": "done",
            "run_id": run_id,
            "iter": iter_num,
            "run_dir": str(work_dir),
            "checkpoints": checkpoints,
            "committee_size": committee_size,
            "fine_tune": fine_tune,
        }
        if split_with_pool and pool_file.exists():
            result["pool_path"] = str(pool_file)
        if model_override_path:
            result["freeze_init_path"] = model_override_path
        if freeze_plan_path:
            result["freeze_plan_path"] = freeze_plan_path
        emit(result)
        return 0

    if model_override_path:
        try:
            seeded_path = seed_checkpoint_for_run(
                Path(model_override_path), work_dir, run_name, seed
            )
            emit({
                "event": "log",
                "message": f"Loaded fine-tune init checkpoint for {run_name}: {seeded_path}",
            })
        except Exception as e:
            emit({"event": "error", "message": f"Failed to prepare fine-tune checkpoint: {e}"})
            return 1

    rc = run_mace_train(
        train_file=train_file,
        valid_file=valid_file,
        work_dir=work_dir,
        name=run_name,
        seed=seed,
        device=device,
        extra=extra,
    )
    if rc != 0:
        emit({"event": "error", "message": f"Training exited with code {rc}"})
        return rc

    run_dir = work_dir / run_name
    resolved_single_ckpt = resolve_checkpoint_in_dir(run_dir / "checkpoints")
    checkpoint_path = resolved_single_ckpt if resolved_single_ckpt is not None else (run_dir / "checkpoints" / "best.pt")
    result = {
        "event": "done",
        "run_id": run_id,
        "run_name": run_name,
        "run_dir": str(run_dir),
        "checkpoint_path": str(checkpoint_path) if checkpoint_path.exists() else "",
        "fine_tune": fine_tune,
    }
    if split_with_pool and pool_file.exists():
        result["pool_path"] = str(pool_file)
    if model_override_path:
        result["freeze_init_path"] = model_override_path
    if freeze_plan_path:
        result["freeze_plan_path"] = freeze_plan_path
    emit(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
