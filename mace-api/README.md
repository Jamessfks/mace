# MACE Python API

FastAPI backend for running MACE calculations and SMILES-to-3D conversion.

## Setup

```bash
cd mace-api
pip install -r requirements.txt
```

## Run Locally

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API runs at `http://localhost:8000`

## Endpoints

### POST /calculate

Run MACE calculation on uploaded structure file(s).

**Request:** multipart/form-data
- `files`: structure file(s) — .xyz, .cif, .poscar, .pdb
- `params`: JSON string with modelType, modelSize, calculationType, device, etc.

**Response:** JSON with energy, forces, positions, symbols, trajectory (for MD)

### GET /health

Health check.

## Scripts

### `calculate_local.py`

Standalone MACE calculation — called by Next.js via subprocess when no `MACE_API_URL` is set.

```bash
python calculate_local.py <structure_file> [params_json] [--model-path <path>]
```

### `smiles_to_xyz.py`

Converts a SMILES string to a 3D XYZ file for the Sketch-a-Molecule feature. Uses multi-conformer generation with energy-ranked selection for the best starting geometry.

```bash
python smiles_to_xyz.py "CC(=O)Oc1ccccc1C(=O)O"   # aspirin
```

**How it works:**
1. Parse SMILES and validate elements against MACE-OFF's supported set (H, C, N, O, F, P, S, Cl, Br, I)
2. Generate up to 50 conformers via ETKDGv3 distance geometry
3. Optimize each with MMFF94 force field (UFF fallback)
4. Select the lowest-energy conformer
5. Output XYZ text as JSON to stdout

**Output:** `{"status": "success", "xyz": "...", "atomCount": 21, "formula": "C9H8O4", "smiles": "...", "molecularWeight": 180.04, "numConformersGenerated": 30, "conformerEnergy_kcal": 18.91}`

### `generate_surface.py`

ASE surface slab generator for Miller index surfaces.

## Models

- **MACE-MP-0** — materials (89 elements)
- **MACE-OFF** — organic molecules (H, C, N, O, F, P, S, Cl, Br, I)

Models download and cache automatically on first use.

## Deployment

```bash
# Railway
railway init && railway up

# Render
# Set start command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `MACE_API_URL` in the Next.js frontend to point to your deployed API.
