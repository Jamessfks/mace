# MACE Link — Sharing Results

Every calculation can be shared as a permanent URL.

## How it works

1. Run a calculation
2. Click **Share Result**
3. Get a link like `mace-lake.vercel.app/r/gK7tabOE`

Anyone with the link can view the full result dashboard — 3D viewer, metrics, charts, export options — without logging in.

## Storage

Results are stored in Supabase (PostgreSQL) with row-level security:

- **Anyone can read** — shared results are public
- **Anyone can insert** — no account required to share
- **No edit or delete** — once created, results are immutable

This immutability ensures citation stability — a shared link always shows the same result.

## What's included in a shared result

- Full calculation result (energy, forces, positions, symbols, lattice)
- Calculation parameters (model, type, settings)
- Original filename
- Creation timestamp
- Interactive 3D viewer and charts (rendered client-side from the stored data)
