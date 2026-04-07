# Calculator

The calculator is the main interface at [`/calculate`](https://mace-lake.vercel.app/calculate).

## Workflow

1. **Upload a structure** — drag-and-drop a `.xyz`, `.cif`, `.poscar`, or `.pdb` file, or pick one from the built-in ml-peg catalog (14 benchmark structures across 5 categories)
2. **Configure parameters** — select model, calculation type, and physics settings
3. **Run** — click Calculate and wait for results
4. **Explore** — browse the five-tab metrics dashboard (Summary, Forces, Energy, Structure, Raw Data)
5. **Share** — click Share Result to generate a permanent MACE Link

## Structure input

The parser auto-detects format from the file extension and extracts:

- Atom count and element list
- Chemical formula
- Bounding box dimensions
- Lattice vectors (if periodic)
- Reference energies/forces from extended XYZ metadata

!!! warning
    Large structures (>500 atoms) may be slow. Multi-frame files use only the first frame.

## Model selection

| Model | Use for | Elements |
|-------|---------|----------|
| **MACE-MP-0** | Materials, crystals, surfaces, bulk | 89 elements |
| **MACE-OFF** | Organic molecules | H, C, N, O, F, P, S, Cl, Br, I |
| **Custom** | Upload your own `.model` file | Depends on training |

Each model is available in **small** (fastest), **medium** (default), and **large** (most accurate).

## Calculation types

### Single-point energy & forces

Computes the energy and forces at the current geometry. No optimization.

### Geometry optimization

Relaxes atomic positions using the BFGS algorithm until forces are below the threshold (`fmax`).

| Parameter | Default | Recommended |
|-----------|---------|-------------|
| `fmax` | 0.05 eV/A | 0.01 for production, 0.005 before frequency calculations |
| `maxOptSteps` | 500 | Increase for large/difficult systems |

### Molecular dynamics

Runs a trajectory with the selected ensemble:

| Ensemble | Thermostat | Requirements |
|----------|------------|--------------|
| **NVE** | None (microcanonical) | Any system |
| **NVT** | Langevin | Temperature required |
| **NPT** | Nose-Hoover + barostat | Temperature, pressure, and periodic cell required |

Velocities are initialized with Maxwell-Boltzmann distribution at the target temperature.

## D3 Dispersion correction

Adds Grimme's DFT-D3 van der Waals correction on top of MACE-MP-0 predictions. Important for layered materials, molecular adsorption, and molecular crystals.

!!! danger
    **Never enable D3 with MACE-OFF.** MACE-OFF was trained on wB97M-D3BJ data that already includes dispersion. Enabling D3 double-counts the correction.

## Precision

- **float32** — default, fast, sufficient for energies and forces
- **float64** — required for vibrational analysis / Hessian calculations

## Results

The metrics dashboard provides five tabs:

- **Summary** — total energy, energy/atom, max force, RMS force, calculation time
- **Forces** — per-atom force table, force magnitude chart
- **Energy** — energy convergence (optimization) or energy vs. time (MD)
- **Structure** — 3D viewer with force vector overlays
- **Raw Data** — full JSON result for copy/export
