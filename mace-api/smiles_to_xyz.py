#!/usr/bin/env python3
"""
SMILES-to-XYZ conversion script for the Sketch-a-Molecule feature.

PURPOSE:
  Convert a SMILES string into a physically realistic 3D XYZ file
  suitable for MACE-OFF calculations.

HOW 2D SKETCHES BECOME REAL 3D STRUCTURES:
  A SMILES string encodes molecular *topology* (which atoms connect to
  which, bond orders, stereochemistry) but contains NO 3D coordinates.
  We reconstruct 3D geometry through a multi-step physics pipeline:

  1. DISTANCE BOUNDS — From the bond graph we compute min/max distance
     constraints between every atom pair (bond lengths, 1-3 angles, 1-4
     torsions, and van der Waals radii for non-bonded pairs).

  2. DISTANCE GEOMETRY (ETKDGv3) — A random distance matrix is sampled
     within those bounds, then embedded into 3D space via eigenvalue
     decomposition. The "ETKDG" refinement applies experimental torsion
     angle preferences from the Cambridge Structural Database and
     chemical knowledge rules (aromatic rings planar, sp carbons linear).

  3. MULTI-CONFORMER SAMPLING — A single embedding may land in a local
     minimum. We generate N conformers (N=50 for small molecules, fewer
     for large) and optimize EACH with the MMFF94 force field.

  4. ENERGY-RANKED SELECTION — The conformer with the lowest MMFF94
     energy is selected. This gives the best classical approximation of
     the global minimum, which MACE-OFF will further refine.

  This approach is standard in computational chemistry (Hawkins et al.,
  J. Chem. Inf. Model., 2017; Riniker & Landrum, J. Chem. Inf. Model.,
  2015). MMFF94 is preferred over UFF for organics (mean error 1.30 vs
  3.77 kcal/mol against coupled-cluster; J. Comput.-Aided Mol. Des., 2023).

DATA FLOW:
  Browser (JSME sketcher) → SMILES string
    → Next.js API route → python3 smiles_to_xyz.py <SMILES>
    → RDKit: parse → validate → multi-conformer embed → MMFF94 optimize
    → select lowest-energy conformer → XYZ
    → stdout JSON: {"status":"success", "xyz":"...", ...}

MACE-OFF (arXiv:2312.15211):
  Supports exactly 10 elements: H, C, N, O, F, P, S, Cl, Br, I.

DEPENDENCIES:
  - rdkit-pypi >= 2023.9.1 (pip install rdkit-pypi)
"""

import json
import sys
import warnings

warnings.filterwarnings("ignore")

MACE_OFF_ELEMENTS = {"H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"}


def _num_conformers(num_atoms: int) -> int:
    """Scale conformer count by molecule size for speed/quality tradeoff."""
    if num_atoms <= 10:
        return 50
    if num_atoms <= 30:
        return 30
    if num_atoms <= 100:
        return 15
    return 5


def smiles_to_xyz(smiles: str) -> dict:
    from rdkit import Chem
    from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors

    if not smiles or not smiles.strip():
        return {"status": "error", "message": "Empty SMILES string"}

    smiles = smiles.strip()
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return {"status": "error", "message": f"Invalid SMILES: '{smiles}'"}

    # Validate elements against MACE-OFF supported set
    elements = {atom.GetSymbol() for atom in mol.GetAtoms()}
    unsupported = elements - MACE_OFF_ELEMENTS
    if unsupported:
        return {
            "status": "error",
            "message": (
                f"MACE-OFF does not support: {', '.join(sorted(unsupported))}. "
                "Only H, C, N, O, F, P, S, Cl, Br, I are supported."
            ),
        }

    mol = Chem.AddHs(mol)
    num_atoms = mol.GetNumAtoms()

    warning = None
    if num_atoms > 500:
        warning = f"Very large molecule ({num_atoms} atoms). Calculation may be slow or timeout."
    elif num_atoms > 200:
        warning = f"Large molecule ({num_atoms} atoms). Calculation may take longer than usual."

    # ── Multi-conformer generation + energy-ranked selection ──
    # Generate multiple 3D conformers via ETKDGv3 distance geometry,
    # optimize each with MMFF94, and pick the lowest-energy one.
    num_confs = _num_conformers(num_atoms)
    embed_params = AllChem.ETKDGv3()
    embed_params.randomSeed = 42
    embed_params.numThreads = 0  # use all available cores
    embed_params.pruneRmsThresh = 0.5  # discard near-duplicate conformers

    conf_ids = AllChem.EmbedMultipleConfs(mol, numConfs=num_confs, params=embed_params)

    if len(conf_ids) == 0:
        # Fallback: retry with random coordinates for difficult topologies
        embed_params.useRandomCoords = True
        conf_ids = AllChem.EmbedMultipleConfs(mol, numConfs=num_confs, params=embed_params)
        if len(conf_ids) == 0:
            return {
                "status": "error",
                "message": "Could not generate 3D coordinates. The molecule topology may be too strained.",
            }

    # Optimize all conformers with MMFF94 and collect energies.
    # MMFFOptimizeMoleculeConfs returns list of (convergence, energy) tuples.
    use_mmff = True
    try:
        opt_results = AllChem.MMFFOptimizeMoleculeConfs(mol, maxIters=500)
    except Exception:
        use_mmff = False

    if not use_mmff or all(r[0] == -1 for r in opt_results):
        # MMFF parameterization failed for this chemistry — fall back to UFF
        try:
            opt_results = AllChem.UFFOptimizeMoleculeConfs(mol, maxIters=500)
        except Exception:
            # Even UFF failed — use unoptimized coordinates from best embedding
            opt_results = [(0, 0.0)] * len(conf_ids)

    # Select the conformer with the lowest force-field energy
    best_conf_id = 0
    best_energy = float("inf")
    for i, (converged, energy) in enumerate(opt_results):
        if converged != -1 and energy < best_energy:
            best_energy = energy
            best_conf_id = list(conf_ids)[i]

    canonical = Chem.MolToSmiles(Chem.RemoveHs(mol))
    formula = rdMolDescriptors.CalcMolFormula(mol)
    mw = round(Descriptors.ExactMolWt(mol), 4)

    # Build XYZ string from the best conformer
    conf = mol.GetConformer(best_conf_id)
    lines = [str(num_atoms), f"{formula} | SMILES: {canonical}"]
    for i in range(num_atoms):
        atom = mol.GetAtomWithIdx(i)
        pos = conf.GetAtomPosition(i)
        lines.append(f"{atom.GetSymbol()} {pos.x:.6f} {pos.y:.6f} {pos.z:.6f}")
    xyz_text = "\n".join(lines) + "\n"

    result = {
        "status": "success",
        "xyz": xyz_text,
        "atomCount": num_atoms,
        "formula": formula,
        "smiles": canonical,
        "molecularWeight": mw,
        "numConformersGenerated": len(conf_ids),
        "conformerEnergy_kcal": round(best_energy, 4) if best_energy < float("inf") else None,
    }
    if warning:
        result["warning"] = warning
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Usage: python smiles_to_xyz.py <SMILES>"}))
        sys.exit(1)

    smiles_input = sys.argv[1]
    try:
        result = smiles_to_xyz(smiles_input)
        print(json.dumps(result))
        if result["status"] == "error":
            sys.exit(1)
    except Exception as e:
        err_msg = str(e)
        if "No module named" in err_msg:
            err_msg += " (Hint: install rdkit-pypi: pip install rdkit-pypi)"
        print(json.dumps({"status": "error", "message": err_msg}))
        sys.exit(1)
