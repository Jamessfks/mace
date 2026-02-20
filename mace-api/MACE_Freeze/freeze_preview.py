#!/usr/bin/env python3
"""
freeze_preview.py

Preview freeze/unfreeze pattern matching without writing a new checkpoint.
Used by the web UI to show:
  - how many parameters would be frozen
  - whether patterns match nothing
  - auto-discovered module pattern suggestions
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from mace_freeze import load_ckpt, extract_state_dict, compute_freeze_keys


STOPWORDS = {
    "weight",
    "bias",
    "module",
    "model",
    "layers",
    "layer",
    "linear",
    "norm",
    "mlp",
    "block",
}

PRIORITY_PATTERNS = [
    "embedding",
    "radial",
    "readout",
    "interaction",
    "interactions",
    "products",
    "node",
    "edge",
    "symmetric",
    "message",
    "output",
    "atomic",
]


def normalize_patterns(values: list[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        for token in re.split(r"[\s,]+", value.strip()):
            if token:
                out.append(token)
    return out


def discover_patterns(keys: list[str], limit: int = 30) -> list[str]:
    counts: Counter[str] = Counter()
    for key in keys:
        for token in re.split(r"[._/]+", key.lower()):
            if len(token) < 3:
                continue
            if token.isdigit():
                continue
            if token in STOPWORDS:
                continue
            counts[token] += 1

    ordered: list[str] = []
    for p in PRIORITY_PATTERNS:
        if counts[p] > 0:
            ordered.append(p)
    for token, _count in counts.most_common(limit * 3):
        if token not in ordered:
            ordered.append(token)
        if len(ordered) >= limit:
            break
    return ordered


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in_ckpt", type=Path, required=True)
    ap.add_argument("--freeze", nargs="*", default=["embedding", "radial"])
    ap.add_argument("--unfreeze", nargs="*", default=["readout"])
    ap.add_argument("--sample", type=int, default=20)
    args = ap.parse_args()

    ckpt = load_ckpt(args.in_ckpt)
    state = extract_state_dict(ckpt)
    keys = list(state.keys())

    freeze_patterns = normalize_patterns(args.freeze)
    unfreeze_patterns = normalize_patterns(args.unfreeze)
    frozen = compute_freeze_keys(keys, freeze_patterns, unfreeze_patterns)

    result: dict[str, Any] = {
        "checkpoint": str(args.in_ckpt),
        "freeze_patterns": freeze_patterns,
        "unfreeze_patterns": unfreeze_patterns,
        "num_total_params": len(keys),
        "num_frozen_params": len(frozen),
        "num_trainable_params": len(keys) - len(frozen),
        "frozen_keys_sample": frozen[: max(1, args.sample)],
        "available_patterns": discover_patterns(keys),
        "warning": None,
    }
    if len(frozen) == 0:
        result["warning"] = "No parameters matched freeze/unfreeze patterns."

    print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
