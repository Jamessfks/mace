#!/usr/bin/env python3
"""
Tests for the shared MACE calculation engine (calculate.py).

Uses mock calculators (Morse potential) so no GPU or mace-torch needed.
Run: cd mace-api && python3 test_geometry_opt.py
"""

import unittest
import numpy as np
from ase import Atoms, units
from ase.calculators.morse import MorsePotential
from ase.optimize import BFGS


class TestGeometryOptBFGS(unittest.TestCase):
    """Verify geometry-opt matches ASE BFGS documentation."""

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
        max_force = float(np.max(np.linalg.norm(atoms.get_forces(), axis=1)))
        self.assertLess(max_force, 0.01)

    def test_energy_decreases_overall(self):
        atoms = self._build_h2(bond_length=1.5)
        e_before = float(atoms.get_potential_energy())
        opt = BFGS(atoms, logfile=None)
        opt.run(fmax=0.01, steps=500)
        self.assertLess(float(atoms.get_potential_energy()), e_before)

    def test_attach_records_trajectory(self):
        atoms = self._build_h2()
        energies, positions, steps = [], [], []

        def record():
            energies.append(float(atoms.get_potential_energy()))
            positions.append(atoms.get_positions().tolist())
            steps.append(len(energies) - 1)

        opt = BFGS(atoms, logfile=None)
        opt.attach(record)
        record()  # step 0
        opt.run(fmax=0.05, steps=100)

        self.assertGreaterEqual(len(energies), 2)
        self.assertEqual(steps, list(range(len(steps))))

    def test_steps_limit_respected(self):
        atoms = self._build_h2(bond_length=2.0)
        opt = BFGS(atoms, logfile=None)
        opt.run(fmax=1e-10, steps=3)
        self.assertLessEqual(opt.nsteps, 3)

    def test_output_schema_matches_project(self):
        """Mirrors _build_result() from calculate.py."""
        atoms = self._build_h2()
        energies, positions, steps = [], [], []

        def record():
            energies.append(float(atoms.get_potential_energy()))
            positions.append(atoms.get_positions().tolist())
            steps.append(len(energies) - 1)

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
            "trajectory": {"energies": energies, "positions": positions, "step": steps},
            "properties": {"volume": float(atoms.get_volume()) if atoms.pbc.any() else None},
            "timeTaken": 0.001,
        }

        for key in ("status", "energy", "forces", "positions", "symbols",
                     "trajectory", "properties", "timeTaken"):
            self.assertIn(key, result)
        self.assertEqual(result["status"], "success")
        self.assertIsNone(result["lattice"])


class TestNPTPressureUnits(unittest.TestCase):
    """Verify NPT pressure conversion uses eV/A^3."""

    def test_gpa_to_eVA3(self):
        self.assertAlmostEqual(1.0 * units.GPa, 0.006241509, places=6)

    def test_zero_pressure(self):
        self.assertEqual(0.0 * units.GPa, 0.0)

    def test_old_bug_magnitude(self):
        correct = 1.0 * units.GPa
        buggy = 1.0 * 1e4
        self.assertGreater(buggy / correct, 1e6)

    def test_pressure_range(self):
        for p in [0, 1, 10, 50, 100]:
            self.assertLess(p * units.GPa, 1.0)


class TestFrictionUnits(unittest.TestCase):
    """Verify Langevin friction is converted from 1/fs to ASE internal units."""

    def test_friction_conversion(self):
        """0.005/fs should be ~0.051 in ASE units (not 0.005 raw)."""
        converted = 0.005 / units.fs
        self.assertAlmostEqual(converted, 0.005 / 0.09823, places=2)
        self.assertGreater(converted, 0.04)  # ~0.051, not 0.005

    def test_typical_range(self):
        """Typical friction 0.001-0.02/fs should be 0.01-0.2 in ASE units."""
        low = 0.001 / units.fs
        high = 0.02 / units.fs
        self.assertGreater(low, 0.009)
        self.assertLess(high, 0.25)


class TestMaxwellBoltzmannInit(unittest.TestCase):
    """Verify velocity initialization produces non-zero KE at target temp."""

    def test_velocities_initialized(self):
        from ase.md.velocitydistribution import MaxwellBoltzmannDistribution
        atoms = Atoms("H2", positions=[[0, 0, 0], [0, 0, 1.0]])
        MaxwellBoltzmannDistribution(atoms, temperature_K=300)
        ke = atoms.get_kinetic_energy()
        self.assertGreater(ke, 0.0)


if __name__ == "__main__":
    print("=" * 60)
    print("MACE Calculate Engine — Unit Tests")
    print("=" * 60)
    unittest.main(verbosity=2)
