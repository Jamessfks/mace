# MACE Force Fields — Web Calculator

**A team of CS first year students with one goal from Northeastern University.** 

A visual web interface for running MACE force field calculations — no coding required. Upload a molecular structure, pick parameters, and get energy, forces, and a 3D viewer.

<div align="center">

### Semiconductor Materials Discovery

*Structure library, bulk modulus, EOS fitting, vacancy formation energy, reference comparison — all in the browser.*

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

> *A heartbreaking fact Professor Cabrera said to me: "In the science community, you rarely see a disabled scientist."*
>
> *He asked me why, and I replied: "Because they got filtered out by inaccessible scientific tools..."*
>
> *How many talented scientists are we losing because of inaccessible scientific tools? Not every disabled scientist has accessible tools like those of Stephen Hawking.*
>
> *We want to be the pioneers of creating an accessible scientific web interface, encouraging the science community to respect people with needs.*

**Latest Update:** This web interface is under active daily development!
1. **Semiconductor Materials Discovery** — new `/semiconductor` page for exploring chip-relevant materials with bulk modulus, vacancy formation energy, EOS fitting, defect generation, and side-by-side comparison. All reference data verified against primary experimental literature.
2. Brand-new UI design with a modernized look and feel
3. MD Trajectory Animation with energy chart

**Team:** Zicheng Zhao, Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri

This project uses the MACE API: https://github.com/ACEsuit/mace

> **318 unique cloners in 7 days** — viral by academic software standards. It means the science community is actually using the web interface!

---

## Purpose and Functionalities

The critical insight from competitive research: no web-based ML force-field calculator currently offers a polished UI. **This is one of the FIRST web-based interfaces for machine learning interatomic potentials, a space where virtually all competitors remain CLI-only.**

### General Calculator (`/calculate`)

- Upload molecular structure files (`.xyz`, `.cif`, `.poscar`, `.pdb`)
- Choose a MACE model: **MACE-MP-0** (Pre-trained on materials, 89 elements — use for crystals, alloys, oxides, etc., without training) or **MACE-OFF** (Pre-trained for organic molecules — use for drug-like molecules, liquids, soft matter.)
- Run calculations: single-point energy, geometry optimization, or molecular dynamics
- View results: energy, forces, 3D molecule viewer, MD trajectory animation, downloadable PDF report

### Semiconductor Materials Discovery (`/semiconductor`)

- Browse a **pre-built library of 11 chip-relevant materials** across 5 categories: substrates (Si, Ge), III-V semiconductors (GaAs, InP), dielectrics (SiO₂, HfO₂, Al₂O₃), nitrides (Si₃N₄, TiN), and metals (Cu, W)
- **Property calculator** — single-point, geometry optimization, equation of state (EOS) for bulk modulus, and vacancy formation energy workflows
- **Defect generator** — create vacancy structures (remove atoms) and surface slabs (Miller indices + thickness) via ASE
- **Reference comparison** — calculated values compared to experimental/DFT reference data with % error (sources: Ioffe NSM, Materials Project PBE, NIST Brillouin scattering, primary literature)
- **Confidence indicator** — traffic-light gauge showing MACE-MP-0 prediction reliability based on element coverage in the MPTrj training set
- **Side-by-side comparison** — view bulk vs. vacancy structures with 3D viewers and energy differences

---

## Run Locally (Step-by-Step Tutorial)

Follow these steps to run the full app on your own computer. No cloud server needed.

### Prerequisites

You need two things installed:

1. **Node.js** (v18 or later) — for the website
2. **Python 3.10+** — for the MACE calculations

#### Install Node.js

