# Bar 3 — ACEsuit/mace (the reference implementation)

Captured 2026-08-09 for SimpleAtom v2.0. Everything here was read off the **source at tag
`v0.3.16`** (latest release, published 2026-05-10) and off the installed package in this
environment (`mace-torch 0.3.15`), not off the README's prose summary. Where the README and
the code disagree, that is recorded as a disagreement rather than resolved.

## Why this is the third bar

Rowan is the **interface** bar. Materials Project is the **data** bar. This one is different
in kind: SimpleAtom is a wrapper around `mace.calculators`, so ACEsuit/mace is not a
competitor to be matched — it is the **definition of correct**. Every number SimpleAtom
displays is produced by code in this repository. Where SimpleAtom disagrees with it,
SimpleAtom is wrong by definition, and the disagreement is a bug report, not a design
choice.

This is also the only bar that can be checked without taste. The other two require judgement
calls about layout and honesty. This one is a diff.

## Fetchability

| Surface | URL | Login? |
|---|---|---|
| Source | `https://github.com/ACEsuit/mace` | No |
| Raw file at a pinned tag | `https://raw.githubusercontent.com/ACEsuit/mace/v0.3.16/mace/calculators/<file>` | No |
| Releases / version history | `https://api.github.com/repos/ACEsuit/mace/releases` | No |
| Docs | `https://mace-docs.readthedocs.io` | No |
| Model weights (MP family) | `https://github.com/ACEsuit/mace-foundations/releases` | No |
| Model weights (OFF family) | `https://github.com/ACEsuit/mace-off` | No |
| PyPI metadata | `https://pypi.org/pypi/mace-torch/json` | No |

Fully fetchable, including the exact bytes of every default. **Always read at a pinned tag.**
Reading `main` makes the bar move under you, which is how you end up asserting a default that
was true last month.

This repo has a git remote named `upsteam` (sic) pointing here. It is read-only. Prefer the
raw-file URLs above over any git operation — never fetch, never push, never open a PR.

## The API surface that actually matters

Three entry points. SimpleAtom uses all three.

### `mace_mp()` — `mace/calculators/foundations_models.py:235`

```python
def mace_mp(
    model: Optional[Union[str, Path]] = None,
    device: str = "",
    default_dtype: str = "float32",
    dispersion: bool = False,
    damping: str = "bj",                      # ["zero", "bj", "zerom", "bjm"]
    dispersion_xc: str = "pbe",
    dispersion_cutoff: float = 40.0 * units.Bohr,
    return_raw_model: bool = False,
    **kwargs,
) -> Union[MACECalculator, torch.nn.Module, SumCalculator]:
```

- Returns a plain `MACECalculator` when `dispersion=False`, and a
  **`SumCalculator([mace_calc, d3_calc])`** when `dispersion=True` (line 324).
- `device=""` resolves to `"cuda" if torch.cuda.is_available() else "cpu"` (line 286).
- **`model=None` no longer means "MACE-MP-0 medium".** Since 0.3.10 it resolves to
  `medium-mpa-0` (MACE-MPA-0), and `download_mace_mp_checkpoint` prints a notice saying so
  (`foundations_models.py:140-152`). The docs flag this as a reproducibility break for code
  written against ≤0.3.9. **Passing an explicit size string is the only way to pin this.**

### `mace_off()` — `mace/calculators/foundations_models.py:362`

```python
def mace_off(
    model: Optional[Union[str, Path]] = None,
    device: str = "",
    default_dtype: str = "float64",      # <-- NOTE: float64, not float32
    return_raw_model: bool = False,
    **kwargs,
) -> Union[MACECalculator, torch.nn.Module]:
```

- **There is no `dispersion` parameter.** MACE-OFF23 is trained on wB97M-**D3(BJ)** data, so
  dispersion is already in the model. Upstream does not merely discourage adding D3 here —
  it makes it unexpressible.
- The dtype default differs from `mace_mp` and this is deliberate. Verified identical
  (`default_dtype: str = "float64"`) at tags v0.3.6, v0.3.10, v0.3.13, v0.3.15 and v0.3.16.
  It has never been float32.

### `MACECalculator` — `mace/calculators/mace.py:99`

Relevant defaults:

| Arg | Default | Behaviour |
|---|---|---|
| `device` | `"cpu"` | no auto-CUDA here; that lives in the `mace_*` wrappers |
| `default_dtype` | `""` | `""` → **adopt the checkpoint's own dtype**, with a `logging.warning` (`mace.py:306-311`) |
| `model_type` | `"MACE"` | also `PolarMACE`, `DipoleMACE`, `EnergyDipoleMACE`, `DipolePolarizabilityMACE` |
| `model_paths` | `None` | accepts a glob → a **committee**; adds `energy_var`, `forces_comm`, `stress_var` |

