#!/usr/bin/env python3
"""
Generate a surface slab from a bulk structure using ASE.

Usage:
  python generate_surface.py '<json_args>'

JSON args:
  {
    "xyzData": "...",         # Extended-XYZ string of the bulk structure
    "h": 1, "k": 0, "l": 0,  # Miller indices
    "slabThickness": 12,      # Slab thickness in Angstroms
    "vacuumThickness": 15     # Vacuum thickness in Angstroms
  }

Prints JSON to stdout: { "status": "success", "xyzData": "..." }
"""

import json
import sys
import os
import warnings
import io

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import logging
logging.disable(logging.CRITICAL)


def generate_surface(args: dict) -> dict:
    from ase.io import read, write
    from ase.build import surface
    import numpy as np

    xyz_data = args.get("xyzData", "")
    h = int(args.get("h", 1))
    k = int(args.get("k", 0))
    l = int(args.get("l", 0))
    slab_thickness = float(args.get("slabThickness", 12))
    vacuum_thickness = float(args.get("vacuumThickness", 15))

    if h == 0 and k == 0 and l == 0:
        return {"status": "error", "message": "Miller indices (0,0,0) are invalid."}

    # Write XYZ to a temporary string buffer and read with ASE
    from tempfile import NamedTemporaryFile

    with NamedTemporaryFile(mode='w', suffix='.xyz', delete=False) as f:
        f.write(xyz_data)
        tmp_path = f.name

    try:
        atoms = read(tmp_path, format='extxyz')
    finally:
        os.unlink(tmp_path)

    # Estimate number of layers from slab thickness
    # Use c-axis length as reference for layer spacing
    cell = atoms.get_cell()
    c_length = np.linalg.norm(cell[2])
    if c_length < 0.1:
        c_length = np.linalg.norm(cell[0])
    n_layers = max(2, int(round(slab_thickness / (c_length / 2))))

    # Build surface slab
    slab = surface(atoms, (h, k, l), layers=n_layers, vacuum=vacuum_thickness / 2)

    # Write to XYZ string
    buf = io.StringIO()
    write(buf, slab, format='extxyz')
    xyz_out = buf.getvalue()

    return {
        "status": "success",
        "xyzData": xyz_out,
        "atomCount": len(slab),
        "message": f"({h}{k}{l}) surface with {n_layers} layers, {len(slab)} atoms",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Usage: python generate_surface.py '<json>'"}))
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "message": "Invalid JSON argument"}))
        sys.exit(1)

    try:
        result = generate_surface(args)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
