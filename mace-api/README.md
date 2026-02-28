---
title: MACE API
emoji: ⚛️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# MACE Calculation API

FastAPI backend for running MACE calculations, SMILES-to-3D conversion, and surface slab generation. Deployed on Hugging Face Spaces with Docker.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/calculate` | Run MACE calculation on uploaded structure file(s) |
| POST | `/smiles-to-xyz` | Convert SMILES string to 3D XYZ coordinates |
| POST | `/generate-surface` | Generate surface slab from bulk structure |
| GET | `/health` | Health check |

## Local Development

```bash
cd mace-api
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 7860
```

## Scripts

### `calculate_local.py`

Standalone MACE calculation — called by Next.js via subprocess when no `MACE_API_URL` is set.

```bash
python calculate_local.py <structure_file> [params_json] [--model-path <path>]
```

### `smiles_to_xyz.py`

Converts a SMILES string to a 3D XYZ file using multi-conformer generation with energy-ranked selection.

```bash
python smiles_to_xyz.py "CC(=O)Oc1ccccc1C(=O)O"   # aspirin
```

### `generate_surface.py`

ASE surface slab generator for Miller index surfaces.

## Models

- **MACE-MP-0** — materials (89 elements)
- **MACE-OFF** — organic molecules (H, C, N, O, F, P, S, Cl, Br, I)

Models download and cache automatically on first use.

## Deployment

This API is deployed as a Docker-based Hugging Face Space.

1. Create a new Space on huggingface.co (SDK: Docker)
2. Push the `mace-api/` folder contents to the Space repo
3. The Space builds the Docker image and starts the API on port 7860
4. Set `MACE_API_URL` in the Vercel frontend to `https://<username>-<space-name>.hf.space`