Two things worth knowing:

1. **A dtype mismatch silently converts the model.** If `default_dtype` is given and differs
   from the checkpoint, upstream calls `model.double()` or `model.float()` and emits a
   `logging.warning` (`mace.py:312-319`). It does not refuse. If your app disables logging,
   the conversion is invisible.
2. **`stress` is always computed for MACE models.** `implemented_properties` includes
   `energy, energies, free_energy, node_energy, forces, stress` (`mace.py:188-198`), and
   `calculate()` passes `compute_stress=True` unconditionally for `model_type="MACE"`
   (`mace.py:607`), converting to Voigt 6-vector at `mace.py:725-726`. It costs nothing extra
   to read.

Also present and unused by SimpleAtom: `get_hessian()` (`mace.py:770`),
`get_descriptors()` (`mace.py:792`), `get_dielectric_derivatives()` (`mace.py:735`).

## The authoritative defaults (the checkable list)

| Question | Upstream answer | Where |
|---|---|---|
| `mace_mp()` default dtype | `float32` | `foundations_models.py:238` |
| `mace_off()` default dtype | **`float64`** | `foundations_models.py:366` |
| `MACECalculator` default dtype | `""` → checkpoint's own | `mace.py:106, 306-311` |
| `mace_mp()` default model | `medium-mpa-0` (since 0.3.10) | `foundations_models.py:140-152` |
| `mace_off()` default model | `medium` → MACE-OFF23_medium | `foundations_models.py:388-393` |
| Default device | `"cuda" if available else "cpu"` | `foundations_models.py:286, 418` |
| D3 requires | `torch-dftd` — **not** a mace-torch dependency | `foundations_models.py:306-311` |
| D3 unavailable → | `RuntimeError`, **never silent** | `foundations_models.py:308-311` |
| D3 damping default | `bj`, `xc="pbe"`, cutoff `40 Bohr` | `foundations_models.py:240-242` |
| PyTorch 2.6 `weights_only` | handled upstream via `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1` | `mace.py:15` |
| Hard-pinned dependency | `e3nn==0.4.4` | `setup.cfg` |
| Minimum torch | `torch>=1.12` | `setup.cfg` |

### The printed dtype guidance — quote this, it is the whole dtype argument

Both `mace_mp` and `mace_off` print, at construction time:

> float32 … faster but less accurate. Recommended for MD. Use float64 for geometry
> optimization.

(`foundations_models.py:291-294` and `423-430`.) That is upstream's own recommendation, in
the code path, on every run. Note what it is about: **geometry optimization**, not phonons.

### What upstream does *not* say

Searched and not found: any statement that float64 is *required* for Hessian or frequency
calculations. `get_hessian()` inherits `self.default_dtype` through `_atoms_to_batch`
(`mace.py:532`) and carries no dtype guard of its own. The README's only training-side note
is that `--default_dtype` defaults to `float64` and float32 roughly doubles training speed
(README line 122). **CLAUDE.md's "MUST use float64 for Hessian/frequency" rule is a
defensible convention but it is not sourced from upstream.** The rule upstream actually
states — float64 for geometry optimization — is the one SimpleAtom needs, because
SimpleAtom does geometry optimization and does not do frequencies.

## Model catalogue as shipped in v0.3.16

`mace_mp_urls` (`foundations_models.py:91-108`) — 16 keys:

```
small  medium  large
small-0b  medium-0b
small-0b2  medium-0b2  large-0b2
medium-0b3
medium-mpa-0
small-omat-0  medium-omat-0
mace-matpes-pbe-0  mace-matpes-r2scan-0
mh-0  mh-1
```

`mace_off_urls` (`foundations_models.py:111-115`) — 3 keys: `small`, `medium`, `large`, all
pointing at **MACE-OFF23** checkpoints on `raw.githubusercontent.com/ACEsuit/mace-off`.

Also exported from `mace.calculators`: `mace_omol` (MACE-OMOL-0, `extra_large`, default dtype
float64), `mace_polar` (MACE-POLAR-1 S/M/L, new in 0.3.16), `mace_anicc`.

Three facts a critic should carry:

1. **`small`/`medium`/`large` still exist and still mean MACE-MP-0a.** Nothing has been
   removed. Code that passes them explicitly is not broken by the 0.3.10 default change.
2. **MACE-OFF24 exists but is not reachable through `mace_off()`.** The file
   `mace_off24/MACE-OFF24_medium.model` is present in the `ACEsuit/mace-off` repo, but
   `mace_off_urls` in v0.3.16 contains only OFF23 URLs. `mace_off(model="medium")` is
   OFF23_medium, full stop. Do not claim otherwise.
