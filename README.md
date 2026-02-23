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

[Features](#features) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Deploy](#deploy-online)

</div>

---

> *"In the science community, you rarely see a disabled scientist." — Professor Cabrera*
>
> *How many talented scientists are we losing because of inaccessible tools? We want to be the pioneers of creating an accessible scientific web interface, encouraging the science community to respect people with needs.*


**Team:** Zicheng Zhao(zhao.zic@northeastern.edu), Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri
&nbsp;|&nbsp; Built on the [MACE API](https://github.com/ACEsuit/mace)

---

## Features

### Web Calculator (`/calculate`)

| Feature | Description |
|---------|-------------|
| **File Upload** | `.xyz`, `.cif`, `.poscar`, `.pdb` formats |
| **Models** | MACE-MP-0 (89 elements, materials) · MACE-OFF (organic molecules) |
| **Calculations** | Single-point energy · Geometry optimization · Molecular dynamics |
| **Output** | Energy, forces, 3D viewer, MD trajectory animation, PDF report |

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

1. Go to `/calculate`
2. Upload a `.xyz` file (or pick one from the ml-peg catalog)
3. Pick a model (MACE-MP-0 or MACE-OFF)
4. Click **RUN MACE CALCULATION**
5. View energy, forces, 3D structure

---

## Architecture

```
Browser (localhost:3000)
    │
    └── /calculate
         │
         Upload + params
         │
         ▼
    Next.js API routes
         │
         ├── /api/calculate
         │        │
         │   Python subprocess
         │        ▼
         │   calculate_local.py
         │
         └── /api/generate-surface
                  │
              generate_surface.py
                  │
                  ▼
         Results + 3D viewer
           MD animation
           PDF report
```

| Flow | How It Works |
|------|-------------|
| **Calculate** | Upload → `/api/calculate` → Python subprocess → `calculate_local.py` → JSON → browser |
| **Surface** | `/api/generate-surface` → `generate_surface.py` → ASE `surface()` builder |

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
</tr>
</table>

**Vercel environment variables:**

| Variable | Value | Required |
|----------|-------|----------|
| `MACE_API_URL` | Your Railway backend URL | For calculations |

> **Note:** `NEXT_PUBLIC_` vars are inlined at build time. After adding them in Vercel, you must **redeploy** for them to take effect.

---

## Models

| Model | Best For | Elements | Source |
|-------|----------|----------|--------|
| **MACE-MP-0** | Materials, crystals, bulk solids | 89 elements | [ACEsuit/mace](https://github.com/ACEsuit/mace) |
| **MACE-OFF** | Organic molecules, drug-like molecules | H, C, N, O, P, S, F, Cl, Br, I | [ASL License](https://github.com/gabor1/ASL) |

Models download automatically on first use and are cached locally.

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
    calculate/page.tsx              # Web calculator page
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
      results-display.tsx           # Energy, forces, viewer
      structure-info.tsx            # Parsed structure info + warnings
      structure-preview.tsx         # Click-to-display 3D preview
      weas-viewer.tsx               # WEAS iframe viewer
      trajectory/
        trajectory-viewer.tsx       # MD animation player
        energy-chart.tsx            # SVG energy-vs-step chart
    ui/                             # shadcn/ui components
    Footer.tsx
    intro-section.tsx
  lib/
    mlpeg-catalog.ts                # ml-peg structure catalog
    parse-structure.ts              # XYZ/CIF/PDB/POSCAR parser
    utils.ts
  mace-api/
    calculate_local.py              # Local MACE calculation script
    generate_surface.py             # ASE surface generator
    main.py                         # FastAPI server (cloud deploy)
    requirements.txt
  types/
    mace.ts                         # Calculator type definitions
  public/                           # Static assets
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

---

<div align="center">

**Built at Northeastern University** · Khoury College of Computer Sciences

Academic use · MACE-OFF under [Academic Software License](https://github.com/gabor1/ASL)

</div>
