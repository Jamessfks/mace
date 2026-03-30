# MACE Force Fields — Web Interface

## Project Overview
Browser-based interface for MACE (Multi-Atomic Cluster Expansion) machine learning interatomic potentials. Full-stack: Next.js 16 frontend + Python/FastAPI backend using ASE and mace-torch.

**Author:** Zicheng Zhao, Northeastern University
**Live:** https://mace-lake.vercel.app

## Architecture

```
Frontend (Next.js 16 / React 19 / TypeScript)
  ├── /calculate        → Calculator page (upload, configure, run, view results)
  ├── /benchmark        → Multi-model comparison suite
  ├── /r/[id]           → MACE Link (shared result viewer)
  └── /api/calculate    → Route handler (dual-mode: local subprocess or remote API)

Backend (Python 3.10+)
  ├── calculate_local.py  → Subprocess MACE runner (called by Next.js)
  ├── main.py             → FastAPI server (for cloud deployment)
  └── generate_surface.py → ASE surface slab generator
```

**Dual-mode execution:**
- Local: `MACE_API_URL` not set → spawns `python3 mace-api/calculate_local.py`
- Remote: `MACE_API_URL` set → forwards to hosted API (e.g., Hugging Face Spaces)

## Development Commands

```bash
# Frontend
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

# Backend
cd mace-api
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 7860

# Local calculation test
python mace-api/calculate_local.py public/demo/ethanol.xyz '{"calculationType":"single-point","modelType":"MACE-MP-0","modelSize":"medium"}'
```

## Key Files

| Area | Files |
|------|-------|
| Calculation API | `app/api/calculate/route.ts`, `app/api/benchmark/route.ts` |
| Python backend | `mace-api/calculate_local.py`, `mace-api/main.py` |
| Calculator UI | `app/calculate/page.tsx`, `components/calculate/*.tsx` |
| Type definitions | `types/mace.ts` |
| Structure parser | `lib/parse-structure.ts` |
| Benchmark catalog | `lib/mlpeg-catalog.ts` |
| Sharing | `lib/share.ts`, `lib/supabase.ts` |
| Visualization | `components/calculate/molecule-viewer-3d.tsx`, `components/calculate/weas-viewer.tsx` |

## Scientific Accuracy Rules

**CRITICAL — Always follow these when writing or modifying scientific code:**

### Units (MACE + ASE Convention)
- Energy: **eV** (electron volts)
- Forces: **eV/Å** (electron volts per Angstrom)
- Distances/positions: **Å** (Angstroms)
- Stress: **eV/ų**
- Temperature: **K** (Kelvin)
- Time: **fs** (femtoseconds) — always use `ase.units.fs` for conversion
- Pressure: **eV/ų** internally; user-facing **GPa** (1 GPa = 10,000 bar)

### Model Selection
- **MACE-MP-0**: Materials, crystals, surfaces, bulk — 89 elements, trained on PBE+U DFT
- **MACE-OFF**: Organic molecules only (H,C,N,O,F,P,S,Cl,Br,I) — trained on wB97M-D3BJ
- **D3 dispersion**: Only meaningful for MACE-MP-0 (MACE-OFF already includes dispersion in training data)
- Model sizes: small (fastest, least accurate) → medium (default) → large (most accurate)

### Geometry Optimization
- Use BFGS as default optimizer; FIRE for difficult convergence
- `fmax` = 0.05 eV/Å for general use, 0.01 eV/Å for production, 0.005 eV/Å before frequency calculations
- Always set `maxOptSteps` to prevent infinite loops
- Only atomic positions are optimized (no cell optimization currently)

### Molecular Dynamics
- NVT: Langevin thermostat with friction parameter
- NPT: Requires periodic system with defined cell
- NVE: No thermostat (microcanonical)
- Always initialize velocities with `MaxwellBoltzmannDistribution`
- Typical timestep: 0.5-2.0 fs (smaller for light elements like H)

### Vibrational Analysis
- **MUST** use `float64` precision for Hessian/frequency calculations
- Structure MUST be at a local minimum first (fmax < 0.005 eV/Å)
- Imaginary frequencies at non-transition-state = incomplete optimization
- For molecules: expect 3N-6 real frequencies (3N-5 for linear)

### Common Pitfalls to Avoid
1. Never mix units — MACE outputs eV/Å, ASE uses eV/Å internally
2. PyTorch 2.6+ requires `weights_only=False` for MACE model loading
3. MACE-MP-0 is PBE-level — don't compare directly to experimental values without noting ~0.1-0.5 eV/atom overbinding
4. Reference energies in catalog are EXPERIMENTAL, not DFT — comparison must note this
5. Don't enable D3 dispersion with MACE-OFF (double-counting)
6. GPU fallback: always handle CUDA unavailable → CPU gracefully
7. Extended XYZ metadata keys vary: check REF_energy, ref_energy, energy, dft_energy

## Code Style

- **Frontend**: TypeScript strict, React 19 hooks, Tailwind CSS 4, shadcn/ui (New York)
- **Backend**: Python 3.10+, type hints, JSON stdout for subprocess communication
- **Charts**: Plotly.js with Paul Tol colorblind-safe palette
- **3D Viewers**: 3Dmol.js (npm) + WEAS (CDN iframe)
- Dark theme with CSS custom properties (`--color-*`)

## Testing & Validation

### Automated Validation Script
```bash
# Validate a calculation result JSON
python mace-api/validate_calculation.py '<result_json>'
python mace-api/validate_calculation.py result.json

# Run full model verification tests (Si bulk, H2O, ethanol opt, force conservation)
python mace-api/validate_calculation.py --test
```

The validator checks:
- Energy bounds (model-aware: MACE-MP-0 vs MACE-OFF reference conventions)
- Force magnitude and conservation (net force ≈ 0 for molecules)
- Interatomic distances (overlapping atoms detection)
- Lattice validity (positive volume, 3x3 matrix)
- MD trajectory stability (NaN/Inf detection, energy fluctuation)
- Parameter sanity (D3+MACE-OFF double-counting, precision for phonons)

### Manual Verification Checklist
1. Energy in reasonable range: MACE-MP-0 → -1 to -15 eV/atom; MACE-OFF → -100 to -600 eV/atom
2. Forces < 10 eV/Å for reasonable structures (> 50 eV/Å = overlapping atoms)
3. RMS force decreases monotonically during optimization
4. MD energy conserved in NVE; fluctuates around target T in NVT
5. Lattice vectors form right-handed coordinate system
6. Volume positive for periodic systems

### Quick Calculation Test
```bash
# Single-point energy of ethanol
python mace-api/calculate_local.py public/demo/ethanol.xyz \
  '{"calculationType":"single-point","modelType":"MACE-OFF","modelSize":"small"}'

# Geometry optimization of water
python mace-api/calculate_local.py public/demo/water.xyz \
  '{"calculationType":"geometry-opt","modelType":"MACE-OFF","modelSize":"medium","forceThreshold":0.01}'
```

## Workflow Commands

```bash
# Start frontend + backend in dev mode
npm run dev

# Run scientific validation suite
python mace-api/validate_calculation.py --test

# Lint frontend
npm run lint

# Build for production
npm run build
```
