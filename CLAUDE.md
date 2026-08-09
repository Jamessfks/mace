# MACE Force Fields — Web Interface

Browser-based interface for MACE (Multi-Atomic Cluster Expansion) machine learning interatomic potentials. Full-stack: Next.js 16 frontend + Python/FastAPI backend using ASE and mace-torch.

**Author:** Zicheng Zhao, Northeastern University
**Live:** https://mace-lake.vercel.app
**Version:** 1.3.0 Stable

## Architecture

```
Frontend (Next.js 16 / React 19 / TypeScript / Tailwind CSS 4)
  ├── app/calculate/       → Calculator page (upload, configure, run, view results)
  ├── app/benchmark/       → Multi-model comparison suite
  ├── app/r/[id]/          → MACE Link (shared result viewer)
  ├── app/api/calculate/   → Route handler (dual-mode: local subprocess or remote API)
  ├── app/api/benchmark/   → Batch benchmark endpoint
  └── app/api/smiles-to-xyz/ → SMILES → 3D structure conversion

Backend (Python 3.10+)
  ├── mace-api/calculate.py        → Shared calculation engine (all scientific logic)
  ├── mace-api/calculate_local.py  → Subprocess CLI wrapper (called by Next.js)
  ├── mace-api/main.py             → FastAPI server (cloud deployment)
  ├── mace-api/smiles_to_xyz.py    → RDKit SMILES → XYZ converter
  └── test_scripts/validate_calculation.py → Scientific result validator
```

**Dual-mode execution:**
- Local: `MACE_API_URL` not set → spawns `python3 mace-api/calculate_local.py`
- Remote: `MACE_API_URL` set → forwards to hosted API (Hugging Face Spaces / Railway)

**Data flow:** Browser → Parse structure (client) → POST /api/calculate → Python (ASE + mace-torch) → JSON → Plotly charts + 3Dmol.js visualization

## Key Files

| Area | Files |
|------|-------|
| **Calculation API** | `app/api/calculate/route.ts`, `app/api/benchmark/route.ts` |
| **SMILES conversion** | `app/api/smiles-to-xyz/route.ts`, `mace-api/smiles_to_xyz.py` |
| **Python backend** | `mace-api/calculate.py` (shared engine), `mace-api/calculate_local.py` (CLI), `mace-api/main.py` (FastAPI) |
| **Calculator UI** | `app/calculate/page.tsx`, `components/calculate/*.tsx` |
| **SMILES input** | `components/calculate/smiles-input.tsx` |
| **Molecular editor** | `components/calculate/ketcher-editor.tsx` (Ketcher 2D/3D editor) |
| **Benchmark UI** | `app/benchmark/page.tsx`, `components/benchmark/*.tsx` |
| **Type definitions** | `types/mace.ts` |
| **Structure parser** | `lib/parse-structure.ts` (XYZ, CIF, POSCAR, PDB) |
| **Benchmark catalog** | `lib/mlpeg-catalog.ts` (14 embedded structures) |
| **Sharing** | `lib/share.ts`, `lib/supabase.ts` |
| **Visualization** | `components/calculate/molecule-viewer-3d.tsx` (3Dmol.js), `components/calculate/weas-viewer.tsx` (WEAS CDN) |
| **Charts** | `components/calculate/charts/*.tsx`, `components/calculate/trajectory/*.tsx` |
| **PDF export** | `components/calculate/pdf-report.tsx` |
| **Validation** | `test_scripts/validate_calculation.py` |

## Development Commands

```bash
# Frontend
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build (catches type errors)
npm run lint         # ESLint

# Backend
cd mace-api && pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 7860

# Validation
python test_scripts/validate_calculation.py --test    # Full scientific validation suite

# Quick calculation test
python mace-api/calculate_local.py public/demo/ethanol.xyz \
  '{"calculationType":"single-point","modelType":"MACE-OFF","modelSize":"small"}'
```

## Agent & Model Tier Strategy

When spawning subagents or choosing model complexity, follow this tier system:

