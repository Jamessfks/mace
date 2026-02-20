#!/usr/bin/env python3
"""
check_convergence.py — Evaluate active learning convergence criteria.

Purpose
-------
Determines whether the active learning loop has converged based on:
1. Committee disagreement below threshold (force RMS std < X meV/Å)
2. Validation MAE below thresholds (energy meV/atom, force meV/Å)
3. Pool exhaustion (no structures above disagreement cutoff)

Used by the MACE Freeze web UI to suggest stopping and by the convergence API.

Usage
-----
  python check_convergence.py --run_id RUN_ID --iter ITER [--thresholds_json PATH]
  python check_convergence.py --disagreement_json PATH [--validation_mae_energy X] [--validation_mae_force Y]

Output: JSON with converged (bool), reasons (list), and metrics.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import numpy as np

# Regex to parse MACE log lines for validation MAE (supports both MAE and RMSE)
# Examples:
#   Epoch 4: head: Default, loss=0.00025959, MAE_E_per_atom=    0.15 meV, MAE_F=    1.86 meV / A
#   Epoch 0: head: Default, loss=0.02708193, RMSE_E_per_atom=   26.14 meV, RMSE_F=   10.06 meV / A
MAE_EPOCH_RE = re.compile(
    r"Epoch\s+(\d+):\s+.*?(?:MAE_E_per_atom|RMSE_E_per_atom)\s*=\s*([\d.]+)\s*meV.*?(?:MAE_F|RMSE_F)\s*=\s*([\d.]+)\s*meV",
    re.IGNORECASE | re.DOTALL,
)


def parse_validation_mae_from_log(log_path: Path) -> tuple[float, float] | None:
    """
    Parse the last epoch's validation MAE (or RMSE) from a MACE training log.

    Returns:
        (mae_energy_meV_per_atom, mae_force_meV_per_A) or None if not found.
    """
    if not log_path.exists():
        return None
    text = log_path.read_text()
    matches = list(MAE_EPOCH_RE.finditer(text))
    if not matches:
        return None
    # Use last epoch (highest epoch number)
    last = max(matches, key=lambda m: int(m.group(1)))
    return (float(last.group(2)), float(last.group(3)))


def get_iteration_validation_mae(run_root: Path, iter_num: int, committee_size: int) -> tuple[float, float] | None:
    """
    Get validation MAE for an iteration by averaging across committee models (c0, c1, ...).

    Returns:
        (mae_energy, mae_force) averaged over committee, or None if no logs found.
    """
    iter_dir = run_root / f"iter_{iter_num:02d}"
    if not iter_dir.exists():
        return None
    energies: list[float] = []
    forces: list[float] = []
    for i in range(committee_size):
        log_path = iter_dir / f"c{i}" / "logs" / f"c{i}_run-{i}.log"
        parsed = parse_validation_mae_from_log(log_path)
        if parsed:
            energies.append(parsed[0])
            forces.append(parsed[1])
    if not energies or not forces:
        return None
    return (sum(energies) / len(energies), sum(forces) / len(forces))


def check_convergence(
    disagreement_data: dict[str, Any],
    validation_mae: tuple[float, float] | None = None,
    *,
    disagreement_max_threshold: float = 10.0,
    disagreement_mean_threshold: float = 5.0,
    mae_energy_threshold: float = 50.0,
    mae_force_threshold: float = 50.0,
    pool_exhaustion_cutoff: float = 1.0,
) -> dict[str, Any]:
    """
    Evaluate convergence criteria.

    Args:
        disagreement_data: JSON from model_disagreement.py (must have "stats" and "per_structure").
        validation_mae: Optional (mae_energy_meV_per_atom, mae_force_meV_per_A).
        disagreement_max_threshold: Max force RMS std (meV/Å) below which disagreement is "low".
        disagreement_mean_threshold: Mean force RMS std below which disagreement is "low".
        mae_energy_threshold: Validation MAE energy (meV/atom) below which model is "accurate".
        mae_force_threshold: Validation MAE force (meV/Å) below which model is "accurate".
        pool_exhaustion_cutoff: No structures with score above this → pool exhausted.

    Returns:
        {
            "converged": bool,
            "reasons": list[str],
            "suggest_stop": bool,
            "metrics": {...},
        }
    """
    reasons: list[str] = []
    metrics: dict[str, Any] = {}

    stats = disagreement_data.get("stats", {})
    per_structure = disagreement_data.get("per_structure", [])
    pool_size = disagreement_data.get("pool_size", len(per_structure))

    # Support legacy JSON without "stats" — compute from per_structure
    if stats:
        score_max = stats.get("max", 0.0)
        score_mean = stats.get("mean", 0.0)
        score_count = stats.get("count", 0)
    else:
        scores_arr = np.array([p.get("score", 0) for p in per_structure])
        score_max = float(np.max(scores_arr)) if len(scores_arr) > 0 else 0.0
        score_mean = float(np.mean(scores_arr)) if len(scores_arr) > 0 else 0.0
        score_count = len(scores_arr)

    # model_disagreement scores are in eV/Å; convert to meV/Å for user-facing metrics
    EV_PER_ANG_TO_MEV = 1000.0
    score_max_mev = score_max * EV_PER_ANG_TO_MEV
    score_mean_mev = score_mean * EV_PER_ANG_TO_MEV

    metrics["disagreement_max"] = score_max_mev
    metrics["disagreement_mean"] = score_mean_mev
    metrics["pool_size"] = pool_size

    # Criterion 1: Committee disagreement below threshold (thresholds in meV/Å)
    disagreement_low = score_max_mev <= disagreement_max_threshold and score_mean_mev <= disagreement_mean_threshold
    if disagreement_low:
        reasons.append(
            f"Committee disagreement is low (max={score_max_mev:.2f}, mean={score_mean_mev:.2f} meV/Å "
            f"≤ {disagreement_max_threshold}/{disagreement_mean_threshold})"
        )
    else:
        metrics["disagreement_reason"] = (
            f"Disagreement above threshold (max={score_max_mev:.2f}, mean={score_mean_mev:.2f} meV/Å)"
        )

    # Criterion 2: Pool exhaustion (no structures above cutoff; cutoff in meV/Å, scores in eV/Å)
    cutoff_ev = pool_exhaustion_cutoff / EV_PER_ANG_TO_MEV
    above_cutoff = sum(1 for p in per_structure if p.get("score", 0) > cutoff_ev)
    pool_exhausted = above_cutoff == 0 and score_count > 0
    if pool_exhausted:
        reasons.append(
            f"Pool exhausted: no structures with disagreement > {pool_exhaustion_cutoff} meV/Å"
        )
    metrics["structures_above_cutoff"] = above_cutoff

    # Criterion 3: Validation MAE below threshold
    mae_ok = False
    if validation_mae is not None:
        mae_energy, mae_force = validation_mae
        metrics["validation_mae_energy"] = mae_energy
        metrics["validation_mae_force"] = mae_force
        mae_ok = mae_energy <= mae_energy_threshold and mae_force <= mae_force_threshold
        if mae_ok:
            reasons.append(
                f"Validation MAE is good (E={mae_energy:.1f} meV/atom, F={mae_force:.1f} meV/Å "
                f"≤ {mae_energy_threshold}/{mae_force_threshold})"
            )
        else:
            metrics["mae_reason"] = (
                f"Validation MAE above threshold (E={mae_energy:.1f}, F={mae_force:.1f} meV)"
            )

    # Converged if at least one criterion is satisfied (OR logic)
    # Suggest stop if converged OR if validation MAE is good (user can stop early)
    converged = bool(reasons)
    suggest_stop = converged or (mae_ok if validation_mae is not None else False)

    return {
        "converged": converged,
        "reasons": reasons,
        "suggest_stop": suggest_stop,
        "metrics": metrics,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Check active learning convergence from disagreement and validation metrics."
    )
    ap.add_argument("--run_id", type=str, help="Run ID (e.g. UUID from runs_web)")
    ap.add_argument("--iter", type=int, default=0, help="Iteration number")
    ap.add_argument("--committee_size", type=int, default=2, help="Committee size for validation MAE lookup")
    ap.add_argument(
        "--disagreement_json",
        type=Path,
        help="Path to pool_disagreement.json (alternative to run_id/iter)",
    )
    ap.add_argument(
        "--validation_mae_energy",
        type=float,
        default=50.0,
        help="Threshold for validation MAE energy (meV/atom)",
    )
    ap.add_argument(
        "--validation_mae_force",
        type=float,
        default=50.0,
        help="Threshold for validation MAE force (meV/Å)",
    )
    ap.add_argument(
        "--disagreement_max",
        type=float,
        default=10.0,
        help="Max disagreement (meV/Å) below which committee is 'converged'",
    )
    ap.add_argument(
        "--disagreement_mean",
        type=float,
        default=5.0,
        help="Mean disagreement (meV/Å) below which committee is 'converged'",
    )
    ap.add_argument(
        "--pool_exhaustion_cutoff",
        type=float,
        default=1.0,
        help="No structures above this score → pool exhausted",
    )
    ap.add_argument(
        "--thresholds_json",
        type=Path,
        help="JSON file with threshold overrides",
    )
    args = ap.parse_args()

    # Load thresholds override if provided
    thresholds = {}
    if args.thresholds_json and args.thresholds_json.exists():
        thresholds = json.loads(args.thresholds_json.read_text())

    disagreement_max = thresholds.get("disagreement_max", args.disagreement_max)
    disagreement_mean = thresholds.get("disagreement_mean", args.disagreement_mean)
    mae_energy_threshold = thresholds.get("mae_energy", args.validation_mae_energy)
    mae_force_threshold = thresholds.get("mae_force", args.validation_mae_force)
    pool_exhaustion_cutoff = thresholds.get("pool_exhaustion_cutoff", args.pool_exhaustion_cutoff)

    # Resolve disagreement JSON path
    if args.disagreement_json:
        disagreement_path = args.disagreement_json
    elif args.run_id:
        script_dir = Path(__file__).resolve().parent
        run_root = script_dir / "runs_web" / args.run_id
        disagreement_path = run_root / f"iter_{args.iter:02d}" / "pool_disagreement.json"
    else:
        print(json.dumps({"error": "Provide --disagreement_json or --run_id"}))
        return

    if not disagreement_path.exists():
        result = {
            "converged": False,
            "reasons": [],
            "suggest_stop": False,
            "metrics": {},
            "error": f"Disagreement file not found: {disagreement_path}",
        }
        print(json.dumps(result, indent=2))
        return

    disagreement_data = json.loads(disagreement_path.read_text())

    # Get validation MAE if run_id provided
    validation_mae = None
    if args.run_id:
        script_dir = Path(__file__).resolve().parent
        run_root = script_dir / "runs_web" / args.run_id
        validation_mae = get_iteration_validation_mae(run_root, args.iter, args.committee_size)

    result = check_convergence(
        disagreement_data,
        validation_mae,
        disagreement_max_threshold=disagreement_max,
        disagreement_mean_threshold=disagreement_mean,
        mae_energy_threshold=mae_energy_threshold,
        mae_force_threshold=mae_force_threshold,
        pool_exhaustion_cutoff=pool_exhaustion_cutoff,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
