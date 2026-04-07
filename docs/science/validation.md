# Scientific Validation

## Automated validation suite

Run the full suite:

```bash
python mace-api/validate_calculation.py --test
```

### Tests

| Test | What it checks |
|------|----------------|
| **MACE-MP-0 Si bulk** | Energy/atom ~ -5.37 eV, equilibrium forces near zero |
| **MACE-OFF H2O** | Energy computed, force conservation (net force = 0) |
| **Ethanol geometry opt** | Energy decreases monotonically, converges within step limit |
| **Force conservation** | Newton's 3rd law: sum of forces on isolated molecule equals zero |
| **Result validation** | All physical bounds pass |

### Validating individual results

```bash
# From a JSON string
python mace-api/validate_calculation.py '<result_json>'

# From a file
python mace-api/validate_calculation.py result.json
```

## What the validator checks

### Result validation

- **Energy bounds** (model-aware):
    - MACE-MP-0: -20 to +100 eV/atom
    - MACE-OFF: -800 to +100 eV/atom
- **Force magnitude**: max < 50 eV/A (warning), < 200 eV/A (error)
- **Force conservation**: net force ~ 0 for isolated molecules
- **Interatomic distances**: min > 0.4 A (overlap detection)
- **Lattice**: positive volume, valid 3x3 matrix
- **Trajectory**: no NaN/Inf, bounded energy fluctuation
- **Consistency**: `len(symbols) == len(positions) == len(forces)`

### Parameter validation

- D3 + MACE-OFF double-counting warning
- float32 + phonon precision warning
- Extreme timestep / temperature warnings
- Loose `fmax` warnings

## Manual verification checklist

1. Energy in reasonable range: MACE-MP-0 -> -1 to -15 eV/atom; MACE-OFF -> -100 to -600 eV/atom
2. Forces < 10 eV/A for reasonable structures (> 50 eV/A = overlapping atoms)
3. RMS force decreases monotonically during optimization
4. MD energy conserved in NVE; fluctuates around target T in NVT
5. Lattice vectors form right-handed coordinate system
6. Volume positive for periodic systems
