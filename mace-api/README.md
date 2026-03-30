---
title: MACE API
emoji: ⚛️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# MACE Calculation API (v1.2.0)

FastAPI backend for running MACE machine learning interatomic potential calculations and surface slab generation. Deployed on Hugging Face Spaces with Docker.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/calculate` | Run MACE calculation (single-point, geometry-opt, or MD) |
| `POST` | `/generate-surface` | Generate surface slab from bulk structure (Miller indices) |
| `GET` | `/health` | Health check |
| `GET` | `/` | API info and endpoint listing |

### `POST /calculate`

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `files` | File[] | Structure file(s): `.xyz`, `.cif`, `.poscar`/`.vasp`, `.pdb` |
| `params` | string (JSON) | Calculation parameters (see below) |

**Params JSON:**

```json
{
  "modelType": "MACE-MP-0",
  "modelSize": "medium",
  "precision": "float32",
  "device": "cpu",
  "calculationType": "single-point",
  "dispersion": false,
  "forceThreshold": 0.05,
  "maxOptSteps": 500,
  "temperature": 300,
  "timeStep": 1.0,
  "friction": 0.005,
  "mdSteps": 100,
  "mdEnsemble": "NVT",
  "pressure": 0
}
```

**Response (success):**

```json
{
  "status": "success",
  "energy": -10.738,
  "forces": [[0.0, 0.0, 0.0], ...],
  "positions": [[0.0, 0.0, 0.0], ...],
  "symbols": ["Si", "Si"],
  "lattice": [[5.43, 0, 0], [0, 5.43, 0], [0, 0, 5.43]],
  "properties": { "volume": 160.1 },
  "message": "Calculation completed for structure.xyz using MACE",
  "trajectory": null
}
```

For MD calculations, the response includes a `trajectory` field:

```json
{
  "trajectory": {
    "energies": [-10.7, -10.6, ...],
    "positions": [[[0,0,0], ...], ...],
    "step": [0, 1, 2, ...]
  }
}
```

### `POST /generate-surface`

**Content-Type:** `application/json`

```json
{
  "xyzData": "2\nLattice=\"5.43 0 0 0 5.43 0 0 0 5.43\" ...\nSi 0.0 0.0 0.0\nSi 1.36 1.36 1.36",
  "h": 1, "k": 1, "l": 1,
  "slabThickness": 12.0,
  "vacuumThickness": 15.0
}
```

**Response:**

```json
{
  "status": "success",
  "xyzData": "...",
  "atomCount": 24,
  "message": "(111) surface with 4 layers, 24 atoms"
}
```

---

## Models

| Model | Best For | Elements | Training Data |
|-------|----------|----------|---------------|
| **MACE-MP-0** | Materials, crystals, surfaces | 89 elements | Materials Project DFT (PBE+U) |
| **MACE-OFF** | Organic molecules | H, C, N, O, F, P, S, Cl, Br, I | wB97M-D3BJ coupled-cluster |

Models download and cache automatically on first use (~30s initial download).

**Important:** MACE-OFF already includes dispersion in its training data. Do not enable D3 dispersion correction with MACE-OFF (double-counting).

---

## Local Development

```bash
cd mace-api
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 7860
```

### Standalone Scripts

**calculate_local.py** — called by Next.js via subprocess when no `MACE_API_URL` is set:

```bash
python calculate_local.py <structure_file> [params_json] [--model-path <path>]

# Examples:
python calculate_local.py ethanol.xyz '{"calculationType":"single-point","modelType":"MACE-OFF","modelSize":"small"}'
python calculate_local.py bulk_si.xyz '{"calculationType":"geometry-opt","modelType":"MACE-MP-0","forceThreshold":0.01}'
python calculate_local.py custom_struct.xyz '{"modelType":"custom"}' --model-path my_model.model
```

**generate_surface.py** — ASE surface slab generator:

```bash
python generate_surface.py '{"xyzData":"...","h":1,"k":1,"l":0,"slabThickness":12,"vacuumThickness":15}'
```

**validate_calculation.py** — scientific result validation:

```bash
python validate_calculation.py --test              # Run full verification suite
python validate_calculation.py '<result_json>'     # Validate a single result
python validate_calculation.py result.json         # Validate from file
```

---

## Units

| Quantity | Unit | Notes |
|----------|------|-------|
| Energy | eV | Total potential energy |
| Forces | eV/Angstrom | Per-atom, 3 components |
| Positions | Angstrom | Cartesian coordinates |
| Lattice | Angstrom | 3x3 matrix (periodic systems) |
| Volume | Angstrom^3 | Periodic systems only |
| Temperature | K | MD input parameter |
| Time step | fs | MD input, converted via `ase.units.fs` |
| Pressure | GPa | User input, converted to bar internally (x10,000) |

---

## Deployment (Hugging Face Spaces)

1. Create a new Space on huggingface.co (SDK: Docker)
2. Push the `mace-api/` folder contents to the Space repo
3. The Space builds the Docker image and starts the API on port 7860
4. Set `MACE_API_URL` in the Vercel frontend to `https://<username>-<space-name>.hf.space`

### Requirements

- Python 3.10+
- PyTorch 2.0+ (2.6+ supported with patched `torch.load`)
- mace-torch >= 0.3.0
- ASE >= 3.22.0
