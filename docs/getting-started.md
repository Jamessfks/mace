# Getting Started

## Prerequisites

- **Node.js** 18+ (for the frontend)
- **Python** 3.10+ (for the MACE backend)
- ~2 GB disk space for model downloads (cached after first use)

## Installation

```bash
git clone https://github.com/Jamessfks/mace.git && cd mace
npm install                    # frontend dependencies
pip install mace-torch ase     # backend (MACE + ASE)
```

## Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first calculation takes ~30 seconds while models download; subsequent runs are fast.

## Try the guided demo

Visit `http://localhost:3000/calculate?demo=true` — it loads an ethanol molecule and walks you through the interface.

## Verify your installation

Run the automated scientific validation suite:

```bash
python mace-api/validate_calculation.py --test
```

This runs 5 tests:

| Test | What it checks |
|------|----------------|
| MACE-MP-0 Si bulk | Energy/atom in correct range (-5.37 eV), equilibrium forces near zero |
| MACE-OFF H2O | Energy computed, force conservation (net force = 0) |
| Ethanol geometry opt | Energy decreases during optimization, converges within step limit |
| Force conservation | Newton's 3rd law: sum of forces on isolated molecule equals zero |
| Result validation | Physical bounds (energy, forces, distances, volume) all pass |

All 5 must pass for a correct installation.

## Using the hosted version

If you don't want to install anything, use the live version at [mace-lake.vercel.app](https://mace-lake.vercel.app). Calculations run on a remote backend — no local Python needed.
