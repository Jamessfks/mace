# MACE Calculator Parameters Reference

Complete reference for all MACECalculator constructor parameters and foundation model factory functions, based on [MACE v0.3.13 official documentation](https://mace-docs.readthedocs.io/en/latest/guide/guide.html).

---

## MACECalculator Constructor

These parameters are passed when creating a `MACECalculator` instance directly.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model_paths` | `str` or `list[str]` | `None` | Path(s) to `.model` checkpoint file(s). Supports wildcard notation for committee models. Mutually exclusive with `models`. |
| `models` | `Module` or `list[Module]` | `None` | Pre-loaded PyTorch model object(s). Mutually exclusive with `model_paths`. |
| `device` | `str` | `"cpu"` | Compute device: `"cuda"`, `"cpu"`, or `"xpu"`. |
| `energy_units_to_eV` | `float` | `1.0` | Conversion factor from model energy units to eV. Leave at 1.0 if model outputs eV (all foundation models do). |
| `length_units_to_A` | `float` | `1.0` | Conversion factor from model length units to Angstroms. Leave at 1.0 if model uses Angstroms. |
| `default_dtype` | `str` | `""` (auto) | Float precision: `"float32"` or `"float64"`. Empty string auto-detects from the loaded model. Use `"float64"` for Hessian/frequency calculations. |
| `charges_key` | `str` | `"Qs"` | Key name for atomic charges in `atoms.arrays`. |
| `info_keys` | `dict` | `{"spin": "spin", "charge": "charge", "external_field": "external_field"}` | Maps `atoms.info` dictionary keys to model inputs. |
| `arrays_keys` | `dict` | `{}` | Maps `atoms.arrays` dictionary keys to model inputs. |
| `model_type` | `str` | `"MACE"` | Model architecture type. Options: `"MACE"`, `"DipoleMACE"`, `"EnergyDipoleMACE"`, `"DipolePolarizabilityMACE"`, `"PolarMACE"`. |
| `compile_mode` | `str` or `None` | `None` | `torch.compile` optimization mode (`"default"`, `"reduce-overhead"`, `"max-autotune"`). `None` disables compilation. |
| `fullgraph` | `bool` | `True` | Whether to use full graph mode for `torch.compile`. |
| `enable_cueq` | `bool` | `False` | Enable cuEquivariance (CUDA) acceleration for equivariant operations. |
| `enable_oeq` | `bool` | `False` | Enable OEq acceleration. |
| `compute_atomic_stresses` | `bool` | `False` | Calculate per-atom stress and virial tensors in addition to global stress. |
| `head` | `str` | `None` | Select a specific model head for multi-head models (e.g., multihead fine-tuned checkpoints). |

---

## Foundation Model Factory Functions

These convenience functions load pre-trained MACE models and return a ready-to-use ASE calculator.

### `mace_mp()` — Materials Project

Trained on PBE+U DFT data. Covers 89 elements for bulk crystals, surfaces, and inorganic materials.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `str` or `Path` | `None` | Model identifier. Size options: `"small"`, `"medium"`, `"large"`. Extended variants: `"medium-mpa-0"` (new default in v0.3.10+), `"medium-omat-0"`, `"matpes-pbe"`, `"matpes-r2scan"`, `"mace-mh-1"`, `"mace-mh-0"`. Can also be a URL or local file path. |
| `device` | `str` | `""` (auto) | Compute device. Empty string auto-selects CUDA if available, otherwise CPU. |
| `default_dtype` | `str` | `"float32"` | Float precision. `"float32"` recommended for MD; `"float64"` for geometry optimization and Hessians. |
| `dispersion` | `bool` | `False` | Enable Grimme D3 dispersion corrections. |
| `damping` | `str` | `"bj"` | D3 damping function: `"bj"` (Becke-Johnson), `"zero"`, `"zerom"`, `"bjm"`. |
| `dispersion_xc` | `str` | `"pbe"` | Exchange-correlation functional for D3 parametrization. |
| `dispersion_cutoff` | `float` | ~21.2 A | Cutoff radius for D3 dispersion interactions (`40.0 * units.Bohr`). |
| `return_raw_model` | `bool` | `False` | Return raw `torch.nn.Module` instead of an ASE calculator. |

**Energy reference**: -1 to -15 eV/atom (DFT reference convention).

### `mace_off()` — Organic Force Field (MACE-OFF23)

Trained on wB97M-D3BJ DFT data. Covers organic molecules: H, C, N, O, F, P, S, Cl, Br, I.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `str` or `Path` | `None` | Model identifier. Size options: `"small"`, `"medium"`, `"large"`. |
| `device` | `str` | `""` (auto) | Compute device. Auto-selects CUDA if available. |
| `default_dtype` | `str` | `"float64"` | Defaults to `float64` for high-accuracy organic chemistry. |
| `return_raw_model` | `bool` | `False` | Return raw model instead of ASE calculator. |

**Energy reference**: -100 to -600 eV/atom (different reference convention from MACE-MP-0).

!!! warning "No D3 with MACE-OFF"
    MACE-OFF is trained on wB97M-**D3BJ** data — dispersion is already included. Enabling D3 corrections would double-count dispersion interactions.

### `mace_anicc()` — Coupled-Cluster

Pre-trained on coupled-cluster (CCSD(T)) data. Limited to H, C, N, O.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `device` | `str` | `"cuda"` | Compute device. |
| `model_path` | `str` | `None` | Path to model file. Defaults to bundled checkpoint. |
| `return_raw_model` | `bool` | `False` | Return raw model instead of calculator. |

### `mace_omol()` — Organic Molecules

Broader organic molecule coverage.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `str` or `Path` | `None` | Model identifier, local path, or URL. |
| `device` | `str` | `""` (auto) | Compute device. |
| `default_dtype` | `str` | `"float64"` | Float precision. |
| `return_raw_model` | `bool` | `False` | Return raw model instead of calculator. |

### `mace_polar()` — Electrostatic/Polar Model

For dipole and polarizability predictions.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `str` or `Path` | required | Polar model key, local path, or URL. |
| `device` | `str` | `""` (auto) | Compute device. |
| `default_dtype` | `str` | `"float32"` | Float precision. |
| `return_raw_model` | `bool` | `False` | Return raw model instead of calculator. |

---

## MACECalculator Methods

### `get_descriptors(atoms, invariants_only, num_layers)`

Extract MACE atomic descriptors (useful for ML workflows and analysis).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `atoms` | `ase.Atoms` | `None` | Atomic structure. Uses calculator's stored atoms if `None`. |
| `invariants_only` | `bool` | `True` | Return only invariant (scalar) descriptors. Set `False` for full equivariant descriptors. |
| `num_layers` | `int` | `-1` | Number of message-passing layers to extract from. `-1` = all layers. |

### `get_hessian(atoms)`

Compute the analytical Hessian matrix. Requires `default_dtype="float64"`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `atoms` | `ase.Atoms` | required | Structure at a local minimum. |

Returns a `(3N x 3N)` Hessian matrix where N is the number of atoms.

---

## D3 Dispersion Correction Details

When `dispersion=True` is passed to `mace_mp()`, a `TorchDFTD3Calculator` is composed with the MACE calculator. The D3 parameters control the semi-empirical dispersion correction:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `damping` | `str` | `"bj"` | **BJ** (Becke-Johnson): most common, recommended for PBE. **Zero**: original zero-damping. **zerom/bjm**: modified variants. |
| `dispersion_xc` | `str` | `"pbe"` | Determines D3 coefficient parametrization. Common options: `pbe`, `pbe0`, `rpbe`, `revpbe`, `blyp`. |
| `dispersion_cutoff` | `float` | ~21.2 A | Maximum distance for D3 interactions. Default is sufficient for most systems. |

---

## Web Interface Parameter Mapping

The MACE web calculator at [mace-lake.vercel.app](https://mace-lake.vercel.app) exposes a subset of these parameters appropriate for browser-based use:

| Web UI Parameter | Maps To | Notes |
|-----------------|---------|-------|
| Model Type | `mace_mp()` / `mace_off()` / custom upload | Selects foundation model or user checkpoint |
| Model Size | `model` argument | `"small"`, `"medium"`, `"large"` |
| Precision | `default_dtype` | `"float32"` or `"float64"` |
| Device | `device` | `"cpu"` or `"cuda"` |
| D3 Dispersion | `dispersion` | Toggle on/off (MACE-MP-0 only) |
| Custom Model Upload | `model_paths` | User uploads `.model` file |

Parameters like `compile_mode`, `enable_cueq`, `charges_key`, `info_keys`, and unit conversion factors are handled automatically by the backend and not exposed to users, as they require no configuration for standard workflows.
