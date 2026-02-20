# MACE Training + Freeze + Active Learning + “Model Merge” (Committee Disagreement)

This repo provides a reproducible workflow to:
1) split a dataset
2) train a MACE model (reproducibly)
3) optionally freeze parts of a model for fine-tuning
4) run a committee of models and compute disagreement (“model merge” idea)
5) select top-K uncertain structures for active learning
6) repeat

> **Environment note (Windows + AMD GPU):**
> - `--device cuda` is NVIDIA-only.
> - On Windows with AMD GPU, use `--device cpu` for MACE/PyTorch unless you have a special GPU stack.
> - All commands below use `--device cpu` for reliability.

---

## Files in this repo

- `split_dataset.py`  
  Split one dataset into `train.xyz` and `valid.xyz`.

- `split_dataset_pool.py`  
  Split into `train.xyz`, `valid.xyz`, and `pool.xyz` for active learning.

- `mace_train.py`  
  Reproducible training wrapper. Writes `manifest.json` and calls `mace_run_train` internally.

- `mace_freeze.py`  
  Creates a “freeze-init” checkpoint and freeze plan metadata (used when fine-tuning).

- `model_disagreement.py`  
  “Model merge” = run multiple models (committee) on the same structures and measure disagreement.

- `mace_active_learning.py`  
  Uses committee disagreement to pick top-K structures to label next.

- `label_with_reference.py`  
  Label structures with a reference calculator (MACE-MP-0 / EMT / Quantum ESPRESSO via ASE).

- `run_training_web.py` / `run_committee_web.py`  
  Web UI entry points for training and committee training.

---

## Step 0: Install dependencies

```bash
pip install mace-torch ase torch numpy
```
If you want real DFT labeling with Quantum ESPRESSO, see the installing section below.

### Installing Quantum ESPRESSO (optional, for `reference=qe`)

Quantum ESPRESSO is only required for DFT labeling (Step 7) when `reference=qe`.

