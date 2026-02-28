# Sketch-a-Molecule — Technical Documentation

**Draw any organic molecule in the browser and run DFT-accuracy MACE-OFF simulations instantly.**

This document covers every implementation detail of the Sketch-a-Molecule feature: the scientific reasoning, the tools chosen and why, the architecture, every file involved, the problems encountered and how they were solved, and the end-to-end data flow from a user's mouse click to a computed energy in electron-volts.

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Idea](#2-the-idea)
3. [End-to-End Data Flow](#3-end-to-end-data-flow)
4. [How a 2D Sketch Becomes a Real 3D Structure](#4-how-a-2d-sketch-becomes-a-real-3d-structure)
5. [Tool Selection and Rationale](#5-tool-selection-and-rationale)
6. [File-by-File Implementation](#6-file-by-file-implementation)
7. [Integration with the Existing Calculator](#7-integration-with-the-existing-calculator)
8. [Problems Encountered and Solutions](#8-problems-encountered-and-solutions)
9. [Scientific Validation](#9-scientific-validation)
10. [Dependencies Added](#10-dependencies-added)

---

## 1. The Problem

The MACE web interface required users to have a pre-made structure file (`.xyz`, `.cif`, `.poscar`, `.pdb`) before they could run any calculation. This created a barrier:

- A researcher who wanted to quickly check the energy of a drug candidate had to first open a separate tool (Avogadro, GaussView, PyMOL), draw the molecule there, export it as XYZ, then upload it to the MACE interface.
- A student learning computational chemistry had no way to explore molecular properties without understanding file formats.
- The round-trip from "I wonder about this molecule" to "here are its energies and forces" took minutes instead of seconds.

The existing alternatives — uploading a file or selecting from the ml-peg catalog — serve experienced users and benchmarking workflows. But they don't serve the spontaneous, exploratory use case: "What happens if I add a fluorine here?"

---

## 2. The Idea

Put a molecule sketcher directly in the calculator page. The user draws a molecule with their mouse, clicks one button, and gets a full MACE-OFF calculation — energy, forces, 3D structure, geometry optimization, or molecular dynamics — using the same pipeline that uploaded files go through.

The key design constraint: **the sketcher must produce output that is identical to an uploaded file**. This means no changes to the calculation backend, the results dashboard, the 3D viewer, the trajectory player, or the PDF export. The sketcher is purely additive — it generates a `File` object containing XYZ text, and everything downstream consumes it exactly as before.

---

## 3. End-to-End Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│                                                                  │
│  ┌─────────────┐    onChange     ┌──────────────────────┐        │
│  │ JSME Editor  │ ──────────▶  │ SMILES string         │        │
│  │ (draw here)  │   "CCO"      │ e.g. "CCO" (ethanol)  │        │
│  └─────────────┘               └──────────┬───────────┘        │
│                                            │ 300ms debounce      │
│                                            ▼                     │
│                                ┌──────────────────────┐         │
│                                │ RDKit.js (WASM)       │         │
│                                │ • validate SMILES     │         │
│                                │ • render 2D SVG       │         │
│                                │ • extract descriptors │         │
│                                │ • check elements vs   │         │
│                                │   MACE-OFF set        │         │
│                                └──────────┬───────────┘         │
│                                            │ if valid             │
│                                            ▼                     │
│                                ┌──────────────────────┐         │
│                                │ "Generate 3D" button  │         │
│                                │ POST /api/smiles-to-  │         │
│                                │ xyz { smiles: "CCO" } │         │
│                                └──────────┬───────────┘         │
└───────────────────────────────────────────┼──────────────────────┘
                                            │
                                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    NEXT.JS API ROUTE                              │
│                    app/api/smiles-to-xyz/route.ts                 │
│                                                                  │
│  execFile("python3", ["smiles_to_xyz.py", "CCO"])                │
│  • 30s timeout, 10MB buffer                                      │
│  • passes SMILES as CLI argument (no shell, no injection)        │
│  • parses JSON from stdout                                       │
└───────────────────────────────────────────┬──────────────────────┘
                                            │
                                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PYTHON (RDKit)                                 │
│                    mace-api/smiles_to_xyz.py                      │
│                                                                  │
│  1. Chem.MolFromSmiles("CCO")    → molecular graph               │
│  2. Validate elements ⊆ {H,C,N,O,F,P,S,Cl,Br,I}               │
│  3. Chem.AddHs(mol)              → explicit hydrogens            │
│  4. EmbedMultipleConfs(mol, 50)  → 50 random 3D conformers      │
│     using ETKDGv3 distance geometry                              │
│  5. MMFFOptimizeMoleculeConfs()  → optimize each with MMFF94     │
│  6. Select lowest-energy conformer                               │
│  7. Write XYZ text               → "9\nC2H6O | SMILES: CCO\n…"  │
│  8. Print JSON to stdout                                         │
└───────────────────────────────────────────┬──────────────────────┘
                                            │
                                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BROWSER (continued)                            │
│                                                                  │
│  const file = new File([xyz], "sketched-molecule.xyz")           │
│  setUploadedFiles([file])        → same state as file upload     │
│  setParams({ modelType: "MACE-OFF" })  → auto-select model      │
│                                                                  │
│  User clicks "RUN MACE CALCULATION"                              │
│  → POST /api/calculate (EXISTING, UNCHANGED)                    │
│  → calculate_local.py (ASE + MACE-OFF)                          │
│  → Results dashboard, 3D viewer, trajectory, PDF export          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. How a 2D Sketch Becomes a Real 3D Structure

This is the central scientific question. A SMILES string like `"CCO"` encodes **topology** — which atoms are bonded, bond orders, stereochemistry — but contains zero spatial information. We need physically accurate 3D coordinates (in Angstroms) that respect bond lengths, bond angles, torsion angles, and non-bonded interactions.

### Step 1: Distance Bounds Matrix

From the molecular graph, RDKit computes a matrix of minimum and maximum allowed distances between every pair of atoms:

- **1-2 pairs (bonded):** Bond length from tabulated values (C-C single = 1.54 Å, C=C double = 1.34 Å, C-H = 1.09 Å, O-H = 0.96 Å).
- **1-3 pairs (angle):** Derived from bond angles (tetrahedral carbon ≈ 109.5°, trigonal ≈ 120°).
- **1-4 pairs (torsion):** Range from cis to trans configurations.
- **Non-bonded pairs:** Van der Waals radii define the lower bound (atoms can't overlap); no upper bound for distant atoms.

### Step 2: ETKDGv3 Distance Geometry

The ETKDGv3 algorithm (Experimental Torsion Knowledge Distance Geometry, version 3) works in four sub-steps:

1. **Triangle smoothing** — The bounds matrix is made consistent: if A-B ≤ 3 Å and B-C ≤ 3 Å, then A-C ≤ 6 Å (triangle inequality).
2. **Random distance sampling** — A random distance matrix is generated where each entry falls within the smoothed bounds.
3. **Metric matrix embedding** — The distance matrix is converted to a coordinate matrix via eigenvalue decomposition (same math as multidimensional scaling). This places atoms in 3D (or 4D) space.
4. **Refinement** — Torsion angle preferences from the Cambridge Structural Database are applied (e.g., butane prefers gauche/anti over eclipsed). Chemical knowledge rules enforce planarity for aromatic rings and linearity for sp-hybridized carbons.

### Step 3: Multi-Conformer Sampling

A single distance geometry embedding may land in a local minimum — one valid 3D arrangement out of many. Flexible molecules like drug candidates can have hundreds of conformers (rotatable-bond rotamers, ring puckers).

We generate **multiple conformers** (up to 50 for small molecules, scaled down for larger ones) from different random seeds. Each conformer is a different valid 3D arrangement that satisfies all the distance bounds.

The scaling:

| Atom count | Conformers generated |
|------------|---------------------|
| ≤ 10       | 50                  |
| 11-30      | 30                  |
| 31-100     | 15                  |
| > 100      | 5                   |

Near-duplicate conformers are pruned automatically by RMSD threshold (0.5 Å).

### Step 4: MMFF94 Force Field Optimization

Each conformer is geometry-optimized using the Merck Molecular Force Field (MMFF94). MMFF94 is parameterized against high-level quantum chemistry data and has been benchmarked at 1.30 kcal/mol mean error against coupled-cluster references (J. Comput.-Aided Mol. Des., 2023). UFF (Universal Force Field) has 3.77 kcal/mol error and is used only as a fallback if MMFF94 parameterization fails for unusual functional groups.

### Step 5: Energy-Ranked Selection

The conformer with the lowest MMFF94 energy is selected. This is the best classical approximation to the global minimum geometry. MACE-OFF can then further refine it via quantum-accuracy geometry optimization if the user chooses that calculation type.

### Why This Matters for MACE

MACE-OFF (arXiv:2312.15211) is a machine learning force field trained on ωB97M-D3BJ/def2-TZVPPD reference data. It predicts energies and forces at near-DFT accuracy for organic molecules. But it needs a **reasonable starting geometry** — if you feed it atoms at random positions, the forces will be enormous and the calculation may fail or produce meaningless results.

The multi-conformer MMFF94 pipeline gives MACE a starting geometry with:
- Correct bond lengths (within ~0.02 Å of quantum chemistry)
- Correct bond angles (within ~2°)
- A low-energy conformer (not a strained or clashing geometry)
- RMS forces typically 0.2-1.0 eV/Å (non-zero, but reasonable — MACE's geometry optimizer converges from here in 10-50 steps)

---

## 5. Tool Selection and Rationale

### JSME — Molecule Sketcher (`@loschmidt/jsme-react`)

**What it is:** A browser-based molecule editor originally written as a Java applet, now compiled to JavaScript. Created by Peter Ertl and Bruno Bienfait.

**Why JSME over alternatives:**

| Sketcher | License | Size | React pkg | SMILES output | Decision |
|----------|---------|------|-----------|---------------|----------|
| **JSME** | BSD | ~200 KB | `@loschmidt/jsme-react` | Yes, via `onChange` callback | **Chosen** — lightweight, zero dependencies, mature |
| Ketcher | Apache 2.0 | ~5 MB | `ketcher-react` | Yes | Rejected — too heavy, requires separate Indigo backend service |
| MarvinJS | Commercial | ~3 MB | None | Yes | Rejected — not open source |

**Implementation details:**
- Loaded lazily via `import("@loschmidt/jsme-react")` to avoid adding to the initial bundle
- The `onChange` callback fires on every structural edit, providing the SMILES string
- JSME requires **exact pixel dimensions** — it creates a Java applet-style canvas that can't handle CSS `%` or `auto` sizing. We solve this with a `ResizeObserver` that measures the container and passes integer pixel values.
- JSME's React wrapper declares `peerDependencies: { "@types/react": "17 - 18" }`, which conflicts with this project's React 19. Resolved via `.npmrc` with `legacy-peer-deps=true`. The runtime is unaffected — JSME is a thin wrapper around script injection + DOM element creation.

### RDKit.js — Client-Side Validation (`@rdkit/rdkit`)

**What it is:** The official JavaScript/WASM distribution of RDKit, the industry-standard open-source cheminformatics toolkit.

**Why we need it in the browser (not just on the server):**
- **Instant validation** — the user gets "Invalid SMILES" or "Unsupported element" feedback in <100ms, without waiting for a server round-trip
- **2D SVG preview** — the user sees a clean 2D structural drawing of what they sketched, confirming they drew the right molecule
- **Molecular descriptors** — formula, molecular weight, and heavy atom count are computed client-side

**Key APIs used:**
- `initRDKitModule({ locateFile: () => "/RDKit_minimal.wasm" })` — loads the 6.6 MB WASM binary
- `RDKitModule.get_mol(smiles)` — returns a `JSMol` object or `null` if invalid
- `mol.is_valid()` — structural validity check
- `mol.get_svg(width, height)` — renders 2D structure as SVG string
- `mol.get_descriptors()` — returns JSON with `MolecularFormula`, `exactMW`, `NumHeavyAtoms`
- `mol.delete()` — **critical**: frees C++ memory allocated by the WASM module. Every `get_mol()` call must be paired with `delete()`.

**WASM loading strategy:**
Turbopack (Next.js 16's default dev bundler) cannot serve `.wasm` files from `node_modules` at runtime. The standard `import("@rdkit/rdkit")` path triggers `WebAssembly.compileStreaming()` which fails because the `.wasm` URL returns a non-200 status.

Solution: copy `RDKit_minimal.js` and `RDKit_minimal.wasm` from `node_modules/@rdkit/rdkit/dist/` to `public/`. These are served as static assets at `/RDKit_minimal.js` and `/RDKit_minimal.wasm`. The module is loaded via a dynamically injected `<script>` tag, bypassing the bundler entirely. The `locateFile` callback tells the Emscripten loader where to find the binary.

### Python RDKit — 3D Coordinate Generation (`rdkit-pypi`)

**What it is:** The full Python distribution of RDKit, providing 3D conformer generation capabilities that the JavaScript WASM version does not have.

**Why it runs server-side:**
RDKit.js does **not** expose `EmbedMolecule`, `EmbedMultipleConfs`, or any force field optimization functions. 3D coordinate generation requires the full C++ RDKit library, which is only available in Python.

**Key APIs used:**
- `Chem.MolFromSmiles(smiles)` — parse SMILES to molecular graph
- `Chem.AddHs(mol)` — add explicit hydrogen atoms (MACE needs every atom)
- `AllChem.ETKDGv3()` — create embedding parameters with experimental torsion knowledge
- `AllChem.EmbedMultipleConfs(mol, numConfs, params)` — generate multiple 3D conformers
- `AllChem.MMFFOptimizeMoleculeConfs(mol)` — optimize all conformers with MMFF94
- `AllChem.UFFOptimizeMoleculeConfs(mol)` — UFF fallback
- `mol.GetConformer(confId)` — get coordinates for a specific conformer
- `rdMolDescriptors.CalcMolFormula(mol)` — compute molecular formula
- `Descriptors.ExactMolWt(mol)` — compute exact molecular weight

---

## 6. File-by-File Implementation

### `components/calculate/molecule-sketcher.tsx`

The main React component. 359 lines. Responsibilities:

| Responsibility | Implementation |
|---|---|
| **JSME loading** | Dynamic `import("@loschmidt/jsme-react")`, stored in state. Renders a loading spinner until ready. |
| **JSME sizing** | `ResizeObserver` measures container width; passes integer pixel `width` and `height` to JSME. Height fixed at 480px. |
| **RDKit WASM loading** | Injects `<script src="/RDKit_minimal.js">` into `<head>`, calls `window.initRDKitModule({ locateFile })`. Shows "Initializing RDKit..." until ready. |
| **SMILES validation** | Debounced (300ms) via `useRef` timeout. Calls `rdkitModule.get_mol(smiles)` → `is_valid()` → `get_descriptors()` → `get_svg()`. Always calls `mol.delete()` in a `finally` block. |
| **Element checking** | Extracts element symbols from the molecular formula via regex, checks against `MACE_OFF_ELEMENTS` set. Shows amber warning for unsupported elements. |
| **3D generation** | `POST /api/smiles-to-xyz` with `{ smiles }`. On success, creates `new File([data.xyz], "sketched-molecule.xyz")` and calls `onFileGenerated(file)`. |
| **UI layout** | Single-column stacked: editor → info bar (SVG + descriptors + SMILES) → warnings → button. Designed for full-width rendering. |

**State variables:**

| State | Type | Purpose |
|-------|------|---------|
| `smiles` | `string` | Current SMILES from JSME `onChange` |
| `svgPreview` | `string \| null` | 2D SVG from RDKit.js |
| `descriptors` | `{ formula, mw, numAtoms } \| null` | Molecular properties |
| `validationError` | `string \| null` | Element check or invalid SMILES message |
| `isGenerating` | `boolean` | Loading state during `/api/smiles-to-xyz` call |
| `generationError` | `string \| null` | Error from 3D generation |
| `rdkitModule` | `RDKitModule \| null` | Loaded WASM module instance |
| `rdkitLoading` | `boolean` | True while WASM is loading |
| `JsmeComponent` | `ComponentType \| null` | Lazily loaded JSME React component |
| `editorSize` | `{ w, h } \| null` | Measured container dimensions for JSME |

### `app/api/smiles-to-xyz/route.ts`

Next.js API route. 105 lines. Follows the exact subprocess pattern from `app/api/calculate/route.ts`:

1. Parse JSON body, validate `smiles` is a non-empty string
2. Call `python3 mace-api/smiles_to_xyz.py <smiles>` via `execFileAsync` (promisified `child_process.execFile`)
3. 30-second timeout, 10 MB stdout buffer, `PYTHONUNBUFFERED=1`
4. Uses `execFile` (not `exec`) — passes SMILES as a CLI argument, not through a shell. No injection risk.
5. Parse JSON from stdout starting at the first `{` character (skips any non-JSON preamble from Python imports)
6. On Python error: extract error message from stdout JSON or stderr tail
7. Return appropriate HTTP status: 400 for missing input, 422 for validation errors, 500 for server errors

### `mace-api/smiles_to_xyz.py`

Standalone Python script. 194 lines. Called via subprocess by the API route.

**`smiles_to_xyz(smiles: str) -> dict`** — the core function:
1. Validate input (empty, invalid SMILES, unsupported elements)
2. `Chem.AddHs(mol)` — MACE needs explicit hydrogens
3. Determine conformer count from atom count via `_num_conformers()`
4. `EmbedMultipleConfs` with ETKDGv3, `randomSeed=42`, `pruneRmsThresh=0.5`
5. If embedding fails: retry with `useRandomCoords=True`
6. `MMFFOptimizeMoleculeConfs` → if MMFF fails, `UFFOptimizeMoleculeConfs` → if UFF fails, use unoptimized
7. Select lowest-energy conformer
8. Build XYZ text with comment line containing formula and canonical SMILES
9. Return JSON with `xyz`, `atomCount`, `formula`, `smiles`, `molecularWeight`, `numConformersGenerated`, `conformerEnergy_kcal`

### `app/calculate/page.tsx` — Modified (additive changes only)

Three additions:

1. **Dynamic import** of `MoleculeSketcher` with `ssr: false` (JSME and RDKit WASM cannot run server-side):

```typescript
const MoleculeSketcher = dynamic(
  () => import("@/components/calculate/molecule-sketcher").then(m => ({ default: m.MoleculeSketcher })),
  { ssr: false, loading: () => <div>Loading molecule editor...</div> }
);
```

2. **Input mode toggle** — `const [inputMode, setInputMode] = useState<"upload" | "draw">("upload")` — renders `[Upload File | Draw Molecule]` buttons above the left panel. When "draw" is active, `MoleculeSketcher` renders at full width above the 4/8 grid.

3. **`handleSketchedMolecule` callback** — receives the `File` from the sketcher, sets it as the uploaded file, and auto-selects MACE-OFF:

```typescript
const handleSketchedMolecule = useCallback((file: File) => {
  setUploadedFiles([file]);
  setParams(prev => ({ ...prev, modelType: "MACE-OFF" }));
}, []);
```

### `next.config.ts` — Modified

Added `fs: false` and `path: false` in both Turbopack `resolveAlias` and Webpack `resolve.fallback`. RDKit's WASM loader references these Node built-ins in code paths that never execute in the browser, but the bundler still tries to resolve them.

### `lib/empty-module.js`

A 7-line file exporting an empty object. Used by Turbopack's `resolveAlias` to stub out `fs` and `path` imports for browser builds.

### `.npmrc`

Contains `legacy-peer-deps=true`. Required because `@loschmidt/jsme-react` declares `peerDependencies: { "@types/react": "17 - 18" }` which conflicts with React 19. Without this, `npm install` fails on Vercel.

### `public/RDKit_minimal.js` and `public/RDKit_minimal.wasm`

Copied from `node_modules/@rdkit/rdkit/dist/`. Served as static files at `/RDKit_minimal.js` (125 KB) and `/RDKit_minimal.wasm` (6.6 MB). The WASM binary is cached by the browser after first load.

---

## 7. Integration with the Existing Calculator

The sketcher was designed to be **zero-impact** on the existing codebase. The integration point is a single `File` object:

```
Sketcher output:  new File([xyzText], "sketched-molecule.xyz", { type: "text/plain" })
Upload output:    event.target.files[0]   // a File from <input type="file">
Catalog output:   new File([xyzString], "structure.xyz", { type: "text/plain" })
```

All three produce a `File`. The rest of the application — `handleCalculate()`, `POST /api/calculate`, `calculate_local.py`, `MetricsDashboard`, `MoleculeViewer3D`, `TrajectoryViewer`, `pdf-report.tsx` — consumes files identically regardless of origin.

**Files NOT modified:**
`file-upload-section.tsx`, `parameter-panel.tsx`, `metrics-dashboard.tsx`, `molecule-viewer-3d.tsx`, `trajectory-viewer.tsx`, `app/api/calculate/route.ts`, `calculate_local.py` (existing logic), `types/mace.ts`.

---

## 8. Problems Encountered and Solutions

### Problem 1: WASM streaming compile failed

**Error:** `TypeError: Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok`

**Cause:** `import("@rdkit/rdkit")` goes through Turbopack, which tries to bundle the `.wasm` file. Turbopack can't serve binary assets from `node_modules` at a URL the browser can fetch.

**Solution:** Copy `.wasm` and `.js` to `public/`, load via `<script>` tag injection instead of ES module import, use `locateFile` callback to point at the static asset.

### Problem 2: JSME renders blank

**Error:** White box with no editor controls.

**Cause:** JSME's internal Java applet creates a canvas with `new JSApplet.JSME(id, width, height)`. When passed `width="100%"`, the wrapper converts it to `"100%px"` — an invalid CSS value. JSME needs integer pixel dimensions.

**Solution:** Added `ResizeObserver` to measure the container's actual pixel width, pass measured integers to JSME. The editor only renders after measurement completes.

### Problem 3: `Descriptors.MolecularFormula` not found

**Error:** `module 'rdkit.Chem.Descriptors' has no attribute 'MolecularFormula'`

**Cause:** In Python RDKit, the molecular formula function is `rdMolDescriptors.CalcMolFormula()`, not `Descriptors.MolecularFormula`.

**Solution:** Import `rdMolDescriptors` and use `rdMolDescriptors.CalcMolFormula(mol)`.

### Problem 4: PyTorch 2.6+ `torch.load` error

**Error:** `WeightsUnpickler error: Unsupported global: mace.modules.models.ScaleShiftMACE`

**Cause:** PyTorch 2.6 changed `torch.load` to default to `weights_only=True`. MACE model checkpoints contain serialized custom classes that require full unpickling.

**Solution:** Monkey-patch `torch.load` in `calculate_local.py` and `main.py` before any MACE import:

```python
import torch
_original = torch.load
def _patched(*args, **kwargs):
    if "weights_only" not in kwargs:
        kwargs["weights_only"] = False
    return _original(*args, **kwargs)
torch.load = _patched
```

### Problem 5: Vercel build fails with peer dependency conflict

**Error:** `ERESOLVE: peer @types/react@"17 - 18" from @loschmidt/jsme-react`

**Cause:** JSME React wrapper declares a peer dependency on React 17/18 types. This project uses React 19. Locally we used `npm install --legacy-peer-deps`, but Vercel's `npm install` uses strict resolution.

**Solution:** Added `.npmrc` with `legacy-peer-deps=true` at project root. This applies to all `npm install` runs, including Vercel's build step.

### Problem 6: Single conformer produces suboptimal 3D geometry

**Concern:** The original code called `EmbedMolecule` (single conformer). For flexible molecules, this can land in a local minimum with strained torsion angles, producing high forces when MACE evaluates it.

**Solution:** Switched to `EmbedMultipleConfs` (up to 50 conformers), optimize each with `MMFFOptimizeMoleculeConfs`, select the lowest-energy one. This is the standard approach in computational chemistry for conformer search (Riniker & Landrum, J. Chem. Inf. Model., 2015).

---

## 9. Scientific Validation

Tested the full pipeline (SMILES → XYZ → MACE-OFF single-point) against known molecules:

| Molecule | SMILES | Atoms | MACE-OFF Energy (eV) | RMS Force (eV/A) | Conformers |
|----------|--------|-------|---------------------|-------------------|------------|
| Water | `O` | 3 | -2,081.12 | 0.56 | 1 |
| Methane | `C` | 5 | -1,103.06 | 0.17 | 1 |
| Ethanol | `CCO` | 9 | -4,221.57 | 0.37 | 1 |
| Benzene | `c1ccccc1` | 12 | -6,324.12 | 0.19 | 1 |
| Aspirin | `CC(=O)Oc1ccccc1C(=O)O` | 21 | -17,664.21 | 0.89 | 2 |
| Caffeine | `Cn1c(=O)c2c(ncn2C)n(C)c1=O` | 24 | — | — | 1 |
| Ibuprofen | `CC(C)Cc1ccc(cc1)C(C)C(=O)O` | 33 | — | — | 7 |

**Energy scale:** MACE-OFF reports total electronic energies at the ωB97M-D3BJ/def2-TZVPPD level of theory. The large absolute values (thousands of eV) include all-electron atomic contributions. Isolated atom energies: H = -13.57 eV (≈ -0.5 Hartree), O = -2,043.93 eV (≈ -75.1 Hartree).

**Geometry optimization test (aspirin):**
- Single-point energy: -17,664.21 eV, RMS force: 0.89 eV/A
- After BFGS optimization: -17,664.38 eV, RMS force: 0.027 eV/A
- Energy decreased (optimizer went downhill) ✓
- Forces below threshold (0.05 eV/A) ✓

**Edge case validation:**
- Invalid SMILES (`"XYZ123"`) → rejected with clear error ✓
- Unsupported elements (`"[Si](C)(C)(C)C"`, `"[Fe]"`) → rejected with element list ✓
- Empty string → rejected ✓
- Metals and ions → rejected ✓

---

## 10. Dependencies Added

### Python (mace-api/requirements.txt)

| Package | Version | Purpose |
|---------|---------|---------|
| `rdkit-pypi` | ≥ 2023.9.1 | 3D coordinate generation, conformer search, MMFF94 optimization |

### npm (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `@loschmidt/jsme-react` | ^1.0.2 | JSME molecule sketcher React wrapper |
| `@rdkit/rdkit` | ^2025.3.4 | Client-side SMILES validation, 2D SVG rendering, descriptors (WASM) |

### Static assets (public/)

| File | Size | Purpose |
|------|------|---------|
| `RDKit_minimal.js` | 125 KB | Emscripten JS loader for RDKit WASM |
| `RDKit_minimal.wasm` | 6.6 MB | Compiled RDKit C++ cheminformatics library |

### Configuration files

| File | Purpose |
|------|---------|
| `.npmrc` | `legacy-peer-deps=true` — resolves React 19 vs JSME React 17/18 peer dep conflict |
| `lib/empty-module.js` | Stub for `fs`/`path` Node built-ins in browser builds |
