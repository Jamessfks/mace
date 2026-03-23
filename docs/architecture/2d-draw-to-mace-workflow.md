# Architecture: 2D Drawing → MACE Calculation Workflow

**Audience:** Engineers extending or debugging the calculator’s “Draw a molecule” path.  
**Companion:** For chemistry (ETKDG, MMFF94, conformer counts) and historical design notes, see [`../SKETCH-A-MOLECULE.md`](../SKETCH-A-MOLECULE.md).

---

## 1. Purpose and scope

This document describes **how a user’s 2D sketch becomes input to a MACE calculation** in this repository:

- **In scope:** Browser sketcher, client validation, SMILES → 3D XYZ conversion, wiring on the calculate page, sharing metadata, and how that ties into the **same** calculation pipeline as file upload.
- **Out of scope (by design):** Changes to the core MACE execution engine beyond “structure arrives as a normal uploaded file.”

**Design invariant:** The draw path must produce a **`File`** (XYZ text) and optional **`SketchMetadata`** so that `/api/calculate`, results UI, 3D viewer, and exports behave **identically** to an uploaded `.xyz` file.

---

## 2. System context (C4-style)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User browser                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────────┐ │
│  │ JSME         │   │ RDKit.js     │   │ React: Calculate page +       │ │
│  │ (2D editor)  │   │ (WASM)       │   │ MoleculeSketcher              │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┬──────────────┘ │
│         │ SMILES           │ validate / SVG            │ File + meta   │
└─────────┼──────────────────┼───────────────────────────┼───────────────┘
          │                  │                           │
          ▼                  ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Next.js app (Node)                                                      │
│  • POST /api/smiles-to-xyz  →  Python subprocess OR remote MACE API      │
│  • POST /api/calculate      →  Python subprocess OR remote MACE API    │
└─────────────────────────────────────────────────────────────────────────┘
          │                                      │
          ▼                                      ▼
