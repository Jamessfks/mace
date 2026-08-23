#!/usr/bin/env python3
"""
Scientific tests for reaction_paths.py.

These are NOT smoke tests. Each one compares a computed number against a value
measured in a laboratory, and prints the deviation whether or not it passes.
Tolerances are set from what the physics justifies, never tuned to make a run
go green — a MACE torsion barrier that misses experiment by 30% is a fact worth
printing, not a test to soften.

Run:  python3 mace-api/test_reaction_paths.py
"""
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
sys.path.insert(0, str(Path(__file__).parent))

import model_catalog          # noqa: E402
import reaction_paths as rp   # noqa: E402

# ── Reference values ────────────────────────────────────────────────────────
# Ethane internal rotation barrier. The modern consensus experimental value is
# 2.90 kcal/mol (12.13 kJ/mol), from far-IR torsional spectroscopy:
#   Weiss & Leroi, J. Chem. Phys. 48, 962 (1968)  -> 2.928 kcal/mol
#   Hirota et al., J. Chem. Phys. 71, 1183 (1979) -> 2.875 kcal/mol
# It is a genuinely small number (~0.126 eV), which makes it a demanding test
# of a potential: the whole barrier is smaller than the error bar people happily
# accept on an atomisation energy.
ETHANE_BARRIER_KCAL = 2.90
ETHANE_BARRIER_EV = ETHANE_BARRIER_KCAL * 0.0433641

# Tolerance rationale: MACE-OFF23 is trained on wB97M-D3(BJ), which reproduces
# torsional barriers of simple alkanes to roughly 0.1-0.2 kcal/mol. Allowing
# 0.5 kcal/mol (~17%) gives room for the training-set transfer error and for
# the fact that our scan is relaxed rather than rigid, while still failing
# loudly if the model has the physics wrong. It is deliberately not so wide
# that a broken constraint could slip through.
ETHANE_TOL_KCAL = 0.5

EV_TO_KCAL = 23.0605


def _fail(msg):
    print(f"  FAIL  {msg}")
    return 1


def _ok(msg):
    print(f"  ok    {msg}")
    return 0


def build_ethane():
    """Staggered ethane from RDKit, MMFF-cleaned, then relaxed with MACE."""
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from ase import Atoms

    mol = Chem.AddHs(Chem.MolFromSmiles("CC"))
    AllChem.EmbedMolecule(mol, randomSeed=42)
    AllChem.MMFFOptimizeMolecule(mol)
    conf = mol.GetConformer()
    syms = [a.GetSymbol() for a in mol.GetAtoms()]
    pos = [list(conf.GetAtomPosition(i)) for i in range(mol.GetNumAtoms())]
    return Atoms(symbols=syms, positions=pos)


def dihedral_indices(atoms):
    """Return (H, C, C, H) indices defining the torsion."""
    from ase.neighborlist import natural_cutoffs, NeighborList
    nl = NeighborList(natural_cutoffs(atoms), self_interaction=False, bothways=True)
    nl.update(atoms)
    carbons = [i for i, s in enumerate(atoms.get_chemical_symbols()) if s == "C"]
    c1, c2 = carbons
    h1 = [j for j in nl.get_neighbors(c1)[0] if atoms[j].symbol == "H"][0]
    h2 = [j for j in nl.get_neighbors(c2)[0] if atoms[j].symbol == "H"][0]
    return int(h1), int(c1), int(c2), int(h2)


