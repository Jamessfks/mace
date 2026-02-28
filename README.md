<div align="center">

# MACE Force Fields — Web Interface

**A research-grade web platform for machine learning interatomic potentials.**
**Draw a molecule, upload a structure, or browse benchmarks — get publication-ready results in your browser.**

<h3>
  <a href="https://mace-lake.vercel.app"> Live Demo → mace-lake.vercel.app</a>
</h3>

<p>
  <a href="https://mace-lake.vercel.app"><img src="https://img.shields.io/badge/live-mace--lake.vercel.app-00C853?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo"/></a>
</p>

<p>
  <a href="https://github.com/Jamessfks/mace/releases"><img src="https://img.shields.io/badge/version-1.1.0-blue?style=flat-square" alt="Version"/></a>
  <a href="https://github.com/Jamessfks/mace/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Academic-green?style=flat-square" alt="License"/></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+"/></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16"/></a>
  <a href="https://github.com/ACEsuit/mace"><img src="https://img.shields.io/badge/MACE--MP--0-89%20elements-purple?style=flat-square" alt="MACE-MP-0"/></a>
  <a href="https://github.com/Jamessfks/mace"><img src="https://img.shields.io/github/stars/Jamessfks/mace?style=flat-square&color=yellow" alt="Stars"/></a>
  <a href="https://github.com/Jamessfks/mace"><img src="https://img.shields.io/badge/status-active%20development-brightgreen?style=flat-square" alt="Status"/></a>
</p>

Built by **Zicheng Zhao** · Northeastern University

Contact: zhao.zic@northeastern.edu or zezepy070413@gmail.com

