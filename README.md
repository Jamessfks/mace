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

## License

Academic use. MACE-OFF is under the [Academic Software License (ASL)](https://github.com/gabor1/ASL).