┌──────────────────────┐              ┌──────────────────────────────────┐
│  smiles_to_xyz.py    │              │  calculate_local.py / remote     │
│  (RDKit: 3D + XYZ)   │              │  (ASE + MACE)                    │
└──────────────────────┘              └──────────────────────────────────┘
```

---

## 3. Layered architecture

| Layer | Responsibility | Primary artifacts |
|-------|----------------|-------------------|
| **Presentation** | Draw UI, preview, errors, generate action | `components/calculate/molecule-sketcher.tsx`, `app/calculate/page.tsx` |
| **Client validation** | Parse SMILES, 2D SVG, formula/MW, MACE-OFF element gate | RDKit minimal WASM (`public/RDKit_minimal.*`) |
| **Conversion API** | SMILES → JSON + XYZ string; timeouts; remote/local | `app/api/smiles-to-xyz/route.ts` |
| **Conversion service** | RDKit Python: embed, optimize, pick conformer | `mace-api/smiles_to_xyz.py`, `mace-api/main.py` (`POST /smiles-to-xyz`) |
| **Calculation API** | Multipart upload + params → MACE result | `app/api/calculate/route.ts` |
| **Persistence (optional)** | Share link embeds sketch identity | `lib/share.ts`, `app/r/[id]/shared-result-view.tsx` |

---

## 4. End-to-end sequence

The following is the **canonical order of operations** from draw to energy/forces.

```
1. User selects "Draw" on /calculate
2. JSME mounts (client-only); user edits structure
3. JSME onChange(smiles) fires on each edit
4. Parent state: smiles updated immediately
5. Preview state: svgPreview/descriptors cleared on each change (avoid stale 2D vs SMILES)
6. After 300ms debounce: RDKit validates SMILES, optional element check, sets svg + descriptors
7. User clicks "Generate 3D & Load Structure"
8. POST /api/smiles-to-xyz { smiles }
9. Server: RDKit Python produces XYZ + metadata JSON
10. Client: new File([xyz], "sketched-molecule.xyz")
11. Client: SketchMetadata built from API + fresh RDKit SVG from canonical SMILES
12. Page: setUploadedFiles([file]), setSketchMeta(metadata), force modelType → MACE-OFF
13. User runs calculation → POST /api/calculate (same as upload)
14. Optional share: params extended with _sketchMeta for MACE Link
```

---

## 5. Component responsibilities

### 5.1 `MoleculeSketcher` (`components/calculate/molecule-sketcher.tsx`)

| Concern | Behavior |
|---------|----------|
| **JSME** | Lazy-loaded `@loschmidt/jsme-react`; fixed height 480px; width from `ResizeObserver` (JSME requires pixel dimensions). |
| **RDKit WASM** | Loaded via `/RDKit_minimal.js` + `/RDKit_minimal.wasm` in `public/` (bundler-safe). |
| **SMILES sync** | `onChange` updates `smiles` and **clears** preview/descriptor/error state immediately; debounced `validateSmiles` repopulates preview. |
| **MACE-OFF gate** | Elements parsed from molecular formula; compared to `MACE_OFF_ELEMENTS`. |
| **3D generation** | `fetch("/api/smiles-to-xyz")`; on success builds `File` and calls `onFileGenerated`. |
| **Metadata accuracy** | `numAtoms` = `data.atomCount` (total atoms from Python). **SVG for share/sidebar** is regenerated from **canonical** `data.smiles` with RDKit so it always matches the structure sent to the backend (not the possibly stale `svgPreview`). |

**Exported type — `SketchMetadata`:**

| Field | Meaning |
|-------|---------|
| `smiles` | Canonical SMILES (prefer API response). |
| `formula` | Molecular formula string. |
| `mw` | Molecular weight. |
| `numAtoms` | **Total** atom count (including H), from conversion API. |
| `svgHtml` | 2D SVG string for thumbnails (RDKit-rendered from canonical SMILES at generate time). |

### 5.2 Calculate page (`app/calculate/page.tsx`)

| State / behavior | Role |
|------------------|------|
| `inputMode` | `"upload"` \| `"draw"` — toggles file upload vs sketcher. |
| `MoleculeSketcher` | `dynamic(..., { ssr: false })` — JSME and WASM require browser. |
| `handleSketchedMolecule` | Replaces `uploadedFiles` with the sketched `File`, sets `sketchMeta`, sets `modelType` to `"MACE-OFF"`. |
| `sketchMeta` | Shown in sidebar “Sketched Molecule” when draw mode + file present; passed to `saveResult` when sharing. |

### 5.3 SMILES → XYZ route (`app/api/smiles-to-xyz/route.ts`)

| Mode | When | Behavior |
|------|------|----------|
| **Remote** | `MACE_API_URL` env set | `POST {MACE_API_URL}/smiles-to-xyz` with JSON body, 30s abort. |
| **Local** | `MACE_API_URL` unset | `execFile("python3", [scriptPath, smiles])` — **no shell**, SMILES as argv; 30s timeout; parse JSON from stdout (first `{`). |

Errors: `400` missing smiles, `422` conversion/validation failures, `500` infra failures.

### 5.4 Python conversion (`mace-api/smiles_to_xyz.py`)

- Parse → element check vs MACE-OFF set → `AddHs` → `ETKDGv3` + `EmbedMultipleConfs` → MMFF94 (UFF fallback) → lowest-energy conformer → XYZ lines + JSON.
- **Contract:** Success payload includes at minimum `status`, `xyz`, `atomCount`, `formula`, `smiles`, `molecularWeight` (see script docstring).

Hosted duplicate: `mace-api/main.py` exposes the same logic at `POST /smiles-to-xyz` for remote deployments.

### 5.5 Calculation route (`app/api/calculate/route.ts`)

- **Unchanged contract** for draw path: multipart `files` + `params` JSON.
- The sketched molecule is just `sketched-molecule.xyz` bytes in `files[0]`.

---

## 6. Data contracts

### 6.1 `POST /api/smiles-to-xyz`

**Request:**

```json
{ "smiles": "<string>" }
```

**Success (conceptual):**

```json
{
  "status": "success",
  "xyz": "<multi-line XYZ text>",
  "atomCount": 0,
  "formula": "",
  "smiles": "",
  "molecularWeight": 0,
  "numConformersGenerated": 0,
  "conformerEnergy_kcal": null,
  "warning": "optional"
}
```

**Error:**

```json
{ "status": "error", "message": "..." }
```

### 6.2 Sketch + share (`lib/share.ts`)

When the user shares a result that originated from draw mode, `saveResult` stores:

```ts
params: { ...calculationParams, _sketchMeta: SketchMetadata }
```

`_sketchMeta` is **not** part of the core `CalculationParams` type; it is a **UI extension** read by `SharedResultView` to render the “Sketched Molecule” block on `/r/[id]`.

---

## 7. Environment and operations

| Variable | Effect |
|----------|--------|
| `MACE_API_URL` | If set, both `/api/smiles-to-xyz` and `/api/calculate` forward to that base URL (HTTPS added if scheme omitted). |
| Local Python | Requires `python3` on PATH and `mace-api/smiles_to_xyz.py` dependencies (`rdkit-pypi`) for SMILES conversion without remote API. |

---

## 8. Failure modes (architectural)

| Symptom | Likely layer |
|---------|----------------|
| Preview doesn’t match drawing | Client: debounce/stale state (mitigated by clearing preview on each `onChange`). |
| Sidebar/shared SVG wrong molecule | Client: must use canonical SMILES SVG at generate time (see §5.1). |
| “Invalid SMILES” | JSME output vs RDKit parse; or incomplete structure while drawing. |
| Unsupported element | Client formula parse + server element set must stay aligned with MACE-OFF. |
| Conversion timeout | 30s limit in route; very large systems or slow host. |
| Empty JSON from Python | Check stdout/stderr handling in route; RDKit install. |

---

## 9. File index (draw → MACE path)

| Path | Role |
|------|------|
| `components/calculate/molecule-sketcher.tsx` | Draw UI, validation, conversion call, `SketchMetadata` |
| `app/calculate/page.tsx` | Mode toggle, `handleSketchedMolecule`, sketch sidebar |
| `app/api/smiles-to-xyz/route.ts` | Conversion API gateway |
| `mace-api/smiles_to_xyz.py` | RDKit 3D pipeline |
| `mace-api/main.py` | FastAPI `POST /smiles-to-xyz` for hosted API |
| `app/api/calculate/route.ts` | Unified calculation entry |
| `lib/share.ts` | Persists `_sketchMeta` with shared results |
| `app/r/[id]/shared-result-view.tsx` | Renders saved sketch metadata |
| `public/RDKit_minimal.js` / `public/RDKit_minimal.wasm` | RDKit minimal runtime assets |

---

## 10. Related documentation

- [`../SKETCH-A-MOLECULE.md`](../SKETCH-A-MOLECULE.md) — Feature narrative, tool choices, scientific steps, troubleshooting history.
- [`../../README.md`](../../README.md) — Product overview and repo map.

---

*Last updated to reflect: debounced validation with immediate preview clear, canonical-SMILES SVG at generate time, `atomCount`-only total atom metadata.*