[Sketch-a-Molecule](#sketch-a-molecule) · [Core Features](#core-features) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Deploy](#deploy-online)

</div>

---

> *"In the science community, you rarely see a disabled scientist." — Professor Cabrera*
>
> *How many talented scientists are we losing because of inaccessible tools? We want to be the pioneers of creating an accessible scientific web interface, encouraging the science community to respect people with needs.*

&nbsp;|&nbsp; Built on the [MACE framework](https://github.com/ACEsuit/mace) (NeurIPS 2022)

---

## Sketch-a-Molecule

**Draw any organic molecule in the browser and run DFT-accuracy simulations instantly — no files, no coding, no setup.**

Click **Draw Molecule** on the calculator page to open a full-featured molecule sketcher (JSME). Draw bonds and atoms, and the interface gives you real-time 2D validation, molecular descriptors, and a one-click path to MACE-OFF calculations.

### How a 2D sketch becomes a real 3D structure

A sketch encodes molecular *topology* (atoms, bonds, stereochemistry) but has no 3D coordinates. We reconstruct physically accurate geometry through a physics pipeline:

1. **Distance bounds** — Min/max distance constraints between all atom pairs derived from bond lengths, angles, torsions, and van der Waals radii.
2. **ETKDGv3 distance geometry** — Random distance matrices are embedded in 3D, then refined with experimental torsion preferences from the Cambridge Structural Database.
3. **Multi-conformer sampling** — Up to 50 independent conformers are generated (scaled by molecule size) to explore conformational space.
4. **MMFF94 optimization** — Each conformer is minimized with the Merck Molecular Force Field (1.30 kcal/mol mean error vs. coupled-cluster references).
5. **Energy-ranked selection** — The lowest-energy conformer is selected as the best starting geometry for MACE-OFF.

### Pipeline

```
JSME editor → SMILES → RDKit.js validation + 2D SVG preview (browser)
  → POST /api/smiles-to-xyz → RDKit Python (ETKDGv3 + MMFF94) → XYZ
  → Auto-select MACE-OFF → RUN MACE CALCULATION → Results dashboard
```

| Component | Technology |
|-----------|------------|
| Sketcher | [JSME](https://jsme-editor.github.io/) via `@loschmidt/jsme-react` |
| Client-side validation | [RDKit.js](https://www.rdkitjs.com/) (WASM, ~7 MB) |
| 3D coordinate generation | Python [RDKit](https://www.rdkit.org/) (`EmbedMultipleConfs` + `MMFFOptimizeMoleculeConfs`) |
| Force field | [MACE-OFF](https://arxiv.org/abs/2312.15211) — wB97M-D3BJ accuracy, 10 elements (H, C, N, O, F, P, S, Cl, Br, I) |

---

## Core Features

### Scientific Calculator

| Capability | Details |
|---|---|
| **Structure Input** | Drag-and-drop upload (`.xyz`, `.cif`, `.poscar`, `.pdb`), ml-peg catalog (14 structures), or **draw a molecule** with the built-in sketcher. |
| **Foundation Models** | MACE-MP-0 (89 elements, materials) and MACE-OFF (organic molecules). Small, medium, and large variants. |
| **Custom Models** | Upload your own `.model` file and compare against foundation models. |
| **Calculation Types** | Single-point energy & forces, geometry optimization (BFGS), molecular dynamics (NVE/NVT/NPT). |
| **Full Parameter Control** | Temperature, pressure, time step, friction, MD steps, force threshold, cutoff radius, D3 dispersion, precision, device. |

### Visualization & Analysis

| Feature | Details |
|---|---|
| **3D Viewer** | Dual-engine (3Dmol.js + WEAS), force vector overlays, ball-and-stick/stick/spacefill, fullscreen. |
| **Metrics Dashboard** | 5-tab interface: Summary, Forces, Energy, Structure, Raw Data. |
| **MD Trajectory Player** | Frame-by-frame animation with play/pause, speed control, energy chart synced to current frame. |
| **Model Comparison** | Side-by-side custom vs. foundation model with radar chart (MAE, RMSE, R²). |
| **Export** | PDF report, CSV forces, JSON results, PNG/SVG charts. |

### Multi-Model Benchmark Suite

Batch-evaluate 2-3 models across multiple structures at `/benchmark`. Results include a sortable leaderboard, force comparison charts, timing analysis, energy landscape plots, and a model agreement heatmap — all exportable as CSV, JSON, or PDF.

---

## Quick Start

```bash
git clone https://github.com/Jamessfks/mace.git && cd mace
npm install                    # frontend
pip install mace-torch ase     # backend
npm run dev                    # → http://localhost:3000
```

> First calculation takes ~30s (model download). Subsequent runs are fast.

### Try the Sketcher

1. Go to `/calculate` → click **Draw Molecule**
2. Draw a molecule (e.g. aspirin, caffeine, ibuprofen)
3. Click **Generate 3D & Load Structure**
4. Click **RUN MACE CALCULATION**
5. Explore the results dashboard

---

## Architecture

```
Browser (localhost:3000)
    │
    ├── /calculate                 Calculator with [Upload File | Draw Molecule] toggle
    │       │
    │       ├── Draw mode ──▶ JSME editor → SMILES → /api/smiles-to-xyz
    │       │                   → RDKit 3D coords → auto-load as .xyz
    │       │
    │       └── Upload mode ──▶ Drag-and-drop / ml-peg catalog
    │
    ├── /benchmark                 Multi-model benchmark suite
    │
    ▼
    Next.js API Routes
         ├── /api/smiles-to-xyz    ── python3 smiles_to_xyz.py (RDKit)
         ├── /api/calculate        ── python3 calculate_local.py (MACE + ASE)
         ├── /api/benchmark        ── Batch (model × structure) pairs
         └── /api/generate-surface ── python3 generate_surface.py (ASE)
```

| Mode | When | How |
|------|------|-----|
| **Local** | `MACE_API_URL` not set | Python subprocess on same machine |
| **Remote** | `MACE_API_URL` set | Forward to hosted API (e.g. Railway) |

---

## Deploy Online

| Step | Frontend (Vercel) | Backend (Railway) |
|------|-------------------|-------------------|
| 1 | Push to GitHub | Create project at railway.app |
| 2 | Import repo at vercel.com | Deploy from `mace-api/` folder |
| 3 | Set `MACE_API_URL` env var | Copy the deployment URL |

---

## Models

| Model | Best For | Elements |
|-------|----------|----------|
| **MACE-MP-0** | Materials, crystals, surfaces | 89 elements |
| **MACE-OFF** | Organic molecules, drug-like compounds | H, C, N, O, F, P, S, Cl, Br, I |
| **Custom** | Domain-specific accuracy | Upload `.model` file |

---

## Project Structure

<details>
<summary><strong>Click to expand full file tree</strong></summary>

```
mace/
  app/
    api/
      calculate/route.ts              # Single-structure calculation API
      benchmark/route.ts              # Batch benchmark API (model × structure)
      smiles-to-xyz/route.ts          # SMILES → 3D XYZ conversion API
      generate-surface/route.ts       # Surface slab generation via ASE
    calculate/page.tsx                # Calculator page with [Upload | Draw] toggle
    benchmark/
      page.tsx                        # Multi-model benchmark page
      loading.tsx                     # Loading spinner
    globals.css                       # Design system (CSS custom properties)
    layout.tsx                        # Root layout + metadata
    page.tsx                          # Landing page with animated hero
  components/
    calculate/
      molecule-sketcher.tsx           # Sketch-a-Molecule: JSME + RDKit.js validation
      charts/
        chart-config.ts               # Shared Plotly config + color palette
        parity-plot.tsx               # Predicted vs. reference scatter plot
        error-histogram.tsx           # Error distribution histogram
        energy-convergence.tsx        # Energy vs. step line chart
        radar-comparison.tsx          # Multi-metric spider chart
      trajectory/
        trajectory-viewer.tsx         # MD animation player with controls
        energy-chart.tsx              # SVG energy chart synced to frames
      file-upload-section.tsx         # Drag-and-drop upload + ml-peg catalog
      metrics-dashboard.tsx           # Tabbed results dashboard (5 tabs)
      mlpeg-catalog.tsx               # Benchmark structure browser
      model-comparison.tsx            # Custom vs. foundation model comparison
      molecule-viewer-3d.tsx          # 3Dmol.js + WEAS dual-engine viewer
      parameter-panel.tsx             # Model selection + calculation params
      pdf-report.tsx                  # PDF report generator
      structure-info.tsx              # Auto-parsed structure summary + warnings
      structure-preview.tsx           # Click-to-display 3D preview
      weas-viewer.tsx                 # WEAS iframe viewer
    benchmark/
      benchmark-config.tsx            # Model + structure selection panel
      benchmark-dashboard.tsx         # Tabbed results container (5 tabs)
      benchmark-leaderboard.tsx       # Sortable energy/atom comparison table
      benchmark-force-bars.tsx        # RMS force bar chart + per-atom table
      benchmark-timing.tsx            # Timing bar chart + speedup ratios
      benchmark-energy-landscape.tsx  # Energy/atom scatter+line plot
      benchmark-heatmap.tsx           # Pairwise model agreement heatmap
      benchmark-export.tsx            # CSV / JSON / PDF export
    ui/                               # shadcn/ui primitives
    intro-section.tsx                 # Landing page hero + features grid
    water-md-canvas.tsx               # Animated Three.js water background
  lib/
    mlpeg-catalog.ts                  # ml-peg structure definitions (14 structures)
    parse-structure.ts                # Multi-format structure parser
    utils.ts
  mace-api/
    smiles_to_xyz.py                  # SMILES → 3D XYZ (RDKit multi-conformer + MMFF94)
    calculate_local.py                # Standalone MACE calculation script
    generate_surface.py               # ASE surface slab generator
    main.py                           # FastAPI server for cloud deployment
    requirements.txt
  types/
    mace.ts                           # TypeScript type definitions
  public/
    RDKit_minimal.js                  # RDKit WASM loader (static asset)
    RDKit_minimal.wasm                # RDKit WASM binary (static asset)
    demo/                             # Demo structures (ethanol.xyz, water.xyz)
```

</details>

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| First calculation slow (~30s) | Normal — model downloads on first use, cached afterward. |
| `mace-torch` install fails | Install PyTorch first: `pip install torch`. Requires Python 3.10+. |
| CUDA out of memory | Switch to CPU in the parameter panel, or use a smaller model. |
| Sketch-a-Molecule blank editor | JSME needs pixel dimensions. Resize the browser window to trigger re-measurement. |
| RDKit WASM fails to load | Verify `public/RDKit_minimal.js` and `public/RDKit_minimal.wasm` exist. |
| `torch.load` / `weights_only` error | PyTorch 2.6+ issue — already patched in `calculate_local.py`. Run `pip install --upgrade mace-torch`. |
| MACE-OFF element error | MACE-OFF only supports 10 organic elements. Use MACE-MP-0 for metals/inorganics. |

---

## Acknowledgments

Built on the [MACE framework](https://github.com/ACEsuit/mace) (NeurIPS 2022). Sketch-a-Molecule uses [RDKit](https://www.rdkit.org/) for 3D coordinate generation and [JSME](https://jsme-editor.github.io/) for molecule sketching. The ml-peg benchmark structures are sourced from established computational materials science datasets.

---

<div align="center">

Academic use · MACE-OFF under [Academic Software License](https://github.com/gabor1/ASL)

</div>