#!/bin/bash
# Train MACE on liquid water dataset
# Dataset: https://github.com/BingqingCheng/ab-initio-thermodynamics-of-water
# MACE docs: https://mace-docs.readthedocs.io/en/latest/examples/training_examples.html

set -e
cd "$(dirname "$0")"

# Use config file. Only CUDA is supported for GPU; MPS (Apple Silicon) is not (MACE uses float64 internally).
DEVICE=cpu
if python3 -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
  DEVICE=cuda
fi
echo "Using device: $DEVICE"

mace_run_train --config=water_mace_config.yaml --device="$DEVICE" "$@"
