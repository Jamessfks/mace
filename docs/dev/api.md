# API Reference

## POST /api/calculate

Runs a MACE calculation on an uploaded structure.

### Request

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | File | Yes | Structure file (`.xyz`, `.cif`, `.poscar`, `.pdb`) |
| `params` | JSON string | Yes | Calculation parameters (see below) |
| `model` | File | No | Custom `.model` file |

### Calculation parameters

```json
{
  "calculationType": "single-point",
  "modelType": "MACE-MP-0",
  "modelSize": "medium",
  "dispersion": false,
  "precision": "float32",
  "device": "cpu",
  "temperature": 300,
  "pressure": 0,
  "timeStep": 1.0,
  "friction": 0.01,
  "mdSteps": 100,
  "mdEnsemble": "NVT",
  "forceThreshold": 0.05,
  "maxOptSteps": 500
}
```

| Parameter | Values | Notes |
|-----------|--------|-------|
| `calculationType` | `single-point`, `geometry-opt`, `md` | |
| `modelType` | `MACE-MP-0`, `MACE-OFF`, `custom` | |
| `modelSize` | `small`, `medium`, `large` | |
| `dispersion` | `true`, `false` | D3 correction, only for MACE-MP-0 |
| `precision` | `float32`, `float64` | Use float64 for vibrational analysis |
| `device` | `cpu`, `cuda` | Falls back to CPU if CUDA unavailable |
| `mdEnsemble` | `NVE`, `NVT`, `NPT` | NPT requires periodic cell |
| `forceThreshold` | float (eV/A) | For geometry optimization |
| `maxOptSteps` | integer | Max optimization iterations |

### Response

```json
{
  "status": "success",
  "energy": -123.456,
  "forces": [[0.01, -0.02, 0.03], ...],
  "positions": [[0.0, 0.0, 0.0], ...],
  "symbols": ["C", "H", ...],
  "lattice": [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
  "properties": { ... },
  "message": "Calculation completed in 2.3s",
  "timeTaken": 2.3
}
```

### Error response

```json
{
  "error": "MACE-OFF only supports elements: H, C, N, O, F, P, S, Cl, Br, I"
}
```

## POST /api/benchmark

Batch evaluation of multiple model-structure combinations. Same FormData format, but accepts multiple structures and model configurations.

## GET /api/calculate

Returns API status info:

```json
{
  "name": "MACE Calculation API",
  "version": "1.0.0",
  "mode": "local",
  "status": "operational"
}
```

## CLI interface

The Python backend can be used directly:

```bash
python mace-api/calculate_local.py <structure_file> '<params_json>'
```

Example:

```bash
python mace-api/calculate_local.py public/demo/ethanol.xyz \
  '{"calculationType":"single-point","modelType":"MACE-OFF","modelSize":"medium"}'
```

Output is a single JSON object to stdout. Logs and warnings go to stderr.