- Go to [https://nodejs.org](https://nodejs.org)
- Download the **LTS** version
- Run the installer (click Next/Continue through everything)
- To verify, open a terminal and type:

```bash
node --version
```

You should see something like `v18.x.x` or `v20.x.x`.

#### Install Python

- Go to [https://www.python.org/downloads](https://www.python.org/downloads)
- Download Python 3.10 or later
- **Important (Windows):** Check the box that says **"Add Python to PATH"** during installation
- To verify, open a terminal and type:

```bash
python3 --version
```

You should see something like `Python 3.10.x` or later.

---

### Step 1: Download the Project

Open a terminal and run:

```bash
git clone https://github.com/Jamessfks/mace.git
cd mace
```

If you don't have `git`, you can download the project as a ZIP from GitHub and unzip it.

---

### Step 2: Install Website Dependencies

In the `mace` folder, run:

```bash
npm install
```

This downloads all the JavaScript packages the website needs. It may take 1–2 minutes.

---

### Step 3: Install Python / MACE Dependencies

Still in the `mace` folder, run:

```bash
pip install mace-torch ase
```

This installs:
- **mace-torch** — the MACE machine learning model
- **ase** — Atomic Simulation Environment (reads structure files, runs MD, etc.)

This may take a few minutes (it downloads PyTorch and other packages).

> **Note:** If `pip` doesn't work, try `pip3` instead.

---

### Step 4: Start the App

Run:

```bash
npm run dev
```

Then open your browser and go to:

**[http://localhost:3000](http://localhost:3000)**

That's it! The website is running locally. When you upload a structure and click "RUN MACE CALCULATION", the calculation runs directly on your computer using Python — no cloud server, no Railway, no sign-ups.

---

### Step 5: Try a Calculation

**General Calculator:**
1. Go to [http://localhost:3000/calculate](http://localhost:3000/calculate)
2. Upload a `.xyz` file (e.g. an ethanol or water molecule)
3. Choose a model (MACE-OFF for organic molecules, MACE-MP-0 for materials)
4. Click **RUN MACE CALCULATION**
5. Wait for the result (first run may take longer while the model downloads)
6. View energy, forces, and the 3D structure

**Semiconductor Discovery:**
1. Go to [http://localhost:3000/semiconductor](http://localhost:3000/semiconductor)
2. Select a material from the library (e.g. Silicon, GaAs, HfO₂)
3. Optionally generate a vacancy or surface slab using the Defect Generator
4. Check the workflows you want (single-point, EOS, vacancy formation)
5. Click **RUN CALCULATIONS**
6. View results with reference comparison, EOS chart, and confidence indicator

---

## How It Works

```
Browser (localhost:3000)
    |
    |  /calculate ─────────────────────  /semiconductor
    |       |                                  |
    |  Upload file + params            Select material from library
    v       |                            + choose workflows (EOS,
Next.js API routes                       vacancy, single-point)
    |                                          |
    ├── /api/calculate                         |
    |       |                                  |
    |   Spawns Python subprocess               |
    |       v                            Multiple /api/calculate calls
    |   calculate_local.py               (7 for EOS, 2 for vacancy)
    |       |                                  |
    |   Returns JSON                     ├── /api/generate-surface
    |   (energy, forces, etc.)           |       |
    |       |                            |   generate_surface.py (ASE)
    v       v                            v       v
Browser shows results              Browser shows results
  + 3D viewer                        + reference comparison table
  + MD animation                     + EOS chart (E vs V)
  + PDF report                       + confidence indicator
                                     + bulk vs vacancy comparison
```

### General flow

- The **website** (Next.js) runs in your browser
- When you click "Run", it calls a local API route
- That API route runs a **Python script** (`mace-api/calculate_local.py`) on your machine
- The Python script loads the MACE model, computes energy/forces, and returns JSON
- The website displays the results

### Semiconductor flow

- The semiconductor page uses the **same `/api/calculate` backend** — no new model server needed
- **EOS workflow**: scales the unit cell to 7 volumes (0.94-1.06 x V₀), runs 7 single-point calculations, fits a cubic polynomial E(V) curve, and extracts bulk modulus as B₀ = V₀ × d²E/dV²
- **Vacancy workflow**: runs 2 single-point calculations (bulk + defect), computes E_vac = E_defect - E_bulk × (N-1)/N
- **Surface generation**: calls `/api/generate-surface` which runs ASE's `surface()` builder via `mace-api/generate_surface.py`
- **Reference data**: all comparison values verified against Ioffe NSM database, Materials Project, NIST Brillouin scattering studies, and primary experimental literature (positron annihilation, quenching, X-ray diffraction)

No external servers are used in local mode.

---

## Deploy Online (Optional)

If you want the app accessible to others without them installing anything:

### Frontend (Vercel)

1. Push the project to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo, click Deploy
3. Set the environment variable `MACE_API_URL` to your backend URL (see below)

### Backend (Railway or any server)

1. Go to [railway.app](https://railway.app)
2. Create a new project from the `mace-api/` folder
3. Railway will run the FastAPI backend (`main.py`)
4. Copy the Railway URL and set it as `MACE_API_URL` in Vercel

When `MACE_API_URL` is set, the app forwards calculations to that server instead of running Python locally.

> **Note:** The public demo backend runs on Railway’s **Hobby Plan** ($5/month). This paid subscription reflects our team’s dedication to keeping the MACE calculator available online for the community.

---

## Project Structure

```
mace/
  app/
    api/
      calculate/route.ts         # API route (local Python subprocess or remote MACE API)
      generate-surface/route.ts  # Surface slab generation via ASE (semiconductor page)
    calculate/page.tsx           # MACE Calculator page
    semiconductor/page.tsx       # Semiconductor Materials Discovery page
    globals.css
    layout.tsx
    page.tsx                     # Landing page
  components/
    calculate/
      file-upload-section.tsx    # Upload zone + ml-peg catalog + file card
      mlpeg-catalog.tsx          # Browse ml-peg benchmark structures
      molecule-viewer-3d.tsx     # 3Dmol.js + WEAS dual-engine viewer
      parameter-panel.tsx        # Model, calculation type, physical params
      pdf-report.tsx             # PDF report generation
      results-display.tsx        # Energy, forces, viewer, forces table
      structure-info.tsx         # Auto-parsed structure info + warnings
      structure-preview.tsx      # Click-to-display 3D preview (WEAS/3Dmol)
      weas-viewer.tsx            # WEAS iframe viewer (ml-peg compatible)
      trajectory/                # MD Trajectory Animation (only for MD runs)
        trajectory-viewer.tsx    # Animated 3Dmol.js player + transport controls
        energy-chart.tsx         # SVG energy-vs-step chart (synced with player)
    semiconductor/
      structure-library.tsx      # Card grid of 11 chip-relevant materials
      defect-generator.tsx       # Vacancy removal + surface slab builder
      property-calculator.tsx    # Orchestrates multi-step MACE workflows
      semiconductor-results.tsx  # Results cards + EOS chart + reference table
      confidence-indicator.tsx   # Traffic-light MACE reliability gauge
      comparison-view.tsx        # Side-by-side bulk vs vacancy comparison
    ui/                          # badge, button, card, scroll-area, tabs
    Footer.tsx
    intro-section.tsx
  lib/
    mlpeg-catalog.ts             # ml-peg benchmark structure catalog
    parse-structure.ts           # Client-side XYZ/CIF/PDB/POSCAR parser
    semiconductor-structures.ts  # 11 pre-built semiconductor XYZ structures
    semiconductor-constants.ts   # Verified reference data (lattice, B, E_vac)
    semiconductor-properties.ts  # EOS polynomial fit + vacancy energy helpers
    utils.ts
  mace-api/
    calculate_local.py           # Standalone script (no server, for local mode)
    generate_surface.py          # ASE surface slab generator (semiconductor page)
    main.py                      # FastAPI server (for cloud deployment)
    README.md
    requirements.txt
  public/                        # Static assets (SVGs, images)
  types/
    mace.ts                      # CalculationParams, CalculationResult, etc.
    semiconductor.ts             # SemiconductorMaterial, PropertyResult, etc.
  CALCULATOR_README.md
  DEPLOYMENT.md
  TEST-REPORT.md
  components.json                # shadcn/ui config
  eslint.config.mjs
  next.config.ts
  package.json
  postcss.config.mjs
  README.md
  requirements.txt               # Optional Python deps
  tsconfig.json
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node: command not found` | Install Node.js from [nodejs.org](https://nodejs.org) |
| `python3: command not found` | Install Python from [python.org](https://python.org). On Windows, try `python` instead of `python3` |
| `pip: command not found` | Try `pip3` or `python3 -m pip install ...` |
| `mace-torch` install fails | Make sure Python 3.10+ is installed. Try: `pip install torch` first, then `pip install mace-torch` |
| First calculation is slow | Normal — MACE downloads the model on first use (~30s). Later runs are faster |
| Calculation hangs or fails | Check the terminal for Python errors. Make sure `mace-torch` and `ase` are installed |
| `npm run dev` fails | Run `npm install` first. Make sure Node.js 18+ is installed |

---

## Models

| Model | Best for | Elements |
|-------|----------|----------|
| **MACE-MP-0** | Materials, crystals, bulk solids | 89 elements |
| **MACE-OFF** | Organic molecules (ethanol, water, etc.) | H, C, N, O, P, S, F, Cl, Br, I |

Models are downloaded automatically on first use and cached locally.

---


## Semiconductor Reference Data Sources

All reference values in `lib/semiconductor-constants.ts` have been verified against credible primary sources:

| Material | a (Å) | B (GPa) | E_vac (eV) | Source |
|----------|--------|---------|------------|--------|
| Si (diamond) | 5.431 | 98 | 3.6 | Ioffe NSM, PRL 56 2195 (1986) |
| Ge (diamond) | 5.658 | 75 | 2.5 | Ioffe NSM, SSP 131-133 (DFT) |
| GaAs (zincblende) | 5.653 | 75.5 | — | Ioffe NSM |
| InP (zincblende) | 5.869 | 71 | — | Ioffe NSM |
| HfO₂ (monoclinic) | 5.117 | 189 | — | Materials Project PBE (mp-352) |
| SiO₂ (α-quartz) | 4.916 | 37.1 | — | Brillouin spectroscopy, X-ray diffraction |
| Si₃N₄ (β) | 7.608 | 259 | — | NIST Brillouin scattering |
| Al₂O₃ (corundum) | 4.759 | 254 | — | X-ray diffraction, experimental |
| Cu (FCC) | 3.615 | 140 | 1.28 | Experimental + DFT |
| W (BCC) | 3.165 | 310 | 3.67 | Phys. Rev. 130 1324, Maier 1979 (quenching) |
| TiN (rocksalt) | 4.240 | 288 | — | Literature consensus |

The EOS fitting uses a cubic polynomial approximation to the Birch-Murnaghan equation of state, valid for small volume deformations (±6%). The eV/ų to GPa conversion uses the exact CODATA value (160.2176634).

---

## License

Academic use. MACE-OFF is under the [Academic Software License (ASL)](https://github.com/gabor1/ASL).
