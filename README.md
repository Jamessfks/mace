# MACE Force Fields — Web Calculator

**CS2535 ORNL #3.** A visual web interface for running MACE force field calculations — no coding required. Upload a molecular structure, pick parameters, and get energy, forces, and a 3D viewer.

**Team:** Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri, Zicheng Zhao

---

## What This App Does

- Upload molecular structure files (`.xyz`, `.cif`, `.poscar`, `.pdb`)
- Choose a MACE model: **MACE-MP-0** (materials) or **MACE-OFF** (organic molecules)
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

---

## Project Structure

```
mace/
  app/                    # Next.js pages
    page.tsx              # Landing page
    calculate/page.tsx    # Calculator page
    report/page.tsx       # Liquid Water report
    api/calculate/route.ts  # API route (local or remote)
  components/             # UI components
    calculate/            # Calculator components
      file-upload-section.tsx
      parameter-panel.tsx
      results-display.tsx
      molecule-viewer-3d.tsx  # 3Dmol.js 3D viewer
      pdf-report.tsx
  mace-api/               # Python backend
    calculate_local.py    # Standalone script (no server needed)
    main.py               # FastAPI server (for cloud deployment)
    requirements.txt      # Python dependencies
  types/mace.ts           # TypeScript type definitions
  package.json            # Node.js dependencies
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

## Next Step(For team members)

He made **two specific suggestions** and one **future idea**:

### 1. Preview uploaded structure before running (the main ask)

Right now, your 3D viewer (`molecule-viewer-3d.tsx`) only appears **after** calculation completes. The founder wants users to **see** the structure **right after uploading**, before clicking "Run". This helps catch:
- Huge structures (thousands of atoms) that would overwhelm the server
- Wrong files or broken geometries
- Unexpected structures

He wants this as **click-to-display** (not automatic), so it doesn't slow things down for users who don't need it.

### 2. Use the same viewer widget as ml-peg (WEAS)

Looking at `ml_peg/app/utils/weas.py`, ml-peg uses **[WEAS (Web Environment for Atomistic Simulations)](https://github.com/superstar54/weas)** for structure visualization. It's a JavaScript library (imported from `https://unpkg.com/weas/dist/index.mjs`) that supports:
- XYZ, CIF, cube, XSF files
- Ball-and-stick / stick models
- Trajectory viewing
- Runs in an iframe with pure HTML/JS

He's suggesting you use WEAS instead of (or alongside) 3Dmol.js, so both tools share the same viewer and look/feel. This makes future integration easier.

### 3. Future: Connect ml-peg structure menu to your calculator

ml-peg has a curated menu of benchmark structures (bulk crystals, molecules, surfaces, conformers, etc. — see `ml_peg/app/`). The idea: instead of uploading a file, a user could **pick a structure from the ml-peg catalog** and run it through your MACE calculator.

---

## Priority 1: Add "Preview Structure" button after upload

This is the most important change. In `file-upload-section.tsx`, after a file is uploaded, add a **"Preview Structure"** button. When clicked, it:
- Parses the XYZ/CIF file client-side
- Shows the 3D viewer with atom count, element list, and bounding box
- Warns if the structure is large (e.g. >500 atoms)

You could reuse your existing `MoleculeViewer3D` component by parsing the uploaded file into positions/symbols on the client side (no backend needed — just read the text file in JS).

## Priority 2: Switch to (or add) WEAS viewer

To align with ml-peg, consider using WEAS. From their code, it's as simple as embedding an HTML snippet with:

```javascript
import { WEAS, parseXYZ, parseCIF } from 'https://unpkg.com/weas/dist/index.mjs';
```

You could either:
- **Replace** 3Dmol.js with WEAS (matches ml-peg exactly)
- **Add** WEAS as an option alongside 3Dmol.js

WEAS supports XYZ, CIF, and trajectory viewing out of the box.

## Priority 3: Add structure info/warnings

After parsing the uploaded file, show:
- **Atom count** (e.g. "192 atoms")
- **Elements** (e.g. "O, H, C")
- **Warning** if large (e.g. ">500 atoms — calculation may be slow")
- **Bounding box size** (how big the system is)

This directly addresses his concern about "catching huge or unexpected structures."

## Priority 4 (future): ml-peg structure catalog integration

Add a "Browse ml-peg structures" option alongside file upload. This would:
- Fetch the ml-peg benchmark structure list (from their S3 bucket or API)
- Let the user pick a structure (e.g. "bulk silicon", "ethanol conformer")
- Auto-load it into the calculator

This connects the two tools as he envisions.

---

## Summary of changes to make

| Change | Effort | Impact |
|--------|--------|--------|
| Preview structure after upload (click-to-display) | Medium | **High** — directly addresses his request |
| Show atom count + element warning on upload | Easy | **High** — catches large/wrong structures |
| Switch viewer to WEAS (match ml-peg) | Medium | **Medium** — aligns with their ecosystem |
| ml-peg structure catalog browser | Larger | **High** — the "fun future" he mentions |


## License

Academic use. MACE-OFF is under the [Academic Software License (ASL)](https://github.com/gabor1/ASL).
