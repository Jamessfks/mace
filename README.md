# MACE Force Fields — Web Calculator

**Northeastern University Research Project.** A visual web interface for running MACE force field calculations — no coding required. Upload a molecular structure, pick parameters, and get energy, forces, and a 3D viewer.

**Team:** Zicheng Zhao, Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri

This project uses the MACE API: https://github.com/ACEsuit/mace

> **185 unique cloners in 7 days** — viral by academic software standards. It means the science community is actually using the web interface!
---

## Purpose and Functionalities

The critical insight from competitive research: no web-based ML force-field calculator currently offers a polished UI. **This is one of the FIRST web-based interfaces for machine learning interatomic potentials, a space where virtually all competitors remain CLI-only.**

- Upload molecular structure files (`.xyz`, `.cif`, `.poscar`, `.pdb`)
- Choose a MACE model: **MACE-MP-0** (Pre-trained on materials, 89 elements — use for crystals, alloys, oxides, etc., without training) or **MACE-OFF** (Pre-trained for organic molecules — use for drug-like molecules, liquids, soft matter.)
- Run calculations: single-point energy, geometry optimization, or molecular dynamics
- View results: energy, forces, 3D molecule viewer, downloadable PDF report

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

1. Go to [http://localhost:3000/calculate](http://localhost:3000/calculate)
2. Upload a `.xyz` file (e.g. an ethanol or water molecule)
3. Choose a model (MACE-OFF for organic molecules, MACE-MP-0 for materials)
4. Click **RUN MACE CALCULATION**
5. Wait for the result (first run may take longer while the model downloads)
6. View energy, forces, and the 3D structure

---

## How It Works

```
Browser (localhost:3000)
    |
    |  Upload file + parameters
    v
Next.js API route (/api/calculate)
    |
    |  Spawns Python subprocess
    v
calculate_local.py (Python + MACE)
    |
    |  Returns JSON (energy, forces, etc.)
    v
Browser shows results
```

- The **website** (Next.js) runs in your browser
- When you click "Run", it calls a local API route
- That API route runs a **Python script** (`mace-api/calculate_local.py`) on your machine
- The Python script loads the MACE model, computes energy/forces, and returns JSON
- The website displays the results

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
    api/calculate/route.ts     # API route (local Python subprocess or remote MACE API)
    calculate/page.tsx         # MACE Calculator page
    favicon.ico
    globals.css
    layout.tsx
    page.tsx                   # Landing page
  components/
    calculate/
      file-upload-section.tsx  # Upload zone + ml-peg catalog + file card
      mlpeg-catalog.tsx        # Browse ml-peg benchmark structures
      molecule-viewer-3d.tsx    # 3Dmol.js + WEAS dual-engine viewer
      parameter-panel.tsx      # Model, calculation type, physical params
      pdf-report.tsx           # PDF report generation
      results-display.tsx      # Energy, forces, viewer, forces table
      structure-info.tsx       # Auto-parsed structure info + warnings
      structure-preview.tsx    # Click-to-display 3D preview (WEAS/3Dmol)
      weas-viewer.tsx         # WEAS iframe viewer (ml-peg compatible)
    ui/                        # badge, button, card, scroll-area, tabs
    Footer.tsx
    intro-section.tsx
  lib/
    mlpeg-catalog.ts           # ml-peg benchmark structure catalog
    parse-structure.ts         # Client-side XYZ/CIF/PDB/POSCAR parser
    utils.ts
  mace-api/
    calculate_local.py         # Standalone script (no server, for local mode)
    main.py                    # FastAPI server (for cloud deployment)
    README.md
    requirements.txt
  public/                      # Static assets (SVGs, images)
  types/
    mace.ts                    # CalculationParams, CalculationResult, etc.
  CALCULATOR_README.md
  DEPLOYMENT.md
  components.json              # shadcn/ui config
  eslint.config.mjs
  next.config.ts
  package.json
  postcss.config.mjs
  README.md
  requirements.txt             # Optional Python deps
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


## License

Academic use. MACE-OFF is under the [Academic Software License (ASL)](https://github.com/gabor1/ASL).
