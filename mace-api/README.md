# MACE Python API

FastAPI backend for running MACE calculations on atomic structures.

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
- `params`: JSON string with modelType, device, etc.

**Response:** JSON with energy, forces, positions, symbols

### GET /health

Health check.

### GET /

API info.

## Model Paths

Uses MACE models from `../CS2535/` if present:
- `water_1k_small.model`
- `water_1k_small_stagetwo.model`
- `water_1k_small_compiled.model`

If no MACE model found, falls back to ASE EMT calculator (for testing).

## Deployment

Deploy to Railway, Render, or any Python hosting:

```bash
# Railway
railway init
railway up

# Render: use render.yaml or dashboard
# Set start command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `MACE_API_URL` in Next.js to point to your deployed API.
