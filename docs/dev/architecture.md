# Architecture

## System overview

```
+-------------------------------------------------------------------+
|                    Browser (Next.js 16 / React 19)                |
|                                                                   |
|  /calculate         /benchmark          /r/[id]                   |
|  +- FileUpload      +- BenchmarkConfig  +- SharedResultView       |
|  +- ParameterPanel  +- BenchmarkDash       (read-only dashboard)  |
|  +- MetricsDash     +- Leaderboard                                |
|  +- MolViewer3D     +- Export                                     |
+----------------------------------+--------------------------------+
                                   | POST /api/calculate (FormData)
                                   v
+-------------------------------------------------------------------+
|                    Next.js API Route Handler                       |
|                                                                   |
|  Dual-mode dispatch:                                              |
|  +- MACE_API_URL set     -> Forward to remote backend (HF Spaces) |
|  +- MACE_API_URL not set -> Local Python subprocess               |
+----------------------------------+--------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------+
|              Python Backend (ASE + mace-torch)                     |
|                                                                   |
|  calculate_local.py / main.py (FastAPI)                           |
|  +- Format detection (XYZ/CIF/POSCAR/PDB)                        |
|  +- MACE calculator setup (mace_mp / mace_off / custom)           |
|  +- Calculation execution (single-point / opt / MD)               |
|  +- JSON result output to stdout                                  |
+----------------------------------+--------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------+
|                    Supabase (PostgreSQL)                           |
|  shared_results table — public RLS (read/insert, no edit/delete)  |
+-------------------------------------------------------------------+
```

## Dual-mode execution

| Mode | Condition | How it works |
|------|-----------|--------------|
| **Local** | `MACE_API_URL` not set | Next.js spawns `python3 mace-api/calculate_local.py <file> <params>` as a subprocess |
| **Remote** | `MACE_API_URL` set | Next.js forwards the FormData to the hosted FastAPI backend |

## Data flow: single-point calculation

```
User uploads .xyz
  -> Client: parseStructureFile() extracts atoms, elements, formula
  -> FormData: { files: [structure], params: JSON }
  -> POST /api/calculate
  -> Python: ase.io.read() -> mace_mp()/mace_off() -> get_potential_energy()/get_forces()
  -> JSON: { status, energy, forces, positions, symbols, lattice }
  -> MetricsDashboard: Summary, Forces, Energy, Structure, Raw Data tabs
```

## Key technologies

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| 3D rendering | 3Dmol.js, WEAS widget |
| Charts | Plotly.js, Recharts |
| Chemistry | mace-torch (v0.3.14+), ASE (v3.27+) |
| Data | Supabase (Postgres + row-level security) |
| Reports | @react-pdf/renderer |

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| Dual-mode (local/remote) | Zero-config dev locally; scalable remote for production |
| Client-side structure parsing | No backend overhead for file validation |
| Dual 3D engines (3Dmol.js + WEAS) | 3Dmol.js for features; WEAS for ml-peg compatibility |
| Paul Tol colorblind-safe palette | Accessibility as a first principle |
| Insert-only MACE Link sharing | Immutable results ensure citation stability |
| JSON over stdout (subprocess) | Clean separation — Python writes JSON to stdout, logs to stderr |
