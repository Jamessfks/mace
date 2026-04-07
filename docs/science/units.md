# Units & Conventions

MACE and ASE use consistent internal units. All values displayed in the web interface use these units directly — no conversions are applied.

## Unit system

| Quantity | Unit | Notes |
|----------|------|-------|
| Energy | eV (electron volts) | |
| Forces | eV/A (eV per Angstrom) | |
| Distances / positions | A (Angstroms) | |
| Stress | eV/A^3 | |
| Temperature | K (Kelvin) | |
| Time | fs (femtoseconds) | Internally converted via `ase.units.fs` |
| Pressure | GPa (user-facing) | 1 GPa = 10,000 bar; internally eV/A^3 |

## Conversion at boundaries

| Boundary | Energy | Forces | Distance | Time | Temperature | Pressure |
|----------|--------|--------|----------|------|-------------|----------|
| User input | - | - | A | fs | K | GPa |
| ASE internal | eV | eV/A | A | ASE units | K | eV/A^3 |
| MACE output | eV | eV/A | A | - | - | - |
| JSON result | eV | eV/A | A | seconds | - | - |
| Frontend display | eV | eV/A | A | seconds | K | GPa |

!!! warning "Critical conversion"
    Pressure from user-facing GPa to ASE internal bar: `pressure_GPa * 1e4 = pressure_bar`

## Common pitfalls

1. **Never mix units** — MACE outputs eV/A, ASE uses eV/A internally, display is eV/A
2. **Reference energies vary** — extended XYZ metadata keys can be `REF_energy`, `ref_energy`, `energy`, or `dft_energy`
3. **Benchmark catalog values are experimental** — not DFT. Comparisons must note this
4. **MACE-MP-0 vs MACE-OFF energy ranges** differ by an order of magnitude due to different reference conventions
