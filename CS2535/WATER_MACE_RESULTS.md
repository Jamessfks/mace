# MACE Liquid Water Training – Results Summary

## Dataset

- **Source**: [BingqingCheng/ab-initio-thermodynamics-of-water](https://github.com/BingqingCheng/ab-initio-thermodynamics-of-water) (training-set)
- **Content**: 1593 bulk liquid water configurations with DFT energies (`TotEnergy`) and forces (`force`)
- **Elements**: H, O
- **Split**: 90% train (1434 configs) → 5% validation (71) + 95% training (1363); 10% held-out test (159 configs)

## Setup

- **Model**: MACE small (2 layers, 64 channels, max_L=0, r_max=6.0 Å), following [MACE liquid water example](https://mace-docs.readthedocs.io/en/latest/examples/training_examples.html#liquid-water)
- **Config**: `water_mace_config.yaml`
- **Keys**: `energy_key=TotEnergy`, `forces_key=force`
- **E0s**: Fitted with `E0s="average"` (H: -6.89 eV, O: -3.45 eV)
- **Training**: Adam, batch_size=16, EMA (decay=0.99), Stage Two from epoch 40

## Training Results (partial run)

Training was started and ran for several epochs on CPU. Metrics on the **validation set**:

| Stage   | MAE E/atom (meV) | MAE F (meV/Å) |
|--------|-------------------|----------------|
| Initial | 2.62              | 28.02          |
| Epoch 0| 32.84             | **7.75**       |
| Epoch 1| (see logs)        | (see logs)     |

- **Forces** improve quickly (28 → 7.75 meV/Å after 1 epoch).
- **Energy per atom** is noisier early in training; the MACE paper uses 800 epochs for the liquid water example, so longer training is expected to improve both.

## Files produced

| Path | Description |
|------|-------------|
| `water_data/train.xyz` | Training set (1434 configs) |
| `water_data/test.xyz` | Test set (159 configs) |
| `water_mace_config.yaml` | MACE training config |
| `run_water_training.sh` | Script to run training (auto-selects device) |
| `split_water_data.py` | Script that split dataset into train/test |
| `checkpoints/` | Model checkpoints (e.g. `water_1k_small_run-123_epoch-*.pt`) |
| `results/water_1k_small_run-123_train.txt` | Per-step/eval metrics (JSONL) |
| `logs/water_1k_small_run-123.log` | Training log |

## How to continue training

```bash
# Same command; --restart_latest loads latest checkpoint
mace_run_train --config=water_mace_config.yaml --device=cuda   # or cpu / mps
```

For full convergence, use more epochs in the config (e.g. `max_num_epochs: 800`, `start_swa: 400` as in the MACE docs).

## References

- MACE training examples: https://mace-docs.readthedocs.io/en/latest/examples/training_examples.html  
- MACE GitHub: https://github.com/ACEsuit/mace  
- Water dataset: https://github.com/BingqingCheng/ab-initio-thermodynamics-of-water  
