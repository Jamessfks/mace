# Architecture Documentation

Structural and workflow documentation for the MACE Force Fields web interface (v1.2.0).

---

## System Overview

```
+-------------------------------------------------------------------+
|                    Browser (Next.js 16 / React 19)                |
|                                                                   |
|  /calculate         /benchmark          /r/[id]                   |
|  +- FileUpload      +- BenchmarkConfig  +- SharedResultView       |
|  +- ParameterPanel  +- BenchmarkDash       (read-only dashboard)  |
|  +- MetricsDash     +- Leaderboard                                |
|  +- MolViewer3D     +- Export                                     |
|                                                                   |
|  Client-side (no backend call):                                   |
|  +- parse-structure.ts  (XYZ/CIF/PDB/POSCAR parsing)             |
|  +- mlpeg-catalog.ts    (14 embedded benchmark structures)        |
|  +- share.ts            (Supabase save/load for MACE Link)        |
+----------------------------------+--------------------------------+
                                   | POST /api/calculate (FormData)
                                   v
+-------------------------------------------------------------------+
|                    Next.js API Route Handler                       |
|                                                                   |
|  Dual-mode dispatch:                                              |
|  +- MACE_API_URL set     -> Forward to remote backend (HF Spaces) |
|  +- MACE_API_URL not set -> Local Python subprocess               |
|     -> python3 mace-api/calculate_local.py <file> <params>        |
+----------------------------------+--------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------+
|              Python Backend (ASE + mace-torch)                     |
|                                                                   |
|  calculate_local.py / main.py (FastAPI)                           |
|  +- Format detection (XYZ/CIF/POSCAR/PDB)                        |
|  +- ASE structure reading (ase.io.read)                           |
|  +- MACE calculator setup:                                        |
|  |   +- mace_mp()  -> MACE-MP-0 (89 elements, materials)         |
|  |   +- mace_off() -> MACE-OFF (10 elements, organic)            |
|  |   +- MACECalculator() -> custom .model files                   |
|  +- Calculation execution:                                        |
|  |   +- Single-point: atoms.get_potential_energy/forces()         |
|  |   +- Geometry opt: BFGS(atoms).run(fmax, steps)                |
|  |   +- MD: Langevin/NPT/VelocityVerlet + trajectory recording   |
|  +- JSON result output to stdout                                  |
+----------------------------------+--------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------+
|                    Supabase (PostgreSQL)                           |
|                                                                   |
|  shared_results table (JSONB)                                     |
|  +- id: nanoid(8) primary key                                     |
|  +- result: CalculationResult JSON                                |
|  +- params: CalculationParams JSON                                |
|  +- filename: text                                                |
|  +- created_at: timestamptz                                       |
|  +- Public RLS (anyone can read/insert, no edit/delete)           |
+-------------------------------------------------------------------+
```

---

## Data Flow by Calculation Type

### Single-Point Energy & Forces

```
User uploads .xyz/.cif/.poscar/.pdb
    |
    v
Client: parseStructureFile() -> ParsedStructure
    |  (atoms, positions, elements, formula, warnings)
    v
User configures: model (MP-0/OFF/custom), size, precision, device
    |
    v
FormData: { files: [structure], params: JSON }
    |
    v
POST /api/calculate -> Python subprocess
    |
    v
Python:
    atoms = ase.io.read(file, format=fmt)
    calc = mace_mp(model=size, device=device)    # Units: eV, Angstrom
    atoms.calc = calc
    energy = atoms.get_potential_energy()         # eV
    forces = atoms.get_forces()                   # eV/Angstrom, shape (N, 3)
    |
    v
JSON: { status, energy, forces, positions, symbols, lattice, properties }
    |
    v
MetricsDashboard: Summary tab, Forces tab, 3D viewer, charts
```

### Geometry Optimization

```
Same input pipeline as single-point
    |
    v
Python:
    from ase.optimize import BFGS
    opt = BFGS(atoms, logfile=None)
    opt.run(fmax=0.05, steps=500)                 # fmax in eV/Angstrom
    energy = atoms.get_potential_energy()          # Relaxed energy (eV)
    forces = atoms.get_forces()                    # Should be < fmax
    |
    v
JSON: { ..., message: "opt completed (steps=N)" }
    |
    v
MetricsDashboard: Energy convergence chart, optimized structure in 3D viewer
```