| Tier | Model | Use For |
|------|-------|---------|
| **Tier 1 (Opus)** | `opus` | Scientific code changes in `mace-api/`, architecture decisions, security review, production deploys |
| **Tier 2 (Sonnet)** | `sonnet` | Frontend components, UI bugs, test writing, documentation, general debugging |
| **Tier 3 (Haiku)** | `haiku` | File lookups, grep searches, simple formatting, quick linting, status checks |

**Subagent patterns for this project:**
- **Frontend + Backend in parallel**: When a feature spans both, spawn one agent for TypeScript changes and one for Python changes — they don't share files
- **Validate after scientific changes**: After any edit to `mace-api/*.py`, spawn a validation agent to run `python test_scripts/validate_calculation.py --test`
- **Build check after frontend changes**: After UI/component changes, run `npm run build` to catch type errors early
- **Research agents**: Use `Explore` subagent type for codebase questions; use `WebSearch`/`WebFetch` for MACE/ASE documentation lookups

## Scientific Accuracy Rules

**CRITICAL — Always follow these when writing or modifying scientific code:**

### Units (MACE + ASE Convention)
| Quantity | Unit | Notes |
|----------|------|-------|
| Energy | **eV** | electron volts |
| Forces | **eV/Å** | per-atom 3-vector |
| Distances | **Å** | Angstroms |
| Stress | **eV/Å³** | Voigt notation |
| Temperature | **K** | Kelvin |
| Time | **fs** | always use `ase.units.fs` for conversion |
| Pressure | **eV/Å³** internal; **GPa** user-facing | 1 GPa = 10,000 bar |

### Model Selection
- **MACE-MP-0**: Materials, crystals, surfaces, bulk — 89 elements, trained on PBE+U DFT
- **MACE-OFF**: Organic molecules only (H,C,N,O,F,P,S,Cl,Br,I) — trained on wB97M-D3BJ
- **D3 dispersion**: Only meaningful for MACE-MP-0 (MACE-OFF already includes dispersion)
- Model sizes: small (fastest) → medium (default) → large (most accurate)

### Energy Reference Conventions
- **MACE-MP-0**: -1 to -15 eV/atom (DFT reference)
- **MACE-OFF**: -100 to -600 eV/atom (different reference convention)
- Catalog reference energies are **EXPERIMENTAL**, not DFT — always note this in comparisons

### Supported Calculation Types
- Exactly three are implemented: `single-point`, `geometry-opt`, `molecular-dynamics`
  (`SUPPORTED_CALCULATION_TYPES` in `mace-api/calculate.py`)
- `phonon` exists in the `CalculationType` TS union and as a disabled UI option, but has
  **no backend implementation**. It is rejected with an error, not stubbed
- **Never** let an unrecognised `calculationType` fall through to a default calculation —
  returning plausible numbers for a calculation that never ran is worse than an error
- The Python backend is the security boundary (the API can be called directly); the
  route handler check in `app/api/calculate/route.ts` is a fast mirror, not a substitute

### Geometry Optimization
- Optimizer is **BFGS only** — hardcoded in `_run_geometry_opt`, with no optimizer
  parameter. Do not document or offer FIRE unless it is actually wired up
- `fmax`: 0.05 eV/Å (general), 0.01 eV/Å (production), 0.005 eV/Å (before frequencies)
- Always set `maxOptSteps` to prevent infinite loops
- Only atomic positions optimized (no cell optimization currently)

### Molecular Dynamics
- NVT: Langevin thermostat with friction parameter
- NPT: Requires periodic system with defined cell
- NVE: No thermostat (microcanonical)
- Always initialize velocities with `MaxwellBoltzmannDistribution`
- Typical timestep: 0.5–2.0 fs (smaller for light elements like H)
- **Reproducibility**: every stochastic source must be seeded. MD has two —
  `MaxwellBoltzmannDistribution(rng=...)` and `Langevin(rng=...)` — and both are fed from
  one `np.random.default_rng(seed)` (`DEFAULT_MD_SEED = 42`, override via `params["seed"]`).
  NPT and VelocityVerlet have no RNG of their own. An unseeded trajectory cannot be verified
  by anyone, including its author. The seed used is recorded in `result["params"]` and in
  `result["message"]` (the message survives PDF export and MACE Link sharing)