def test_ethane_torsion():
    """Relaxed H-C-C-H scan through a full 120 deg period of ethane."""
    print("\nethane C-C torsion barrier  (MACE-OFF23 small, relaxed scan)")
    from ase.optimize import BFGS

    atoms = build_ethane()
    entry = model_catalog.resolve_model("MACE-OFF23", "small")
    atoms.calc = model_catalog.build_calculator(entry, device="cpu", precision="float64")

    # Relax first. A barrier read off an unrelaxed structure is a barrier plus
    # whatever strain the initial guess happened to carry.
    opt = BFGS(atoms, logfile=None)
    converged = opt.run(fmax=0.01, steps=300)
    if not converged:
        return _fail("reactant did not reach fmax < 0.01 eV/A; barrier would be meaningless")
    print(f"  relaxed to fmax = {max((f @ f) ** 0.5 for f in atoms.get_forces()):.4f} eV/A")

    i, j, k, l = dihedral_indices(atoms)
    phi0 = atoms.get_dihedral(i, j, k, l)
    print(f"  torsion atoms {i}-{j}-{k}-{l}, starting at {phi0:.1f} deg")

    t0 = time.time()
    res = rp.run_coordinate_scan(atoms, {
        "scanCoordinate": "dihedral",
        "scanIndices": [i, j, k, l],
        "scanStart": phi0,
        "scanEnd": phi0 + 120.0,   # one full period: staggered -> eclipsed -> staggered
        "scanPoints": 13,
        "forceThreshold": 0.01,
    })
    elapsed = time.time() - t0

    scan = res["scan"]
    energies = scan["barrierEv"] and res["profile"]["yAbsolute"]
    barrier_ev = scan["barrierEv"]
    barrier_kcal = scan["barrierKcalPerMol"]
    dev = barrier_kcal - ETHANE_BARRIER_KCAL

    print(f"  {len(energies)} points in {elapsed:.1f}s "
          f"({elapsed / len(energies):.1f}s/point)")
    print(f"  barrier   = {barrier_ev:.4f} eV = {barrier_kcal:.3f} kcal/mol")
    print(f"  experiment= {ETHANE_BARRIER_EV:.4f} eV = {ETHANE_BARRIER_KCAL:.3f} kcal/mol")
    print(f"  deviation = {dev:+.3f} kcal/mol ({100 * dev / ETHANE_BARRIER_KCAL:+.1f}%)")

    fails = 0
    if abs(dev) > ETHANE_TOL_KCAL:
        fails += _fail(f"barrier off by {abs(dev):.3f} kcal/mol, tolerance {ETHANE_TOL_KCAL}")
    else:
        fails += _ok(f"within {ETHANE_TOL_KCAL} kcal/mol of experiment")

    # The scan must be periodic: a 120 deg sweep of ethane starts and ends in
    # equivalent staggered wells. If the constraint slipped, or the relaxation
    # fell into a different branch, this is where it shows.
    end_gap = abs(energies[-1] - energies[0]) * EV_TO_KCAL
    print(f"  periodicity |E(end)-E(start)| = {end_gap:.4f} kcal/mol")
    if end_gap > 0.10:
        fails += _fail("scan is not periodic over 120 deg — constraint may have slipped")
    else:
        fails += _ok("scan closes on itself (constraint held)")

    # The constraint must actually have been applied at every point.
    devs = [abs(d) for d in scan.get("deviations", []) if d is not None]
    if devs:
        print(f"  max coordinate deviation = {max(devs):.4f}")
        if max(devs) > scan["deviationTolerance"]:
            fails += _fail("requested torsion was not held at every grid point")
        else:
            fails += _ok("torsion held at every grid point")
    return fails


def test_refusals():
    """The guards that protect a shared, sign-in-free server."""
    print("\nrefusals")
    fails = 0
    atoms = build_ethane()
    entry = model_catalog.resolve_model("MACE-OFF23", "small")
    atoms.calc = model_catalog.build_calculator(entry, device="cpu", precision="float64")

    try:
        rp.run_reaction_path("neb", atoms, {})
        fails += _fail("NEB without a product should raise")
    except ValueError as e:
        fails += _ok(f"NEB without product refused: {str(e)[:60]}...")

    try:
        rp.run_reaction_path("coordinate-scan", atoms, {}, product=atoms.copy())
        fails += _fail("scan with a product should raise, not ignore it")
    except ValueError as e:
        fails += _ok(f"scan with stray product refused: {str(e)[:60]}...")

    try:
        rp.run_reaction_path("nonsense", atoms, {})
        fails += _fail("unknown reaction-path type should raise")
    except ValueError:
        fails += _ok("unknown type refused")
    return fails


if __name__ == "__main__":
    total = 0
    total += test_refusals()
    total += test_ethane_torsion()
    print(f"\n{'FAILED' if total else 'PASSED'}: {total} failing check(s)")
    sys.exit(1 if total else 0)