### Molecular Dynamics

```
Same input pipeline
    |
    v
Python:
    MaxwellBoltzmannDistribution(atoms, temperature_K=T)
    dyn = Langevin(atoms, dt * units.fs, temperature_K=T, friction=f)
    # Record every step: energy, positions
    dyn.attach(write_frame, interval=1)
    dyn.run(steps)
    |
    v
JSON: { ..., trajectory: { energies[], positions[][][], step[] } }
    |
    v
TrajectoryViewer: frame-by-frame animation, synced energy chart
```

### Units at Every Boundary

| Boundary | Energy | Forces | Distance | Time | Temperature | Pressure |
|----------|--------|--------|----------|------|-------------|----------|
| User input | - | - | Angstrom | fs | K | GPa |
| ASE internal | eV | eV/Angstrom | Angstrom | ASE units (use `units.fs`) | K | eV/Angstrom^3 |
| MACE output | eV | eV/Angstrom | Angstrom | - | - | - |
| JSON result | eV | eV/Angstrom | Angstrom | seconds (timeTaken) | - | - |
| Frontend display | eV | eV/Angstrom | Angstrom | seconds | K | GPa |

**Critical conversion**: Pressure from user GPa to ASE bar: `pressure_GPa * 1e4 = pressure_bar`

---

## Scientific Validation Pipeline

```
validate_calculation.py
+-- Result validation:
|   +- Energy bounds (model-aware):
|   |   +- MACE-MP-0: -20 to +100 eV/atom
|   |   +- MACE-OFF:  -800 to +100 eV/atom (different reference convention)
|   +- Force reasonableness: max < 50 eV/Angstrom (warning), < 200 (error)
|   +- Force conservation: net force ~ 0 for isolated molecules
|   +- Interatomic distances: min > 0.4 Angstrom (overlap detection)
|   +- Lattice: positive volume, valid 3x3 matrix
|   +- Trajectory: no NaN/Inf, bounded energy fluctuation
|   +- Symbols: all recognized elements
|   +- Consistency: len(symbols) == len(positions) == len(forces)
|
+-- Parameter validation:
|   +- D3 + MACE-OFF double-counting warning
|   +- float32 + phonon precision warning
|   +- Extreme timestep / temperature warnings
|   +- Loose fmax warnings
|
+-- Verification tests (--test flag):
    +- MACE-MP-0 on Si bulk (energy/atom, equilibrium forces)
    +- MACE-OFF on H2O (energy, force conservation)
    +- MACE-OFF ethanol geometry optimization (energy decrease)
    +- Force conservation check (Newton's 3rd law)
    +- Full result validation pass
```

---

## Deployment Topology

```
                    Users
                      |
                      v
              +---------------+
              | Vercel CDN    |
              | (Frontend)    |
              | Next.js 16    |
              +-------+-------+
                      |
          +-----------+-----------+
          |                       |
          v                       v
+------------------+    +------------------+
| Supabase         |    | Hugging Face     |
| (PostgreSQL)     |    | Spaces (Docker)  |
| shared_results   |    | FastAPI + MACE   |
| Public RLS       |    | Port 7860        |
+------------------+    +------------------+
```

| Component | Service | URL Pattern |
|-----------|---------|-------------|
| Frontend | Vercel | `mace-lake.vercel.app` |
| API (remote) | Hugging Face Spaces | `<user>-mace-api.hf.space` |
| Database | Supabase | Configured via `NEXT_PUBLIC_SUPABASE_URL` |

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `MACE_API_URL` | No | Remote backend URL (omit for local mode) |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Dual-mode (local/remote) | Local subprocess for zero-config dev; remote API scales for production |
| Client-side structure parsing | No backend overhead for file validation; catches issues before calculation |
| Dual 3D engines (3Dmol.js + WEAS) | 3Dmol.js for feature-rich interaction; WEAS for ml-peg compatibility |
| Paul Tol colorblind-safe palette | Accessibility as a first principle, not an afterthought |
| Extended XYZ metadata support | Preserves reference energies/forces from input files for accuracy comparison |
| Insert-only MACE Link sharing | Immutable results (no edit/delete) ensure citation stability |
| Model-aware energy validation | MACE-MP-0 and MACE-OFF use different reference conventions; validator handles both |
| JSON over stdout (subprocess) | Clean separation — Python writes JSON to stdout, logs to stderr |
