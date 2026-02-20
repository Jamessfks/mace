<div align="center">

# MACE Force Fields — Web Interface

**Web-based interfaces with fine UI design for machine learning interatomic potentials.**
**No coding required. Upload a structure, pick parameters, get results.**

<p>
  <a href="https://github.com/Jamessfks/mace/releases"><img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version"/></a>
  <a href="https://github.com/Jamessfks/mace/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Academic-green?style=flat-square" alt="License"/></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+"/></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16"/></a>
  <a href="https://github.com/ACEsuit/mace"><img src="https://img.shields.io/badge/MACE--MP--0-89%20elements-purple?style=flat-square" alt="MACE-MP-0"/></a>
  <a href="https://github.com/Jamessfks/mace"><img src="https://img.shields.io/github/stars/Jamessfks/mace?style=flat-square&color=yellow" alt="Stars"/></a>
  <a href="https://github.com/Jamessfks/mace"><img src="https://img.shields.io/badge/status-active%20development-brightgreen?style=flat-square" alt="Status"/></a>
</p>

Built by a team of CS first-year students at **Northeastern University Oakland Campus**

[Features](#features) · [Community Database](#community-database) · [Quick Start](#quick-start) · [Screenshots](#screenshots) · [Architecture](#architecture) · [Deploy](#deploy-online) · [Reference Data](#semiconductor-reference-data) · [MACE Freeze](#mace-freeze-local-training)

</div>

---

> *"In the science community, you rarely see a disabled scientist." — Professor Cabrera*
>
> *How many talented scientists are we losing because of inaccessible tools? We want to be the pioneers of creating an accessible scientific web interface, encouraging the science community to respect people with needs.*


**Team:** Zicheng Zhao(zhao.zic@northeastern.edu), Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri
&nbsp;|&nbsp; Built on the [MACE API](https://github.com/ACEsuit/mace)

---

## Screenshots

<div align="center">

<img src="public/screenshot-semiconductor-overview.png" alt="Semiconductor Discovery — structure library, property calculator, EOS results" width="100%"/>

<br/>

<table>
<tr>
<td width="55%">

**11 chip-relevant materials** — Si, Ge, GaAs, InP, SiO₂, HfO₂, Al₂O₃, Si₃N₄, TiN, Cu, W — with verified experimental reference data. Select a material, run MACE-MP-0, and compare calculated bulk modulus and vacancy energy against Ioffe NSM, NIST, and Materials Project.

</td>
<td width="45%">

<img src="public/screenshot-3d-viewer.png" alt="3D Structure Viewer with force vectors and reference comparison table" width="100%"/>

</td>
</tr>
</table>

</div>

---

## Features

### General Calculator (`/calculate`)

| Feature | Description |
|---------|-------------|
| **File Upload** | `.xyz`, `.cif`, `.poscar`, `.pdb` formats |
| **Models** | MACE-MP-0 (89 elements, materials) · MACE-OFF (organic molecules) |
| **Calculations** | Single-point energy · Geometry optimization · Molecular dynamics |
| **Output** | Energy, forces, 3D viewer, MD trajectory animation, PDF report |

### Semiconductor Materials Discovery (`/semiconductor`)

| Feature | Description |
|---------|-------------|
| **Structure Library** | 11 pre-built materials across 5 categories (substrates, III-V, dielectrics, nitrides, metals) |
| **Property Calculator** | Single-point · Geometry opt · EOS bulk modulus · Vacancy formation energy |
| **Defect Generator** | Vacancy structures (atom removal) · Surface slabs (Miller indices + ASE) |
| **Reference Comparison** | Calculated vs experimental with % error (Ioffe NSM, Materials Project, NIST) |
| **Confidence Indicator** | Traffic-light gauge for MACE-MP-0 reliability per element coverage |
| **Comparison View** | Side-by-side bulk vs vacancy with dual 3D viewers |

### MACE Freeze (local training)

**No-code fine-tuning in the browser.** Train or fine-tune MACE without writing a single line of code: choose data, set options, click **Start training**, and watch scientific graphs update live. When training finishes, download your checkpoint and use it in the Calculator or locally.

| Feature | Description |
|---------|-------------|
| **Page** | [MACE Freeze Training](/mace-freeze) — single-page flow: data → options → **Start training** → live graphs → download |
| **Data** | **Option A:** use bundled Liquid Water dataset. **Option B:** upload your own `.xyz` or `.extxyz` (drag-and-drop, structure summary and size warnings). |
| **Options** | Run name, seed, device (CPU / CUDA), preset (**Quick demo** 5 epochs or **Full** 800 epochs), active-learning settings, and optional freeze fine-tuning (presets + custom patterns + preview + base checkpoint source). |
| **Live graphs** | **Training loss** vs epoch (area chart); **Validation MAE** — energy (meV/atom) and force (meV/Å) vs epoch. Dark, high-tech theme; data streams in as training runs. |
| **When done** | **Download checkpoint** (resolved as `best.pt` or latest `*_epoch-*.pt`) and **Open MACE Calculator** to use your model for other calculations. |
| **Loop control** | Active learning does not auto-stop by threshold. After append, either continue with **Next iteration** or click **Stop active learning here (model looks good)** to end manually. |
| **Scope** | **Local only:** training runs on your machine when the app is run locally (`npm run dev`). Not deployed to Vercel/Railway for training. |
| **Backend** | POST `/api/mace-freeze/train` streams progress (SSE), POST `/api/mace-freeze/committee` continues iterations, POST `/api/mace-freeze/freeze` + `/freeze-preview` manage freeze-init planning, POST `/api/mace-freeze/label` supports MACE-MP-0 or Quantum ESPRESSO, GET `/api/mace-freeze/checkpoint` serves resolved `.pt` files. |
| **Advanced** | See [mace-api/MACE_Freeze/README.md](mace-api/MACE_Freeze/README.md) for the full CLI workflow (freeze, committee disagreement, active learning, DFT labeling). |

Recent reliability updates:
- Fine-tune + committee no longer fails at `c0` due to invalid `--model <checkpoint>` usage; training now seeds per-model checkpoints and resumes with `--restart_latest`.
- Checkpoint lookup is robust across MACE versions (`best.pt` or latest `*_epoch-*.pt`).
- SSE training streams are hardened against disconnects (`Controller is already closed` no longer crashes route handlers).
- Freeze preview validates pattern matches and shows available module patterns before training.

---

## Community Database

<div align="center">

**The one of the first open, community-driven calculation database for machine learning interatomic potentials.**

*No other MLIP — not Meta's UMA, not Microsoft's MatterSim, not Google's GNoME — has a community feedback loop like this.*

</div>

The Community Database (`/community`) lets researchers **share and browse MACE calculation results** across institutions worldwide. Every calculation run through the web interface can be contributed with one click.

### Why This Matters

Machine learning force fields live or die by their training data. MACE-MP-0 was trained on ~150K structures from the Materials Project. Meta's UMA was trained on 500 million. **The community database closes this gap through crowdsourced contributions**

This is **active learning at the ecosystem level**: users contribute real-world results, model creators identify weaknesses, and future MACE versions improve on exactly the materials the community needs!

### How It Works

| Step | What Happens |
|------|-------------|
| **1. Calculate** | Run any MACE calculation on `/calculate` |
| **2. Share** | Click **"Share to Community Database"** at the bottom of results |
| **3. Attribute** | Optionally add your name, institution, and notes |
| **4. Browse** | Explore all shared calculations at `/community` with search, filters, and sorting |

### What Gets Recorded

Schema follows conventions from [Materials Project](https://materialsproject.org), [NOMAD](https://nomad-lab.eu), and [AFLOW](https://aflowlib.org):

| Category | Fields |
|----------|--------|
| **Structure** | Formula (Hill system), elements, atom count, file format |
| **Parameters** | Model (MACE-MP-0/OFF), size, calculation type, dispersion |
| **Results** | Energy, energy/atom, RMS force, max force, cell volume, wall time |
| **MD Data** | Steps, ensemble (NVE/NVT/NPT), temperature |
| **Contributor** | Name, institution, notes (all optional — anonymous by default) |

> **Current scope:** General Calculator (`/calculate`) only. Semiconductor page integration is planned for a future release.

### Technical Stack

- **Database:** [Supabase](https://supabase.com) (PostgreSQL) — globally replicated, Row Level Security, real-time capable
- **API:** `/api/community/share` (POST) + `/api/community/list` (GET with filters, sorting, pagination)
- **Schema:** Documented in [`supabase-schema.sql`](supabase-schema.sql) — portable, reproducible, citable in publications

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | v18+ | [nodejs.org](https://nodejs.org) |
| Python | 3.10+ | [python.org](https://www.python.org/downloads) |
| Quantum ESPRESSO (optional) | 7.x (`pw.x`) | For MACE Freeze DFT labeling only. See [MACE Freeze README](mace-api/MACE_Freeze/README.md) or [Optional: Installing Quantum ESPRESSO](#optional-installing-quantum-espresso-dft-labeling). |

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

### Optional: Installing Quantum ESPRESSO (DFT labeling)

This is only required for MACE Freeze Step 7 when labeling with `reference=qe`.

1. Download Quantum ESPRESSO source from the official site: [quantum-espresso.org](https://www.quantum-espresso.org/).
2. Build the plane-wave executable:

```bash
cd ~/Downloads/qe-7.5
./configure
make pw
```

3. Point MACE Freeze to `pw.x` (typically `qe-7.x/bin/pw.x`) by one of:
   - adding the QE `bin/` directory to your `PATH`
   - setting QE command in the app UI (absolute `pw.x` path, or QE root dir such as `~/Downloads/qe-7.5`)
   - setting `QE_COMMAND=/absolute/path/to/pw.x`
4. Configure pseudopotentials by setting `ESPRESSO_PSEUDO` or passing `pseudo_dir`.
5. Before DFT labeling, run:

```bash
python3 mace-api/MACE_Freeze/scripts/check_qe.py
```

For full CLI details, see [mace-api/MACE_Freeze/README.md](mace-api/MACE_Freeze/README.md).

### Try It

<table>
<tr>
<td width="33%">

**General Calculator**
1. Go to `/calculate`
2. Upload a `.xyz` file
3. Pick a model (MACE-MP-0 or MACE-OFF)
4. Click **RUN MACE CALCULATION**
5. View energy, forces, 3D structure

</td>
<td width="33%">

**Semiconductor Discovery**
1. Go to `/semiconductor`
2. Select a material (Si, GaAs, HfO₂…)
3. Choose workflows (EOS, vacancy…)
4. Click **RUN CALCULATIONS**
5. Compare results to reference data

</td>
<td width="33%">

**MACE Freeze (local)**
1. Go to `/mace-freeze`
2. Choose data (bundled water or upload)
3. Set run options (and optional freeze fine-tune)
4. Click **Start iteration 0**
5. Run active-learning steps (disagreement → select → label → append), then either stop manually if the model looks good or continue with next iteration

</td>
</tr>
</table>

---

## Architecture

```
Browser (localhost:3000)
    │
    ├── /calculate ─── /semiconductor ─── /community ─── /mace-freeze
    │        │                │                │              │
    │   Upload + params  Library + workflows  Browse shared   Data + options
    │        │                │                │              │ Start training
    ▼        │                │                │              ▼
Next.js API routes             │                │        POST /api/mace-freeze/train
    │                          │                │        (SSE stream)
    ├── /api/calculate   Multiple /api/calculate │              │
    │        │           (EOS, vacancy)          │              │ spawn
    │   Python subprocess       │                │              ▼
    │        ▼           /api/generate-surface   │        run_training_web.py
    │   calculate_local.py      │                │        split_dataset → mace_train
    │        │           generate_surface.py     │        parse log → JSON events
    ▼        ▼                  ▼                │              │
Results + 3D viewer    Results + EOS chart       │              ▼
  MD animation         + reference table         │        Live graphs in browser
  PDF report                                     │        (loss, MAE E, MAE F)
    │                                             │              │
    └──── "Share to Community" ──────────────────►│              │ done
              │                                   │              ▼
              ▼                                   ▼        GET /api/mace-freeze/checkpoint
         /api/community/share ──► Supabase ◄── /api/community/list   (download best.pt)
                                (PostgreSQL)
```

| Flow | How It Works |
|------|-------------|
| **General** | Upload → `/api/calculate` → Python subprocess → `calculate_local.py` → JSON → browser |
| **EOS** | Scale cell to 7 volumes → 7x single-point → polynomial E(V) fit → B₀ = V₀ × d²E/dV² |
| **Vacancy** | Bulk + defect calculations → E_vac = E_defect − E_bulk × (N−1)/N |
| **Surface** | `/api/generate-surface` → `generate_surface.py` → ASE `surface()` builder |
| **Share** | Results → opt-in "Share" button → `/api/community/share` → Supabase INSERT |
| **Browse** | `/community` page → `/api/community/list` → Supabase SELECT with filters + sort |
| **MACE Freeze train** | Data + options (including optional freeze fine-tune) → POST `/api/mace-freeze/train` → `run_training_web.py` (split, optional `mace_freeze.py`, per-model fine-tune checkpoint seeding, train/committee) → SSE logs/metrics → live charts |
| **MACE Freeze active learning** | POST `/api/mace-freeze/disagreement` → `/active-learning` → `/label` (MACE-MP-0 or QE) → `/append` → optional `/committee` for next iteration |
| **MACE Freeze download** | GET `/api/mace-freeze/checkpoint?runId=&runName=&iter=` → stream resolved checkpoint in `mace-api/MACE_Freeze/runs_web/{runId}/.../checkpoints/` |

---

## Deploy Online

<table>
<tr>
<td width="33%">

### Frontend — Vercel

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Set env vars (see below)

</td>
<td width="33%">

### Backend — Railway

1. Create project at [railway.app](https://railway.app)
2. Deploy from `mace-api/` folder
3. Copy URL → set as `MACE_API_URL`

</td>
<td width="33%">

### Database — Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase-schema.sql` in SQL Editor
3. Copy URL + anon key → set in Vercel

</td>
</tr>
</table>

**Vercel environment variables:**

| Variable | Value | Required |
|----------|-------|----------|
| `MACE_API_URL` | Your Railway backend URL | For calculations |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | For community DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | For community DB |

> **Note:** `NEXT_PUBLIC_` vars are inlined at build time. After adding them in Vercel, you must **redeploy** for them to take effect.

---

## Models

| Model | Best For | Elements | Source |
|-------|----------|----------|--------|
| **MACE-MP-0** | Materials, crystals, bulk solids | 89 elements | [ACEsuit/mace](https://github.com/ACEsuit/mace) |
| **MACE-OFF** | Organic molecules, drug-like molecules | H, C, N, O, P, S, F, Cl, Br, I | [ASL License](https://github.com/gabor1/ASL) |

Models download automatically on first use and are cached locally.

---

## Semiconductor Reference Data

All reference values in `lib/semiconductor-constants.ts` verified against primary experimental sources:

| Material | a (Å) | B (GPa) | E_vac (eV) | Source |
|----------|--------|---------|------------|--------|
| Si (diamond) | 5.431 | 98 | 3.6 | Ioffe NSM, PRL 56 2195 |
| Ge (diamond) | 5.658 | 75 | 2.5 | Ioffe NSM, SSP 131-133 |
| GaAs (zincblende) | 5.653 | 75.5 | — | Ioffe NSM |
| InP (zincblende) | 5.869 | 71 | — | Ioffe NSM |
| HfO₂ (monoclinic) | 5.117 | 189 | — | Materials Project PBE |
| SiO₂ (α-quartz) | 4.916 | 37.1 | — | Brillouin spectroscopy |
| Si₃N₄ (β) | 7.608 | 259 | — | NIST Brillouin scattering |
| Al₂O₃ (corundum) | 4.759 | 254 | — | X-ray diffraction |
| Cu (FCC) | 3.615 | 140 | 1.28 | Experimental + DFT |
| W (BCC) | 3.165 | 310 | 3.67 | Maier 1979 (quenching) |
| TiN (rocksalt) | 4.240 | 288 | — | Literature consensus |

<details>
<summary><strong>EOS Methodology</strong></summary>

The EOS fitting uses a cubic polynomial approximation to the Birch-Murnaghan equation of state, valid for small volume deformations (±6%). Bulk modulus is extracted as B₀ = V₀ × d²E/dV² at the energy minimum. The eV/ų → GPa conversion uses the exact CODATA value (160.2176634).

</details>

---

## Project Structure

<details>
<summary><strong>Click to expand full file tree</strong></summary>

```
mace/
  app/
    api/
      calculate/route.ts            # API route — local Python or remote MACE API
      generate-surface/route.ts     # Surface slab generation via ASE
      community/
        share/route.ts              # POST — share calculation to community DB
        list/route.ts               # GET — query community calculations (filterable)
      mace-freeze/
        train/route.ts              # POST — initial split + train/committee, stream progress as SSE
        committee/route.ts          # POST — train committee for next iteration
        disagreement/route.ts       # POST — committee disagreement scoring on pool.xyz
        active-learning/route.ts    # POST — select top-K uncertain structures
        label/route.ts              # POST — label selected structures (MACE-MP-0 or QE)
        append/route.ts             # POST — append labeled data into train.xyz
        freeze/route.ts             # POST — run mace_freeze.py to create freeze_init.pt
        freeze-preview/route.ts     # POST — preview freeze matches and counts before training
        checkpoint/route.ts         # GET — stream resolved checkpoint for a run (download)
    calculate/page.tsx              # General calculator page
    semiconductor/page.tsx          # Semiconductor discovery page
    community/page.tsx              # Community database browsing page
    mace-freeze/page.tsx            # No-code training UI: data, options, Start training, live graphs
    globals.css
    layout.tsx
    page.tsx                        # Landing page
  components/
    calculate/
      file-upload-section.tsx       # Upload zone + ml-peg catalog
      mlpeg-catalog.tsx             # ml-peg benchmark browser
      molecule-viewer-3d.tsx        # 3Dmol.js + WEAS dual viewer
      parameter-panel.tsx           # Model & calculation params
      pdf-report.tsx                # PDF report generator
      results-display.tsx           # Energy, forces, viewer, share button
      share-to-community.tsx        # Opt-in share form for community DB
      structure-info.tsx            # Parsed structure info + warnings
      structure-preview.tsx         # Click-to-display 3D preview
      weas-viewer.tsx               # WEAS iframe viewer
      trajectory/
        trajectory-viewer.tsx       # MD animation player
        energy-chart.tsx            # SVG energy-vs-step chart
    semiconductor/
      structure-library.tsx         # Card grid — 11 materials
      defect-generator.tsx          # Vacancy + surface slab builder
      property-calculator.tsx       # Multi-step MACE workflows
      semiconductor-results.tsx     # Results + EOS chart + ref table
      confidence-indicator.tsx      # MACE reliability gauge
      comparison-view.tsx           # Bulk vs vacancy comparison
    mace-freeze/
      dataset-upload.tsx            # Option B: .xyz/.extxyz upload + structure summary
      training-charts.tsx           # Loss + MAE Energy/Force vs epoch (recharts)
      command-block.tsx             # Copyable CLI block (optional / advanced use)
    ui/                             # shadcn/ui components
    Footer.tsx
    intro-section.tsx
  lib/
    mlpeg-catalog.ts                # ml-peg structure catalog
    parse-structure.ts              # XYZ/CIF/PDB/POSCAR parser
    supabase.ts                     # Supabase client singleton (community DB)
    semiconductor-structures.ts     # 11 semiconductor XYZ structures
    semiconductor-constants.ts      # Verified reference data
    semiconductor-properties.ts     # EOS fit + vacancy energy helpers
    utils.ts
  mace-api/
    calculate_local.py              # Local MACE calculation script
    generate_surface.py             # ASE surface generator
    main.py                         # FastAPI server (cloud deploy)
    requirements.txt
    MACE_Freeze/
      run_training_web.py           # Web training entry: split → mace_train, parse log → JSON stdout
      run_committee_web.py          # Committee training entry for subsequent iterations
      checkpoint_resolver.py        # Resolve best.pt or latest epoch checkpoint
      split_dataset.py              # Train/valid split
      split_dataset_pool.py         # Train/valid/pool split for active learning
      mace_train.py                 # Reproducible training wrapper (calls mace_run_train)
      mace_freeze.py                # Freeze-init checkpoint for fine-tuning
      freeze_preview.py             # Freeze preview utility (counts + available patterns)
      model_disagreement.py         # Committee disagreement scores
      mace_active_learning.py       # Top-K uncertain structure selection
      label_with_reference.py       # Labeling (MACE-MP-0 / EMT / Quantum ESPRESSO)
      inference_test.py             # Quick inference test
      data/
        Liquid_Water.xyz            # Bundled water dataset
      data_uploads/                 # Uploaded datasets (per runId) when using Option B
      runs_web/                     # Training run dirs: runs_web/{runId}/data, freeze, iter_00, iter_01...
      README.md                     # Full CLI workflow (freeze, committee, active learning)
  types/
    mace.ts                         # Calculator type definitions
    semiconductor.ts                # Semiconductor type definitions
    community.ts                    # Community database type definitions
  public/                           # Static assets + screenshots
  supabase-schema.sql               # Community DB schema (run in Supabase SQL editor)
```

</details>

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node: command not found` | Install Node.js from [nodejs.org](https://nodejs.org) |
| `python3: command not found` | Install Python from [python.org](https://python.org). Windows: try `python` |
| `pip: command not found` | Try `pip3` or `python3 -m pip install ...` |
| `mace-torch` install fails | Install Python 3.10+. Try `pip install torch` first |
| First calculation is slow | Normal — model downloads on first use (~30s) |
| Calculation fails | Check terminal for Python errors. Verify `mace-torch` + `ase` installed |
| `npm run dev` fails | Run `npm install` first. Requires Node.js 18+ |
| Community DB not configured | Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (local) or Vercel env vars (production). Run `supabase-schema.sql` in Supabase SQL editor. |
| Share button returns error | Verify the `calculations` table exists in Supabase and RLS policies are enabled |
| MACE Freeze training fails / no progress | Run locally (`npm run dev`). Ensure `mace-torch`, `ase`, `torch`, `numpy` are installed. Training runs in `mace-api/MACE_Freeze/`; check that `data/Liquid_Water.xyz` exists for Option A. |
| Fine-tune committee fails at `Model c0 failed with code 1` | Update to latest code in this repo. The fine-tune path now seeds per-model checkpoints + `--restart_latest` (instead of invalid `--model <checkpoint>`). |
| QE labeling fails (`pw.x` not found / pseudo error) | Install Quantum ESPRESSO, build `pw.x`, and run `python3 mace-api/MACE_Freeze/scripts/check_qe.py`. Then set `ESPRESSO_PSEUDO` or provide `pseudo_dir`. See [Optional: Installing Quantum ESPRESSO](#optional-installing-quantum-espresso-dft-labeling). |
| MACE Freeze download 404 | Training may still be running or have failed. Check `mace-api/MACE_Freeze/runs_web/{runId}/` for the run directory and checkpoint files (`best.pt` or `*_epoch-*.pt`). |
| `Controller is already closed` during train/committee streaming | Update to latest code in this repo; SSE routes now guard stream close/enqueue and handle client disconnects safely. |

---

<div align="center">

**Built at Northeastern University** · Khoury College of Computer Sciences

Academic use · MACE-OFF under [Academic Software License](https://github.com/gabor1/ASL)

</div>