3. **Upstream contradicts itself about `large`.** The code says
   `mace_mp_urls["large"] = MACE_MPtrj_2022.9.model`; the README's MACE-MP-0a row says large
   is `2024-01-07-mace-128-L2_epoch-199.model`. These are different files. **I could not
   determine which is authoritative.** Any claim that SimpleAtom's "Large — most accurate"
   maps to a specific checkpoint is standing on this ambiguity and should say so.

## Dispersion, precisely

```python
if not dispersion:
    return mace_calc
try:
    from torch_dftd.torch_dftd3_calculator import TorchDFTD3Calculator
except ImportError as exc:
    raise RuntimeError("Please install torch-dftd to use dispersion corrections ...") from exc
...
return SumCalculator([mace_calc, d3_calc])
```
(`foundations_models.py:303-324`)

- `torch-dftd` is **not** in `mace-torch`'s `install_requires` and **not** in any
  `extras_require` (verified against `setup.cfg` at v0.3.16 and against PyPI's
  `requires_dist` for 0.3.16). It must be installed separately.
- Confirmed absent from this environment: `import torch_dftd` → `ModuleNotFoundError`.
- The failure mode is a loud `RuntimeError` at calculator construction. **Upstream never
  silently skips dispersion.** Any wrapper that reports "dispersion applied" without a
  `SumCalculator` in hand is reporting something upstream would have refused to do.

## Checks a critic can run

Each of these is a yes/no against a cited upstream line. No taste required.

1. **Model resolution.** Does the wrapper pass an explicit model string to `mace_mp()`? If it
   passes `None`, it gets MACE-MPA-0 and every "MACE-MP-0" label in the UI is a lie.
   (`foundations_models.py:140-152`)
2. **Model allow-list.** Feed the wrapper a `modelType` it does not recognise. Upstream's own
   pattern for an unknown model is `FileNotFoundError` / `ValueError`
   (`foundations_models.py:280-284`, `537-540`). Does the wrapper raise, or fall through to a
   default calculator?
3. **`mace_off` dtype.** Does the wrapper pass `default_dtype` to `mace_off()`? If yes and the
   value is `"float32"`, it has overridden upstream's float64 default. Is that override
   surfaced in the result?
4. **Dtype-conversion warning.** Is `logging` disabled anywhere in the process? If so, the
   `"Default dtype ... does not match model dtype, converting models"` warning
   (`mace.py:313-315`) is invisible and a silent downcast is possible.
5. **Dispersion + MACE-OFF.** Post `{"modelType": "MACE-OFF", "dispersion": true}` directly to
   the API. Upstream cannot express this (`mace_off` has no such parameter). Does the wrapper
   reject it, or accept it and record `dispersion: true` in a result where no D3 was applied?
6. **Dispersion without `torch-dftd`.** Post `{"modelType":"MACE-MP-0","dispersion":true}`
   against a deployment built from `requirements.txt`. Upstream raises `RuntimeError`. Any
   other outcome — including a successful result — is a defect.
7. **Stress.** Is `atoms.get_stress()` ever called? Upstream computes it on every
   `calculate()` for MACE models (`mace.py:607`). If the result JSON has no stress, the data
   was computed and discarded.
8. **Convergence.** ASE's `Optimizer.run()` returns a bool. Verified against ase 3.27.0:
   returns `False` when `steps` is exhausted before `fmax`. Is that return value read?
9. **Version provenance.** Does the result record the `mace-torch` version it was produced
   with? Given the 0.3.10 default change and the ASL licence notices, a MACE result without a
   library version is not reproducible.
10. **Committee.** `MACECalculator` supports glob model paths and exposes `energy_var` /
    `forces_comm` (`mace.py:237-249`). That is upstream's built-in uncertainty estimate. A
    wrapper that tells users to "run multiple model sizes to gauge robustness" is
    reimplementing a worse version of this by hand.

## Scope honesty

Upstream is a training framework, a CLI, LAMMPS/OpenMM integrations, fine-tuning, committees,
cuEq/OEq acceleration and a torch-sim interface. SimpleAtom wraps roughly three functions of
it. **Almost none of that surface is in scope for v2.0** and matching it is not the goal.

What *is* in scope, and what this bar exists to enforce: for the three calculation types
SimpleAtom does implement, the calculator must be constructed the way upstream constructs it,
with upstream's defaults, and any deliberate deviation must be visible in the result rather
than buried in a wrapper function. The bar is not "do everything MACE does." The bar is
**"do not silently do something different from what MACE does."**
