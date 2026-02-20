#!/usr/bin/env python3
"""
checkpoint_resolver.py

Helpers to robustly resolve MACE checkpoint files across versions.
Some runs save "best.pt", others keep only "*_epoch-<n>.pt".
"""

from __future__ import annotations

import re
from pathlib import Path

EPOCH_RE = re.compile(r"epoch-(\d+)\.pt$", re.IGNORECASE)


def resolve_checkpoint_in_dir(checkpoints_dir: Path) -> Path | None:
    """Return best available .pt checkpoint path in a checkpoints directory."""
    if not checkpoints_dir.exists() or not checkpoints_dir.is_dir():
        return None

    best = checkpoints_dir / "best.pt"
    if best.exists():
        return best

    pt_files = [p for p in checkpoints_dir.glob("*.pt") if p.is_file()]
    if not pt_files:
        return None

    def sort_key(path: Path) -> tuple[int, float]:
        m = EPOCH_RE.search(path.name)
        epoch = int(m.group(1)) if m else -1
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0.0
        return epoch, mtime

    pt_files.sort(key=sort_key, reverse=True)
    return pt_files[0]

