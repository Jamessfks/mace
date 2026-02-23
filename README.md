<div align="center">

# MACE Force Fields — Web Interface

**A research-grade web platform for machine learning interatomic potentials.**
**No coding required. Upload a structure, pick parameters, get publication-ready results.**

<p>
  <a href="https://github.com/Jamessfks/mace/releases"><img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version"/></a>
  <a href="https://github.com/Jamessfks/mace/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Academic-green?style=flat-square" alt="License"/></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+"/></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16"/></a>
  <a href="https://github.com/ACEsuit/mace"><img src="https://img.shields.io/badge/MACE--MP--0-89%20elements-purple?style=flat-square" alt="MACE-MP-0"/></a>
  <a href="https://github.com/Jamessfks/mace"><img src="https://img.shields.io/github/stars/Jamessfks/mace?style=flat-square&color=yellow" alt="Stars"/></a>
  <a href="https://github.com/Jamessfks/mace"><img src="https://img.shields.io/badge/status-active%20development-brightgreen?style=flat-square" alt="Status"/></a>
</p>

Contact: zhao.zic@northeasten.edu or zezepy070413@gmail.com

[Why This Exists](#why-this-exists) · [Core Features](#core-features) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Deploy](#deploy-online)

</div>

---

> *"In the science community, you rarely see a disabled scientist." — Professor Cabrera*
>
> *How many talented scientists are we losing because of inaccessible tools? We want to be the pioneers of creating an accessible scientific web interface, encouraging the science community to respect people with needs.*

**Team:** Zicheng Zhao (zhao.zic@northeastern.edu), Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri
&nbsp;|&nbsp; Built on the [MACE framework](https://github.com/ACEsuit/mace) (NeurIPS 2022)

---

## Why This Exists

Running MACE calculations today requires writing Python scripts, managing ASE atoms objects, and building custom analysis pipelines. That workflow is fine for experienced computational chemists — but it locks out students learning materials science, experimentalists who need quick predictions, and researchers who want to compare models without writing boilerplate code.

This interface eliminates that barrier entirely. You upload a structure file, choose your model and parameters from a visual panel, and get back a full scientific analysis dashboard — energy, forces, 3D visualization, parity plots, error histograms, trajectory animations, PDF reports — in your browser. No terminal, no scripts, no environment setup.

It also solves a problem that even experienced MACE users face: **model comparison**. When you train a custom MACE model, how does it stack up against the foundation model on the same structure? This interface lets you run both side-by-side and see a radar chart comparing Energy MAE, Force MAE, R², RMSE, and Max Force Error — instantly.

---

## Core Features

### Scientific Calculator

| Capability | Details |
|---|---|
| **Structure Input** | Drag-and-drop upload for `.xyz`, `.cif`, `.poscar`, `.contcar`, `.pdb` files. Auto-parses atom count, elements, bounding box, and warns about large systems or overlapping atoms. |
| **Foundation Models** | MACE-MP-0 (89 elements, bulk crystals, materials) and MACE-OFF (organic molecules, drug-like compounds). Small, medium, and large variants for each. |
| **Custom Models** | Upload your own `.model` file (any MACE-compatible PyTorch checkpoint from `mace_run_train`) and run it alongside foundation models. |
| **Calculation Types** | Single-point energy & forces, BFGS geometry optimization, molecular dynamics (NVE/NVT/NPT ensembles). |
| **Full Parameter Control** | Temperature, pressure, time step, Langevin friction, MD steps, force threshold, cutoff radius, D3 dispersion correction, precision (float32/float64), device (CPU/CUDA). |

### Visualization & Analysis

| Feature | What It Does |
|---|---|
| **Metrics Dashboard** | Tabbed interface (Summary, Forces, Energy, Structure, Raw Data) showing key metrics cards, accuracy analysis, and trajectory summaries. |
| **3D Structure Viewer** | Dual-engine viewer (3Dmol.js + WEAS) with ball-and-stick/stick/spacefill representations, force vector overlays, auto-rotation, and fullscreen mode. |
| **Force Parity Plots** | Predicted vs. reference force components with R², MAE, and RMSE annotations. Requires reference data in extended XYZ format. |
| **Error Histograms** | Force error distributions with mean/standard deviation markers. |
| **Energy Convergence** | Energy vs. optimization/MD step charts for tracking convergence behavior. |
| **MD Trajectory Player** | Frame-by-frame animation with play/pause, speed control (0.5×–4×), frame scrubbing, and an energy chart synced to the current frame. |
| **Radar Chart Comparison** | Spider chart comparing two models across five accuracy axes (Energy MAE, Force MAE, 1−R², Force RMSE, Max Force Error). |

### Model Comparison

When you run a calculation with a custom model, a **"Compare with Foundation Model"** button appears. One click re-runs the identical structure through the corresponding MACE foundation model and displays:

- Side-by-side energy and RMS force metrics
- Delta energy (ΔE) between the two models
- A multi-metric radar chart (when reference data is available)
- Per-model accuracy breakdown (MAE, RMSE, R²)

The comparison card uses a blue-to-purple gradient border to visually distinguish it from standard results.

### Export & Reporting

| Format | Contents |
|---|---|
| **PDF Report** | Formatted document with MACE branding, key metrics summary, physical parameters, and atomic forces table (up to 50 atoms). |
| **CSV** | Per-atom forces table with element, Fx, Fy, Fz, and magnitude columns. |
| **JSON** | Complete calculation result including energy, forces, positions, trajectory, and metadata. |
| **Chart Images** | Every Plotly chart has a toolbar for PNG/SVG export. |

### Benchmark Library

The built-in **ml-peg catalog** provides curated benchmark structures across four categories:

- **Bulk Crystals** — Silicon, GaAs, LiF, NaCl, diamond, BCC iron
- **Molecular Systems** — Water, ethanol, aspirin, benzene
- **Non-Covalent** — Water dimer, benzene dimer, stacked DNA bases
- **Surfaces** — Cu(111), TiO₂ anatase, Pt(111)

Each entry includes the chemical formula, atom count, recommended model (MACE-MP-0 vs. MACE-OFF), and a description. Click any structure to load it directly into the calculator.

### Quick Demo Mode

Visit `/calculate?demo=true` to launch a guided walkthrough. The interface auto-loads an ethanol molecule and walks you through the three-step flow with dismissible tooltips:

1. **Structure loaded** — see the uploaded file, or swap in your own
2. **Configure** — choose model type and calculation parameters
3. **Run** — click the button and watch the progress tracker

### Reference Data & Accuracy Metrics

Upload an extended XYZ file containing `REF_energy` and `REF_forces` properties, and the dashboard automatically computes:

- **Force MAE** and **Force RMSE** (meV/Å)
- **Energy MAE** (meV/atom)
- **Energy R²**
- Parity plots and error distributions

A "Reference data detected" badge appears in the status bar, and the Summary tab expands to show a dedicated Model Accuracy section.

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | v18+ | [nodejs.org](https://nodejs.org) |
| Python | 3.10+ | [python.org](https://www.python.org/downloads) |

### Setup

```bash
# 1. Clone
git clone https://github.com/Jamessfks/mace.git
cd mace

# 2. Install frontend
npm install

# 3. Install backend
pip install mace-torch ase

# 4. Run
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** — that's it. No cloud, no sign-ups.

> **Note:** First calculation may take ~30s while the MACE model downloads. Subsequent runs are fast.

### Try It

1. Go to `/calculate` (or click **Launch Calculator** on the landing page)
2. Upload a `.xyz` file — or browse the **ml-peg catalog** for benchmark structures
3. Pick a model (MACE-MP-0 for materials, MACE-OFF for organic molecules)
4. Choose your calculation type and parameters
5. Click **RUN MACE CALCULATION**
6. Explore the tabbed dashboard: metrics, 3D viewer, charts, trajectory animation
7. Export results as PDF, CSV, or JSON

---

## Architecture

```
Browser (localhost:3000)
    │
    ├── /                          Landing page + animated water MD background
    │
    └── /calculate                 Two-panel calculator UI
         │
         │  Upload files + params (multipart/form-data)
         │
         ▼
    Next.js API Routes
         │
         ├── /api/calculate        ── Python subprocess ──▶ calculate_local.py
         │                            (or remote MACE API via MACE_API_URL)
         │
         └── /api/generate-surface ── Python subprocess ──▶ generate_surface.py
                                                              (ASE slab builder)
         │
         ▼
    Results rendered in browser:
      ├── Metrics dashboard (5 tabs)
      ├── 3D structure viewer (3Dmol.js / WEAS)
      ├── Plotly charts (parity, histogram, convergence, radar)
      ├── MD trajectory animation
      ├── Model comparison (custom vs. foundation)
      └── Export (PDF / CSV / JSON)
```

The interface runs in two modes:

| Mode | When | How It Works |
|------|------|-------------|
| **Local** | `MACE_API_URL` not set | Spawns a Python subprocess on the same machine. Requires `mace-torch` and `ase` installed locally. |
| **Remote** | `MACE_API_URL` set | Forwards the request to a hosted MACE API (e.g. Railway). No local Python needed. |

---

## Deploy Online

<table>
<tr>
<td width="50%">

### Frontend — Vercel

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Set `MACE_API_URL` environment variable
4. Deploy

</td>
<td width="50%">

### Backend — Railway

1. Create project at [railway.app](https://railway.app)
2. Deploy from `mace-api/` folder
3. Copy the deployment URL
4. Set it as `MACE_API_URL` in Vercel

</td>
</tr>
</table>

| Variable | Value | Required |
|----------|-------|----------|
| `MACE_API_URL` | Your Railway backend URL (e.g. `https://mace-api.up.railway.app`) | Yes, for cloud deployment |

> **Note:** After adding environment variables in Vercel, you must **redeploy** for them to take effect.

---

## Models

| Model | Best For | Elements | Source |
|-------|----------|----------|--------|
| **MACE-MP-0** | Materials, crystals, bulk solids, surfaces | 89 elements across the periodic table | [ACEsuit/mace](https://github.com/ACEsuit/mace) |
| **MACE-OFF** | Organic molecules, drug-like compounds, molecular crystals | H, C, N, O, P, S, F, Cl, Br, I | [ASL License](https://github.com/gabor1/ASL) |
| **Custom** | Your fine-tuned MACE model for domain-specific accuracy | Depends on training data | Upload `.model` file |

All foundation models download automatically on first use and are cached locally. Custom models are uploaded per-session and not stored on the server.

---

## Project Structure

<details>
<summary><strong>Click to expand full file tree</strong></summary>

```
mace/
  app/
    api/
      calculate/route.ts              # Calculation API — local Python or remote backend
      generate-surface/route.ts       # Surface slab generation via ASE
    calculate/page.tsx                # Two-panel calculator page
    globals.css                       # Design system (CSS custom properties)
    layout.tsx                        # Root layout + metadata
    page.tsx                          # Landing page with animated hero
  components/
    calculate/
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
      results-display.tsx             # Legacy results display (fallback)
      structure-info.tsx              # Auto-parsed structure summary + warnings
      structure-preview.tsx           # Click-to-display 3D preview
      weas-viewer.tsx                 # WEAS iframe viewer
    ui/                               # shadcn/ui primitives
    Footer.tsx
    intro-section.tsx                 # Landing page hero + features grid
    water-md-canvas.tsx               # Animated Three.js water background
  lib/
    mlpeg-catalog.ts                  # ml-peg structure definitions
    parse-structure.ts                # Multi-format structure parser
    utils.ts
  mace-api/
    calculate_local.py                # Standalone MACE calculation script
    generate_surface.py               # ASE surface slab generator
    main.py                           # FastAPI server for cloud deployment
    requirements.txt
  types/
    mace.ts                           # TypeScript type definitions
  public/
    demo/                             # Demo structures (ethanol.xyz, water.xyz)
```

</details>

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node: command not found` | Install Node.js from [nodejs.org](https://nodejs.org) |
| `python3: command not found` | Install Python from [python.org](https://python.org). On Windows, try `python` instead. |
| `pip: command not found` | Try `pip3` or `python3 -m pip install ...` |
| `mace-torch` install fails | Ensure Python 3.10+. Install PyTorch first: `pip install torch` |
| First calculation is slow (~30s) | Normal — the MACE model downloads on first use and is cached afterward. |
| Calculation fails | Check terminal for Python errors. Verify `mace-torch` and `ase` are installed. |
| `npm run dev` fails | Run `npm install` first. Requires Node.js 18+. |
| CUDA out of memory | Switch to CPU in the parameter panel, or use a smaller model size. |
| Custom model errors | Ensure the `.model` file is a valid MACE PyTorch checkpoint from `mace_run_train`. |

---

## Acknowledgments

This project is built on top of the [MACE framework](https://github.com/ACEsuit/mace), published at NeurIPS 2022. We are grateful to the MACE team for making state-of-the-art machine learning interatomic potentials accessible to the research community.

The ml-peg benchmark structures are sourced from established computational materials science datasets. The Paul Tol colorblind-safe palette is used throughout the visualization system.

---

<div align="center">


Academic use · MACE-OFF under [Academic Software License](https://github.com/gabor1/ASL)

</div>
