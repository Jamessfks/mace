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

# Suppress all warnings so only JSON goes to stdout
warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

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

# Redirect all non-JSON output (MACE/PyTorch info messages) to stderr
import logging
logging.disable(logging.CRITICAL)

from calculate import run_calculation


if __name__ == "__main__":
    # Parse arguments: <file> <params_json> [--model-path <path>]
    model_path = None
    args = sys.argv[1:]

    if "--model-path" in args:
        idx = args.index("--model-path")
        if idx + 1 >= len(args):
            print(json.dumps({"status": "error", "message": "--model-path requires a file path argument"}))
            sys.exit(1)
        model_path = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    if not args:
        print(json.dumps({"status": "error", "message": "Usage: python calculate_local.py <file> [params_json] [--model-path <path>]"}))
        sys.exit(1)

    filepath = args[0]
    params_json = args[1] if len(args) > 1 else "{}"

    try:
        params = json.loads(params_json)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "message": "Invalid params JSON"}))
        sys.exit(1)

    try:
        result = run_calculation(filepath, params, model_path=model_path)
        print(json.dumps(result))
    except Exception as e:
        err_msg = str(e)
        if "CUDA" in err_msg or "cuda" in err_msg:
            err_msg += " (Hint: CUDA/GPU not available on this machine. Switch Device to CPU.)"
        elif "No module named" in err_msg:
            err_msg += " (Hint: required Python package not installed.)"
        print(json.dumps({"status": "error", "message": err_msg}))
        sys.exit(1)