### Vibrational Analysis
- **MUST** use `float64` precision for Hessian/frequency calculations
- Structure MUST be at local minimum first (fmax < 0.005 eV/Å)
- Imaginary frequencies at non-transition-state = incomplete optimization
- For molecules: expect 3N-6 real frequencies (3N-5 for linear)

### Common Pitfalls
1. Never mix units — MACE outputs eV/Å, ASE uses eV/Å internally
2. PyTorch 2.6+ requires `weights_only=False` for MACE model loading
3. MACE-MP-0 is PBE-level — ~0.1–0.5 eV/atom overbinding vs experiment
4. Don't enable D3 dispersion with MACE-OFF (double-counting)
5. GPU fallback: always handle CUDA unavailable → CPU gracefully
6. Extended XYZ metadata keys vary: check REF_energy, ref_energy, energy, dft_energy
7. RMS force formula: `sqrt(Σ|F_i|² / N_atoms)` — not `sqrt(Σf² / 3N)`
8. Results must be self-describing: `_build_result()` echoes the *effective* parameters
   (defaults resolved, CUDA→CPU fallback applied, MD seed recorded) into `result["params"]`.
   The validator picks its model-aware energy bounds from this — without it every result is
   judged as `modelType: "unknown"` and MACE-OFF's −100 to −600 eV/atom convention never
   applies. Echo an explicit key allow-list, never the raw request dict

## Code Style

- **Frontend**: TypeScript strict, React 19 hooks, Tailwind CSS 4, shadcn/ui (New York style)
- **Backend**: Python 3.10+, type hints, JSON stdout for subprocess communication
- **Charts**: Plotly.js with Paul Tol colorblind-safe palette
- **3D Viewers**: 3Dmol.js (npm) + WEAS (CDN iframe)
- **Theme**: Light by default — warm off-white canvas (`#FBFAF7`) with a green accent (`#4F9A54`), driven by CSS custom properties (`--color-*`) on `:root`. A dark (navy) theme is preserved under `.dark` for a possible future toggle but is not currently reachable in the UI. See `app/globals.css`.
- **Components**: Use `components/ui/` for shadcn base; domain components in `components/calculate/` or `components/benchmark/`
- **Imports**: Use `@/` path alias (maps to project root)

## Testing & Validation

### Before Merging Any Scientific Code Change
1. Run `python test_scripts/validate_calculation.py --test` — must pass all checks
2. Verify energy bounds, force magnitudes, unit consistency
3. Check that D3 dispersion is not enabled with MACE-OFF

### Before Merging Any Frontend Change
1. Run `npm run build` — must compile without errors
2. Run `npm run lint` — no new warnings
3. Test the affected page in browser at localhost:3000

### Automated Validator Checks
- Energy bounds (model-aware: MACE-MP-0 vs MACE-OFF reference conventions)
- Force magnitude and conservation (net force ≈ 0 for molecules)
- Interatomic distances (overlapping atoms detection)
- Lattice validity (positive volume, 3x3 matrix)
- MD trajectory stability (NaN/Inf detection, energy fluctuation)
- Parameter sanity (D3+MACE-OFF double-counting, precision for phonons)

### Manual Verification Checklist
1. Energy in reasonable range per model convention
2. Forces < 10 eV/Å for reasonable structures (> 50 eV/Å = overlapping atoms)
3. RMS force decreases monotonically during optimization
4. MD energy conserved in NVE; fluctuates around target T in NVT
5. Lattice vectors form right-handed coordinate system
6. Volume positive for periodic systems

## Deployment

```
Vercel CDN (Frontend) → Supabase PostgreSQL (shared_results)
                      → Hugging Face Spaces / Railway (Backend: FastAPI on port 7860)
```

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `MACE_API_URL` (optional) — omit for local subprocess mode