1. Download source from the official site: [quantum-espresso.org](https://www.quantum-espresso.org/).
2. Build the plane-wave executable:

```bash
cd ~/Downloads/qe-7.5
./configure
make pw
```

After building, the binary to use is typically `qe-7.x/bin/pw.x`.

3. Make `pw.x` discoverable by one of:
   - adding the QE `bin/` directory to `PATH`
   - passing `--qe_command /absolute/path/to/pw.x` (or QE source/install root; resolver checks `bin/pw.x`)
   - setting `QE_COMMAND=/absolute/path/to/pw.x`
4. Provide pseudopotentials by passing `--pseudo_dir /path/to/upf` or setting `ESPRESSO_PSEUDO` / `QE_PSEUDO_DIR` (if omitted, backend attempts auto-detection from common QE/source locations).
5. Before using DFT labeling, run the preflight check:

```bash
python3 mace-api/MACE_Freeze/scripts/check_qe.py
# Optional: verify pseudo coverage for expected elements
python3 mace-api/MACE_Freeze/scripts/check_qe.py --symbols "H O"
```

## Step 1: Split dataset (if not split already)
```bash
python split_dataset.py
  --input data/Liquid_Water.xyz
  --train_out data/train.xyz
  --valid_out data/valid.xyz
  --valid_fraction 0.1
```
This means that 90% of the data will be for training while 10% is for validation

## Step 2: Train your first model!
```bash
python -u mace_train.py 
  --train_file data/train.xyz 
  --valid_file data/valid.xyz 
  --work_dir runs 
  --name water_1k_small 
  --seed 123 
  --device cpu 
  --extra 
    --E0s average 
    --model MACE 
    --num_interactions 2 
    --num_channels 64 
    --max_L 0 
    --correlation 3 
    --r_max 6.0 
    --forces_weight 1000 
    --energy_weight 10 
    --energy_key TotEnergy 
    --forces_key force 
    --batch_size 2 
    --valid_batch_size 4 
    --max_num_epochs 800 
    --start_swa 400 
    --scheduler_patience 15 
    --patience 30 
    --eval_interval 4 
    --ema 
    --swa 
    --error_table PerAtomMAE 
    --default_dtype float64 
    --restart_latest 
    --save_cpu
```
For a quick demo, run this instead
```bash
python -u mace_train.py 
--train_file data/train.xyz 
--valid_file data/valid.xyz 
--work_dir runs 
--name quick_demo 
--seed 1 
--device cpu 
--extra 
  --E0s average 
  --energy_key TotEnergy 
  --forces_key force 
  --num_interactions 1 
  --num_channels 32 
  --max_L 0 
  --correlation 2 
  --r_max 5.0 
  --batch_size 8 
  --valid_batch_size 8 
  --max_num_epochs 5 
  --forces_weight 100 
  --energy_weight 1 
  --default_dtype float32 
  --save_cpu
```
I know it looks like a lot, but a lot of these specifications are just very picky alterations to make sure everything stays consistent.

This will create a directory like this:
```bash
runs/water_1k_small/
  manifest.json
  checkpoints/
  logs...
```
## Step 3: (Optional) Freeze parts of a model (fine-tune)
### Freezing is useful when:
- you have a good base model
- you want to adapt to a new regime
- you want stability and faster convergence
#### NOTE: Freeze is for refinement, not initial learning. It is an optimization strategy, not a requirement.

### Create a freeze-init checkpoint
```bash
python mace_freeze.py
  --in_ckpt runs\water_1k_small\checkpoints\best.pt
  --out_ckpt runs\water_1k_small\freeze_init.pt
  --freeze embedding radial
  --unfreeze readout
  --out_plan runs\water_1k_small\freeze_plan.json
```
This writes:
- `freeze_init.pt` (checkpoint with metadata describing freeze plan)
- `freeze_plan.json` (human-readable)

To fine-tune from this checkpoint, **do not** pass the checkpoint path to `--model`
(`--model` is a model type such as `MACE`). Instead, seed the checkpoint into the
run checkpoint directory and resume with `--restart_latest`:
```bash
mkdir runs\iter_00\c0\checkpoints
copy /Y runs\water_1k_small\freeze_init.pt runs\iter_00\c0\checkpoints\c0_run-0_epoch-0.pt
python -u mace_train.py --train_file data/train.xyz --valid_file data/valid.xyz --work_dir runs\iter_00 --name c0 --seed 0 --device cpu --extra --E0s average --energy_key TotEnergy --forces_key force --max_num_epochs 200 --restart_latest --save_cpu
```
For a committee, repeat the same seeding pattern for `c1`, `c2`, ... using matching seed/file names.

## Step 4. “Model merge” aka: Train a committee (aka: multiple models but I want to sound smart)
### DISCLAIMER: WE ARE NOT MERGING WEIGHTS.
That is like averaging scientific outputs and expecting it to be accurate
Instead, we...

### Train multiple models with different seeds
```bash
python -u mace_train.py --train_file data/train.xyz --valid_file data/valid.xyz --work_dir runs\iter_00 --name c0 --seed 0 --device cpu --extra --E0s average --energy_key TotEnergy --forces_key force --max_num_epochs 200 --save_cpu
python -u mace_train.py --train_file data/train.xyz --valid_file data/valid.xyz --work_dir runs\iter_00 --name c1 --seed 1 --device cpu --extra --E0s average --energy_key TotEnergy --forces_key force --max_num_epochs 200 --save_cpu
python -u mace_train.py --train_file data/train.xyz --valid_file data/valid.xyz --work_dir runs\iter_00 --name c2 --seed 2 --device cpu --extra --E0s average --energy_key TotEnergy --forces_key force --max_num_epochs 200 --save_cpu
python -u mace_train.py --train_file data/train.xyz --valid_file data/valid.xyz --work_dir runs\iter_00 --name c3 --seed 3 --device cpu --extra --E0s average --energy_key TotEnergy --forces_key force --max_num_epochs 200 --save_cpu
```
### Compute committee disagreement (“model merge scoring”)
Prepare a pool file containing candidate unlabeled structures
```bash
data/pool.xyz
```
Run the disagreements
```bash
python model_disagreement.py
  --models 
      runs\iter_00\c0\checkpoints\best.pt  
      runs\iter_00\c1\checkpoints\best.pt
      runs\iter_00\c2\checkpoints\best.pt 
      runs\iter_00\c3\checkpoints\best.pt 
  --xyz data\pool.xyz 
  --out_json runs\iter_00\pool_disagreement.json 
  --device cpu 
  --score force_rms_std
```
Outputs a json that contains per-structure scores (higher = more disagreement = more uncertainty)
```
runs/iter_00/pool_disagreement.json
```

## Step 5. Active Learning selection (pick top-K uncertain structures)
```bash
python mace_active_learning.py ^
  --models runs\iter_00\c0\checkpoints\best.pt runs\iter_00\c1\checkpoints\best.pt runs\iter_00\c2\checkpoints\best.pt runs\iter_00\c3\checkpoints\best.pt ^
  --pool_xyz data\pool.xyz ^
  --out_selected runs\iter_00\to_label.xyz ^
  --k 50 ^
  --device cpu
```
This writes:
```bash
runs/iter_00/to_label.xyz (structures to label next)
```

## Step 6. Label the selected structures (external step)

Run your reference method (DFT / ab initio / etc.) to compute:
- energies
- forces

Write them back into extxyz.

Example output:
```bash
runs/iter_00/labeled_new.xyz
```

## Step 7. Append newly labeled data and repeat

Append to your growing training set:

```bash
type data\train.xyz runs\iter_00\labeled_new.xyz > data\train_next.xyz
move /Y data\train_next.xyz data\train.xyz
```

## Step 8. Repeat (or stop manually)

train (or fine-tune) → committee → disagreement → select → label → append

If the model already looks good, stop the loop and keep the current checkpoint.

---

## Web Interface (MACE Freeze Training Page)

The MACE web app provides a no-code UI that implements the full workflow above.

### Access

Navigate to **MACE Freeze** from the home page (or `/mace-freeze`).

### Workflow

1. **Data** — Choose Option A (bundled Liquid Water) or Option B (upload your own .xyz / .extxyz).
2. **Options** — Set run name, seed, device, preset (Quick demo = 5 epochs, Full = 800 epochs).
3. **Fine-tune (freeze)** *(optional)* — Enable freeze workflow to:
   - train a base model first or use an existing base checkpoint path,
   - run `mace_freeze.py` with configurable freeze/unfreeze patterns,
   - seed `freeze_init.pt` into each run's `checkpoints/` directory and train with `--restart_latest` (handled automatically by the web flow).
4. **Active learning** — Enable to use committee + pool split + labeling loop.
5. **Start iteration 0** — Splits data (train 70%, valid 10%, pool 20% when active learning is on), trains committee models (c0, c1, …) in `runs_web/{runId}/iter_00/`.
6. **Steps 5–8** (when active learning is on):
   - **Disagreement** — Run `model_disagreement.py` on `pool.xyz` with committee checkpoints.
   - **Select top-K** — Run `mace_active_learning.py` to pick the most uncertain structures → `to_label.xyz`.
   - **Label** — Run `label_with_reference.py` using either:
     - MACE-MP-0 (demo surrogate), or
     - Quantum ESPRESSO (`--reference qe`) for real DFT.
   - **Append** — Append `labeled_new.xyz` to `train.xyz`.
7. **Next iteration** — Train committee again on expanded data (calls `run_committee_web.py`), then repeat steps 5–8.
8. **Stop or continue** — After append, either click **Stop active learning here (model looks good)** to end manually, or run **Next iteration** to continue.

### Directory layout (web runs)

```
runs_web/{runId}/
  data/
    train.xyz
    valid.xyz
    pool.xyz
  base/                         # only when "Train base model first" is enabled
    base_model/
      checkpoints/
      logs/
  freeze/
    freeze_init.pt
    freeze_plan.json
  iter_00/
    c0/checkpoints/best.pt      # or latest c0_run-0_epoch-*.pt
    c1/checkpoints/best.pt      # or latest c1_run-1_epoch-*.pt
    ...
    to_label.xyz
    labeled_new.xyz
    pool_disagreement.json
  iter_01/
    ...
```

Checkpoint resolution in the web/API prefers `best.pt` and falls back to the latest `*_epoch-*.pt`.

### CLI ↔ Web mapping

| CLI step | Web action |
|----------|------------|
| `split_dataset_pool.py` | Automatic when "Start iteration 0" with active learning |
| `mace_freeze.py` | Fine-tune mode in Options (or POST `/api/mace-freeze/freeze`) |
| `mace_train.py` (committee) | "Start iteration 0" or "Next iteration" |
| `model_disagreement.py` | Step 5: "Run" on Disagreement |
| `mace_active_learning.py` | Step 6: "Run" on Select top-K |
| DFT / reference labeling | Step 7: "Run" on Label (`reference=mace-mp` or `reference=qe`) |
| Append to train | Step 8: "Run" on Append |

### Note on labeling

The web UI supports both:
- **MACE-MP-0** for fast demo/surrogate labeling
- **Quantum ESPRESSO (DFT)** for real ab initio labeling (`reference=qe`)

For QE mode, configure:
- `pw.x` available on `PATH` (or pass custom `qe_command`)
- pseudopotential directory (`--pseudo_dir`, `ESPRESSO_PSEUDO`, `QE_PSEUDO_DIR`, or auto-detected from common QE/source paths)
- optional pseudopotential mapping JSON (`--pseudos_json`, recommended when pseudo filenames are non-standard)
- optional input template JSON (`--input_template`) for custom QE control/system/electrons settings
- preflight check: `python3 mace-api/MACE_Freeze/scripts/check_qe.py` (or `--symbols "..."` to validate element coverage)

---

### Active learning convergence (auto-stop hints)

The disagreement step now runs a convergence check and returns hints for when to stop:

- **Committee disagreement** — Low when max &lt; 10 meV/Å and mean &lt; 5 meV/Å
- **Validation MAE** — Good when energy &lt; 50 meV/atom and force &lt; 50 meV/Å
- **Pool exhaustion** — No structures with disagreement &gt; 1 meV/Å

The web UI shows a "When to stop" guide, validation metrics, and a convergence banner when criteria are met. Use `check_convergence.py` for CLI:

```bash
python check_convergence.py --run_id RUN_ID --iter 0 --committee_size 2
```

---

# To-Dos
1. Add delta-force/energy implementation
2. Update README to be more clearer with definitions
3. Incorporate with supercomputers to be able to train multiple models for merging
