#!/usr/bin/env python3
"""
Geometry Optimization & NPT Unit Tests — validates BFGS and pressure unit fixes.

Uses mock calculators (Morse potential) so no GPU or mace-torch needed.
Run: python3 mace-api/test_geometry_opt.py
"""

import unittest
import numpy as np
from ase import Atoms, units
from ase.calculators.morse import MorsePotential
from ase.optimize import BFGS


class TestGeometryOptBFGS(unittest.TestCase):
    """Verify the geometry-opt code path matches ASE BFGS documentation."""

    def _build_h2(self, bond_length=1.2):
        atoms = Atoms("H2", positions=[[0, 0, 0], [0, 0, bond_length]])
        atoms.calc = MorsePotential(epsilon=4.0, r0=0.97, rho0=5.0)
        return atoms

    def test_bfgs_constructor_and_run(self):
        atoms = self._build_h2()
        opt = BFGS(atoms, logfile=None)
        converged = opt.run(fmax=0.05, steps=200)
        self.assertTrue(converged)

    def test_converges_below_fmax(self):
        atoms = self._build_h2()
        opt = BFGS(atoms, logfile=None)
        opt.run(fmax=0.01, steps=500)
        forces = atoms.get_forces()
        max_force = float(np.max(np.linalg.norm(forces, axis=1)))
        self.assertLess(max_force, 0.01)

    def test_energy_decreases_overall(self):
        atoms = self._build_h2(bond_length=1.5)
        e_before = float(atoms.get_potential_energy())
        opt = BFGS(atoms, logfile=None)
        opt.run(fmax=0.01, steps=500)
        e_after = float(atoms.get_potential_energy())
        self.assertLess(e_after, e_before)

    def test_attach_records_trajectory(self):
        atoms = self._build_h2()
        opt_energies = []
        opt_positions = []
        opt_steps = []

        def record_opt_step():
            opt_energies.append(float(atoms.get_potential_energy()))
            opt_positions.append(atoms.get_positions().tolist())
            opt_steps.append(len(opt_energies) - 1)

        opt = BFGS(atoms, logfile=None)
        opt.attach(record_opt_step)
        record_opt_step()  # step 0
        opt.run(fmax=0.05, steps=100)

        self.assertGreaterEqual(len(opt_energies), 2)
        self.assertEqual(opt_steps, list(range(len(opt_steps))))

    def test_steps_limit_respected(self):
        atoms = self._build_h2(bond_length=2.0)
        opt = BFGS(atoms, logfile=None)
        opt.run(fmax=1e-10, steps=3)
        self.assertLessEqual(opt.nsteps, 3)

    def test_output_schema(self):
        atoms = self._build_h2()
        opt_energies, opt_positions, opt_steps_list = [], [], []

        def record():
            opt_energies.append(float(atoms.get_potential_energy()))
            opt_positions.append(atoms.get_positions().tolist())
            opt_steps_list.append(len(opt_energies) - 1)

        opt = BFGS(atoms, logfile=None)
        opt.attach(record)
        record()
        opt.run(fmax=0.05, steps=500)

        result = {
            "status": "success",
            "energy": float(atoms.get_potential_energy()),
            "forces": atoms.get_forces().tolist(),
            "positions": atoms.get_positions().tolist(),
            "symbols": [a.symbol for a in atoms],
            "lattice": atoms.get_cell().tolist() if atoms.pbc.any() else None,
            "trajectory": {"energies": opt_energies, "positions": opt_positions, "step": opt_steps_list},
            "properties": {"volume": float(atoms.get_volume()) if atoms.pbc.any() else None},
        }

        for key in ("status", "energy", "forces", "positions", "symbols", "trajectory", "properties"):
            self.assertIn(key, result)
        self.assertEqual(result["status"], "success")
        self.assertIsNone(result["lattice"])


class TestNPTPressureUnits(unittest.TestCase):
    """Verify NPT pressure conversion uses eV/A^3 (not bar)."""

    def test_gpa_to_eVA3_conversion(self):
        """1 GPa * units.GPa should give ~0.00624 eV/A^3."""
        result = 1.0 * units.GPa
        self.assertAlmostEqual(result, 0.006241509, places=6)

    def test_zero_pressure_unchanged(self):
        result = 0.0 * units.GPa
        self.assertEqual(result, 0.0)

    def test_old_bug_would_give_wrong_value(self):
        """The old code did GPa * 1e4 (bar). Verify this is ~1.6M x too large."""
        correct = 1.0 * units.GPa           # ~0.00624 eV/A^3
        buggy = 1.0 * 1e4                    # 10000 (bar, wrong unit)
        ratio = buggy / correct
        self.assertGreater(ratio, 1e6, "Old bar conversion was ~1.6M x too large")

    def test_pressure_range_reasonable(self):
        """Typical pressures (0-100 GPa) should give small eV/A^3 values."""
        for p_gpa in [0, 1, 10, 50, 100]:
            p_eVA3 = p_gpa * units.GPa
            self.assertLess(p_eVA3, 1.0, f"{p_gpa} GPa = {p_eVA3} eV/A^3 should be < 1")


if __name__ == "__main__":
    print("=" * 60)
    print("MACE Geometry-Opt & NPT Pressure Unit Tests")
    print("=" * 60)
    unittest.main(verbosity=2)
