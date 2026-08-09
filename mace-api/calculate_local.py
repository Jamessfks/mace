#!/usr/bin/env python3
"""
CLI wrapper for MACE calculations — runs locally, no FastAPI needed.

Usage:
  python calculate_local.py <structure_file> [params_json] [--model-path <path>]

Reads an atomic structure file, runs MACE, prints JSON result to stdout.
Called by the Next.js API route when no MACE_API_URL is set.
"""

import json
import sys
import os
import warnings

# Suppress Python warnings (deprecations etc.) — they are noise here.
warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

# Keep stdout pure JSON without silencing anything. MACE prints its dtype
# guidance ("Using float32 ... Use float64 for geometry optimization"), its
# model path and the ASL licence notice straight to stdout; the caller parses
# stdout from the first "{". Redirecting the process stdout to stderr and
# writing the result to the real stdout at the end makes that robust, and
# keeps upstream's messages readable in the server log instead of discarding
# them.
_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr

# PyTorch 2.6+ defaults torch.load to weights_only=True, but MACE checkpoints
# contain custom model classes (ScaleShiftMACE etc.) that require full unpickling.
# Patch torch.load before any MACE import to restore the old default.
import torch
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    if "weights_only" not in kwargs:
        kwargs["weights_only"] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

# Route library logging to stderr at WARNING and above. This used to be
# `logging.disable(logging.CRITICAL)`, which also hid MACECalculator's
# "Default dtype ... does not match model dtype, converting models to ..."
# warning — the one signal that a checkpoint was silently downcast.
# calculate.py now captures that warning into result["warnings"], which it
# cannot do if logging is disabled process-wide.
import logging
logging.basicConfig(
    level=logging.WARNING,
    stream=sys.stderr,
    format="%(levelname)s: %(message)s",
)

from calculate import run_calculation


def emit(payload: dict) -> None:
    """Write the one JSON document this process produces to the real stdout."""
    print(json.dumps(payload), file=_REAL_STDOUT, flush=True)


if __name__ == "__main__":
    # Parse arguments: <file> <params_json> [--model-path <path>]
    model_path = None
    args = sys.argv[1:]

    if "--model-path" in args:
        idx = args.index("--model-path")
        if idx + 1 >= len(args):
            emit({"status": "error", "message": "--model-path requires a file path argument"})
            sys.exit(1)
        model_path = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    if not args:
        emit({"status": "error", "message": "Usage: python calculate_local.py <file> [params_json] [--model-path <path>]"})
        sys.exit(1)

    filepath = args[0]
    params_json = args[1] if len(args) > 1 else "{}"

    try:
        params = json.loads(params_json)
    except json.JSONDecodeError:
        emit({"status": "error", "message": "Invalid params JSON"})
        sys.exit(1)

    try:
        result = run_calculation(filepath, params, model_path=model_path)
        emit(result)
    except Exception as e:
        err_msg = str(e)
        if "CUDA" in err_msg or "cuda" in err_msg:
            err_msg += " (Hint: CUDA/GPU not available on this machine. Switch Device to CPU.)"
        elif "No module named" in err_msg:
            err_msg += " (Hint: required Python package not installed.)"
        emit({"status": "error", "message": err_msg})
        sys.exit(1)
