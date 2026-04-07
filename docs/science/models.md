# MACE Models

## Foundation models

### MACE-MP-0

- **Scope**: Materials, crystals, surfaces, bulk — 89 elements across the periodic table
- **Training data**: Materials Project DFT calculations (PBE+U functional)
- **Accuracy**: PBE-level (~0.1-0.5 eV/atom overbinding relative to experiment)
- **D3 dispersion**: Supported and recommended for vdW systems (layered materials, molecular crystals)
- **Energy reference**: Isolated atom energies. Typical energy/atom range: -1 to -15 eV/atom

### MACE-OFF

- **Scope**: Organic molecules and drug-like compounds
- **Supported elements**: H, C, N, O, F, P, S, Cl, Br, I (10 elements)
- **Training data**: wB97M-D3BJ coupled-cluster quality calculations
- **Accuracy**: Near coupled-cluster quality for organic molecules
- **D3 dispersion**: **Do not enable** — already included in training data. Enabling D3 double-counts the correction
- **Energy reference**: Different convention from MACE-MP-0. Typical energy/atom range: -100 to -600 eV/atom

### Model sizes

Each foundation model comes in three sizes:

| Size | Speed | Accuracy | Use case |
|------|-------|----------|----------|
| **small** | Fastest | Least accurate | Quick screening, large systems |
| **medium** | Balanced | Good | General use (default) |
| **large** | Slowest | Best | Production results, publication |

## Custom models

Upload your own `.model` file trained with mace-torch. The calculator will:

1. Load the model with `MACECalculator`
2. Run the calculation identically to foundation models
3. Optionally compare results against a foundation model with radar charts (MAE, RMSE, R2)

## Choosing a model

```
Is your system organic (only H,C,N,O,F,P,S,Cl,Br,I)?
  ├─ Yes → MACE-OFF
  └─ No  → MACE-MP-0

Do you need van der Waals corrections?
  ├─ MACE-MP-0 → Enable D3 dispersion
  └─ MACE-OFF  → Do nothing (already included)
```
