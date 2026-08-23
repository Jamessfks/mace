#!/usr/bin/env python3
"""
Tests for vibrations_thermo.py.

Run:  python3 mace-api/test_vibrations_thermo.py
      python3 mace-api/test_vibrations_thermo.py --no-mace   (skip MACE tests)

Two kinds of test live here.

REAL SCIENCE (needs mace-torch and the MACE-OFF23 small checkpoint): water and
methane are relaxed to tight convergence and their harmonic frequencies,
zero-point energy and standard molar entropy are compared against experiment.
The measured deviations are PRINTED IN FULL at the end of the run, pass or
fail, because the number is the point of the test.

On tolerances, and why they are not tuned to pass
-------------------------------------------------
The quantity this module computes is the HARMONIC frequency: the curvature of
the potential at the minimum. What a spectrometer measures is the ANHARMONIC
FUNDAMENTAL, the 0->1 transition of a real Morse-like well, which lies BELOW
the harmonic value. For X-H stretches the gap is 4-6%, for bends 2-4%. Water is
the textbook case: harmonic 3832 / 1648 / 3943 cm^-1 against fundamentals
3657 / 1595 / 3756 cm^-1, i.e. 4.8% / 3.3% / 5.0%.

So a correct harmonic calculation MUST come out several percent above the
fundamentals, and a calculation that matched them exactly would be wrong. The
assertions below therefore allow 10% against the fundamentals — the ~5%
harmonic-anharmonic gap plus roughly the same again for the model's own error
against its wB97M-D3BJ reference — and additionally assert the SIGN, that the
computed stretches exceed the fundamentals. That directional assertion is the
one that would actually catch a sign error, a mass-weighting bug or a unit
slip; a symmetric percentage band would not.

Experimental values are gas-phase literature (NIST WebBook / CCCBDB). The
fundamentals are the assertion basis; the harmonic values are printed for
context.

MECHANISM (no MACE, runs in under a second): a toy calculator with an exactly
known Hessian and exactly known point-charge dipoles exercises the parts that
must not be tested against a black box — the imaginary-frequency verdict, the
translation/rotation separation, and the IR branch that MACE itself cannot
reach. The symmetry-number detector is tested on idealised geometries where
the right answer is a matter of group theory rather than of numerics.
"""

import json
import math
import os
import sys
import unittest

import numpy as np
from ase import Atoms, units
from ase.build import molecule
from ase.calculators.calculator import Calculator, all_changes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vibrations_thermo as vt  # noqa: E402

RUN_MACE = "--no-mace" not in sys.argv

# Collected by the science tests and dumped at the end of the run.
REPORT: list[str] = []


def report(line: str = "") -> None:
    REPORT.append(line)


# ── Experimental reference data (gas phase, NIST WebBook / CCCBDB) ──────────

# H2O: ν2 bend, ν1 symmetric stretch, ν3 antisymmetric stretch.
H2O_FUNDAMENTAL_CM1 = [1594.75, 3657.05, 3755.93]
H2O_HARMONIC_CM1 = [1648.47, 3832.17, 3942.53]
# Standard molar entropy of gaseous water, 298.15 K, 1 bar.
H2O_ENTROPY_J_PER_MOL_K = 188.83

# CH4: ν4 (t2, x3), ν2 (e, x2), ν1 (a1, x1), ν3 (t2, x3) — 9 modes in total.
CH4_FUNDAMENTAL_CM1 = [1310.8] * 3 + [1533.3] * 2 + [2916.5] + [3018.7] * 3
CH4_HARMONIC_CM1 = [1367.4] * 3 + [1582.7] * 2 + [3025.5] + [3156.8] * 3
CH4_ENTROPY_J_PER_MOL_K = 186.25


# ── A toy calculator with an exactly known Hessian and dipole ───────────────


class SpringDipoleCalculator(Calculator):
    """
    Harmonic bond springs plus fixed point charges. Nothing black-box.

    E = sum_bonds 0.5 * k * (|r_ij| - r0_ij)^2, with every r0 taken from the
    reference geometry, so the forces there are EXACTLY zero and the geometry
    is a stationary point by construction — no optimiser, no convergence
    question. The potential is a function of interatomic distances alone, so it
    is exactly invariant under translation and rotation and its Hessian has
    exactly 6 (or 5) zero eigenvalues: the right ground truth for testing the
    translation/rotation separation.

    A negative k puts a real negative eigenvalue in the Hessian, which is how
    the transition-state verdict is tested without needing a chemical saddle
    point.

    mu = sum_i q_i * r_i (e*Å, ASE's convention), giving constant, analytic
    dipole derivatives. This is the ONLY calculator in this repo that can
    exercise the IR branch — see test_ir_unavailable_for_mace for why MACE
    cannot.
    """

    implemented_properties = ["energy", "forces", "dipole"]

    def __init__(self, bonds, charges, **kwargs):
        super().__init__(**kwargs)
        self.bonds = bonds          # list of (i, j, k, r0)
        self.charges = np.asarray(charges, dtype=float)

    def calculate(self, atoms=None, properties=None, system_changes=all_changes):
        super().calculate(atoms, properties, system_changes)
        pos = self.atoms.get_positions()
        energy = 0.0
        forces = np.zeros_like(pos)
        for i, j, k, r0 in self.bonds:
            d = pos[i] - pos[j]
            length = float(np.linalg.norm(d))
            unit = d / length
            energy += 0.5 * k * (length - r0) ** 2
            f = -k * (length - r0) * unit
            forces[i] += f
            forces[j] -= f
        self.results["energy"] = energy
        self.results["free_energy"] = energy
        self.results["forces"] = forces
        self.results["dipole"] = (self.charges[:, None] * pos).sum(axis=0)


def _spring_water(hh_constant: float = 8.0) -> Atoms:
    """Water with O-H and H-H springs; hh_constant < 0 makes it a saddle point."""
    atoms = molecule("H2O")
    pos = atoms.get_positions()

    def dist(i, j):
        return float(np.linalg.norm(pos[i] - pos[j]))

    bonds = [
        (0, 1, 40.0, dist(0, 1)),
        (0, 2, 40.0, dist(0, 2)),
        (1, 2, hh_constant, dist(1, 2)),
    ]
    atoms.calc = SpringDipoleCalculator(bonds, charges=[-0.8, 0.4, 0.4])
    return atoms


# ── MACE helpers ────────────────────────────────────────────────────────────

_MACE_CALC = None


def mace_off_small():
    """One MACE-OFF23(small) float64 calculator, reused across tests."""
    global _MACE_CALC
    if _MACE_CALC is None:
        from mace.calculators import mace_off
        _MACE_CALC = mace_off(model="small", device="cpu", default_dtype="float64")
    return _MACE_CALC


def relaxed(name: str, fmax: float = 0.001) -> Atoms:
    """A G2 molecule relaxed with MACE-OFF23(small) well below the 0.005 gate."""
    from ase.optimize import BFGS
    atoms = molecule(name)
    atoms.calc = mace_off_small()
    converged = BFGS(atoms, logfile=None).run(fmax=fmax, steps=500)
    assert converged, f"{name} did not reach fmax {fmax}"
    return atoms


# ── Mechanism tests (no MACE) ───────────────────────────────────────────────


class TestGeometryClassification(unittest.TestCase):
    """Linearity from the moments of inertia, never assumed."""

    def test_water_is_nonlinear(self):
        info = vt.classify_geometry(molecule("H2O"))
        self.assertEqual(info["geometry"], "nonlinear")
        self.assertEqual(info["nTranslationRotation"], 6)
        self.assertGreater(info["maxOffAxisDistanceAngstrom"], 0.1)

    def test_co2_is_linear(self):
        info = vt.classify_geometry(molecule("CO2"))
        self.assertEqual(info["geometry"], "linear")
        self.assertEqual(info["nTranslationRotation"], 5)
        self.assertLess(info["maxOffAxisDistanceAngstrom"], 1e-6)

    def test_diatomic_is_linear(self):
        self.assertEqual(vt.classify_geometry(molecule("N2"))["geometry"], "linear")

    def test_single_atom_is_monatomic(self):
        info = vt.classify_geometry(Atoms("Ar", positions=[[0, 0, 0]]))
        self.assertEqual(info["geometry"], "monatomic")
        self.assertEqual(info["nTranslationRotation"], 3)

    def test_tr_subspace_rank_agrees(self):
        """Independent cross-check: rank 5 for linear, 6 for nonlinear."""
        for name, expected in (("CO2", 5), ("H2O", 6), ("C6H6", 6), ("C2H2", 5)):
            _, singular = vt.translation_rotation_basis(molecule(name), 6)
            rank = int((singular > singular[0] * 1e-6).sum())
            self.assertEqual(rank, expected, f"{name}: rank {rank}, expected {expected}")


class TestSymmetryNumber(unittest.TestCase):
    """
    sigma = order of the proper-rotation subgroup, found by search, not lookup.

    Reference values are textbook (Cramer, Essentials of Computational
    Chemistry, Appendix B). Getting sigma wrong is not a rounding error: it
    shifts the entropy by kB*ln(sigma), which for methane's sigma = 12 is
    20.7 J/(mol*K), an 11% error on S.
    """

    CASES = [
        ("H2O", 2, "C2"),        # C2v -> rotation subgroup C2
        ("NH3", 3, "C3"),        # C3v -> C3
        ("CH4", 12, "T"),        # Td  -> T
        ("C6H6", 12, "D6"),      # D6h -> D6
        ("C2H6", 6, "D3"),       # D3d (staggered) -> D3
        ("CO2", 2, "Dinfh"),     # linear, centrosymmetric
        ("CO", 1, "Cinfv"),      # linear, no centre
        ("N2", 2, "Dinfh"),
        ("CH3OH", 1, "C1"),      # Cs -> only the identity is a rotation
        ("C2H4", 4, "D2"),       # D2h -> D2
    ]

    def test_known_symmetry_numbers(self):
        for name, expected_sigma, expected_group in self.CASES:
            with self.subTest(molecule=name):
                found = vt.rotational_symmetry_number(
                    molecule(name), vt.DEFAULT_SYMMETRY_TOLERANCE_ANGSTROM
                )
                self.assertEqual(
                    found["symmetryNumber"], expected_sigma,
                    f"{name}: got sigma={found['symmetryNumber']} "
                    f"({found['group']}), expected {expected_sigma} "
                    f"({expected_group})",
                )
                self.assertEqual(found["group"], expected_group, name)

    def test_explicit_override_wins_and_warns(self):
        warnings: list[str] = []
        out = vt.resolve_symmetry_number(molecule("CH4"), {"symmetryNumber": 4}, warnings)
        self.assertEqual(out["symmetryNumber"], 4)
        self.assertEqual(out["source"], "user")
        self.assertTrue(any("supplied by the caller" in w for w in warnings))
        self.assertIn("correct ONLY for sigma=4", out["effectOnEntropy"])

    def test_effect_on_entropy_is_quantified(self):
        out = vt.resolve_symmetry_number(molecule("CH4"), {}, [])
        self.assertEqual(out["symmetryNumber"], 12)
        expected_shift = units.kB * math.log(12)
        self.assertAlmostEqual(out["gibbsShiftEv"],
                               vt.DEFAULT_TEMPERATURE_K * expected_shift, places=6)

    def test_rejects_bad_symmetry_number(self):
        for bad in (0, -3, "two", True):
            with self.assertRaises(ValueError):
                vt.resolve_symmetry_number(molecule("H2O"), {"symmetryNumber": bad}, [])


class TestToyHessian(unittest.TestCase):
    """
    End-to-end on a potential whose Hessian is exactly known by construction.

    Covers what a MACE test cannot pin down: the exact number of zero modes,
    the imaginary-frequency verdict, and the IR branch.
    """

    def test_minimum_verdict_and_mode_counting(self):
        atoms = _spring_water(hh_constant=8.0)
        out = vt.run_vibrational_analysis(atoms, {}, filename="toy-water")
        vib = out["vibrations"]

        self.assertEqual(vib["geometry"], "nonlinear")
        self.assertEqual(vib["nModesTotal"], 9)
        self.assertEqual(vib["nTranslationRotation"], 6)
        self.assertEqual(vib["nVibrational"], 3)
        self.assertEqual(vib["nImaginary"], 0)
        self.assertEqual(vib["stationaryPointType"], "minimum")
        self.assertIn("MINIMUM", vib["stationaryPointStatement"])
        self.assertLess(vib["translationRotationResidualFraction"],
                        vt.TR_RESIDUAL_RELATIVE_WARN)
        # The two clusters must separate essentially perfectly: this potential
        # depends only on interatomic distances, so translation and rotation
        # are exact null directions of the analytic Hessian.
        self.assertGreater(vib["translationRotationSeparation"], 0.99)

    def test_translation_rotation_residual_is_first_order_in_delta(self):
        """
        Proves the residual is finite-difference truncation, not a bug.

        The analytic Hessian of this potential has exactly six zero
        eigenvalues. A central difference gets the eigenvalue wrong by
        O(delta^2), and frequency is the square root of an eigenvalue, so the
        residual FREQUENCY must fall as O(delta) — halving delta must halve it.
        (The genuine modes, whose eigenvalues are not near zero, converge as
        O(delta^2) over the same range.)
        """
        residuals = {}
        genuine = {}
        for delta in (0.02, 0.01, 0.005):
            out = vt.run_vibrational_analysis(_spring_water(), {"delta": delta})
            residuals[delta] = out["vibrations"]["maxTranslationRotationResidualCm1"]
            genuine[delta] = out["vibrations"]["frequenciesCm1"]

        self.assertAlmostEqual(residuals[0.02] / residuals[0.01], 2.0, delta=0.1)
        self.assertAlmostEqual(residuals[0.01] / residuals[0.005], 2.0, delta=0.1)
        # Quadratic convergence of the real modes: the 0.02->0.01 change must be
        # about four times the 0.01->0.005 change.
        step_coarse = abs(genuine[0.02][0] - genuine[0.01][0])
        step_fine = abs(genuine[0.01][0] - genuine[0.005][0])
        self.assertGreater(step_coarse, 3.0 * step_fine)

    def test_transition_state_verdict(self):
        """One negative force constant -> exactly one imaginary frequency."""
        atoms = _spring_water(hh_constant=-8.0)
        out = vt.run_vibrational_analysis(atoms, {}, filename="toy-saddle")
        vib = out["vibrations"]

        self.assertEqual(vib["nImaginary"], 1)
        self.assertEqual(vib["nImaginarySignificant"], 1)
        self.assertEqual(vib["stationaryPointType"], "transition-state")
        self.assertIn("TRANSITION STATE", vib["stationaryPointStatement"])
        # Reported as a NEGATIVE number, never as a positive one.
        self.assertLess(vib["imaginaryFrequenciesCm1"][0], 0.0)
        self.assertEqual(len(vib["frequenciesCm1"]), 3)
        self.assertTrue(any(f < 0 for f in vib["frequenciesCm1"]))
        # The imaginary mode is a vibration, not misfiled as a rotation.
        imaginary = [m for m in vib["modes"] if m["imaginary"]]
        self.assertEqual(len(imaginary), 1)
        self.assertLess(imaginary[0]["translationRotationCharacter"], 0.01)
        # It carries no zero-point energy, and that is stated.
        self.assertTrue(any("EXCLUDED" in w for w in out["warnings"]))

    def test_ir_branch_runs_when_dipoles_are_real(self):
        """The IR gate opens for a calculator that genuinely has dipoles."""
        atoms = _spring_water()
        capable, reason = vt.dipole_capability(atoms.calc, atoms)
        self.assertTrue(capable, reason)

        out = vt.run_vibrational_analysis(atoms, {}, filename="toy-water")
        ir = out["vibrations"]["infrared"]
        self.assertTrue(ir["available"])
        self.assertEqual(ir["intensityUnits"], "(D/Å)^2/amu")
        intensities = ir["stickSpectrum"]["intensities"]
        self.assertEqual(len(intensities), 3)
        self.assertTrue(all(i is not None and i >= 0 for i in intensities))
        self.assertGreater(max(intensities), 0.0)

    def test_animation_vectors_are_usable(self):
        atoms = _spring_water()
        out = vt.run_vibrational_analysis(
            atoms, {"animationAmplitudeAngstrom": 0.4}, filename="toy-water"
        )
        for mode in out["vibrations"]["modes"]:
            disp = np.array(mode["displacementsAngstrom"])
            self.assertEqual(disp.shape, (3, 3))          # one 3-vector per atom
            self.assertAlmostEqual(float(np.abs(disp).max()), 0.4, places=5)
            self.assertGreater(mode["reducedMassAmu"], 0.0)
            self.assertGreater(mode["forceConstantEvPerAngstrom2"], 0.0)

    def test_result_is_json_serialisable(self):
        out = vt.run_vibrational_analysis(_spring_water(), {}, filename="toy-water")
        json.dumps(out)  # must not raise: no numpy scalars, no complex numbers

    def test_monatomic_has_no_vibrations(self):
        atoms = Atoms("Ar", positions=[[0.0, 0.0, 0.0]])
        atoms.calc = SpringDipoleCalculator(bonds=[], charges=[0.0])
        out = vt.run_vibrational_analysis(atoms, {}, filename="argon")
        self.assertEqual(out["vibrations"]["geometry"], "monatomic")
        self.assertEqual(out["vibrations"]["nVibrational"], 0)
        self.assertEqual(out["vibrations"]["zeroPointEnergyEv"], 0.0)
        self.assertEqual(out["thermochemistry"]["nVibrationalModesUsed"], 0)


class TestRefusals(unittest.TestCase):
    """Every gate refuses rather than returning plausible numbers."""

    def test_refuses_non_stationary_geometry(self):
        atoms = _spring_water()
        atoms.positions[1, 0] += 0.25   # stretch one O-H well off the minimum
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(atoms, {}, filename="stretched")
        message = str(ctx.exception)
        self.assertIn("not at a stationary point", message)
        self.assertIn("Max force is", message)     # the MEASURED fmax is quoted
        self.assertIn("Nothing was computed", message)

    def test_optimize_first_records_before_and_after(self):
        atoms = _spring_water()
        atoms.positions[1, 0] += 0.25
        out = vt.run_vibrational_analysis(
            atoms, {"optimizeFirst": True}, filename="stretched"
        )
        stationary = out["vibrations"]["stationaryPoint"]
        self.assertTrue(stationary["optimizedFirst"])
        self.assertGreater(stationary["fmaxOnEntryEvPerAngstrom"], 0.005)
        self.assertLessEqual(stationary["fmaxAfterOptimizationEvPerAngstrom"], 0.005)
        self.assertTrue(stationary["converged"])
        self.assertTrue(any("relaxed with BFGS" in w for w in out["warnings"]))

    def test_refuses_periodic(self):
        atoms = _spring_water()
        atoms.set_cell([10, 10, 10])
        atoms.set_pbc(True)
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(atoms, {}, filename="periodic")
        self.assertIn("isolated molecules only", str(ctx.exception))

    def test_refuses_constrained(self):
        from ase.constraints import FixAtoms
        atoms = _spring_water()
        atoms.set_constraint(FixAtoms(indices=[0]))
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(atoms, {}, filename="constrained")
        self.assertIn("constrained", str(ctx.exception))

    def test_refuses_missing_calculator(self):
        atoms = molecule("H2O")
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(atoms, {}, filename="bare")
        self.assertIn("requires an ASE calculator", str(ctx.exception))

    def test_atom_ceiling(self):
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(_spring_water(), {"maxAtoms": 2})
        self.assertIn("limited to 2 atoms", str(ctx.exception))

    def test_time_budget_gate(self):
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(_spring_water(), {"timeBudgetSeconds": 1e-9})
        self.assertIn("over the", str(ctx.exception))
        self.assertIn("budget", str(ctx.exception))

    def test_rejects_bad_parameters(self):
        for params in ({"delta": -0.01}, {"nfree": 3}, {"temperature": 0},
                       {"spinMultiplicity": 0}, {"pressure": "hot"}):
            with self.subTest(params=params):
                with self.assertRaises(ValueError):
                    vt.run_vibrational_analysis(_spring_water(), params)


class TestCacheIsolation(unittest.TestCase):
    """
    The stale-cache bug: ase.vibrations reuses forces keyed by displacement
    name, so a shared cache directory would serve one user's frequencies to
    another. These tests are the reason the module uses tempfile.mkdtemp().
    """

    def _temp_caches(self):
        import glob
        import tempfile
        return glob.glob(os.path.join(tempfile.gettempdir(), "simpleatom-vib-*"))

    def test_no_cache_left_behind(self):
        before = set(self._temp_caches())
        vt.run_vibrational_analysis(_spring_water(), {})
        self.assertEqual(set(self._temp_caches()) - before, set())

    def test_no_cache_in_cwd(self):
        """ase.vibrations' default name is the relative path 'vib'."""
        vt.run_vibrational_analysis(_spring_water(), {})
        self.assertFalse(os.path.exists("vib"))
        self.assertFalse(os.path.exists("ir"))

    def test_second_run_is_not_served_the_first_run_forces(self):
        """
        Two different potentials, back to back, must give different answers.

        With a shared cache directory the second run would find every
        displacement key already present ('0x+', '0x-', ...) and return the
        first run's frequencies verbatim.
        """
        soft = vt.run_vibrational_analysis(_spring_water(hh_constant=2.0), {})
        stiff = vt.run_vibrational_analysis(_spring_water(hh_constant=20.0), {})
        self.assertNotAlmostEqual(
            soft["vibrations"]["frequenciesCm1"][0],
            stiff["vibrations"]["frequenciesCm1"][0],
            places=1,
        )

    def test_cache_left_behind_is_cleaned_even_when_the_run_fails(self):
        import glob
        import tempfile

        class Exploding(SpringDipoleCalculator):
            calls = 0

            def calculate(self, atoms=None, properties=None,
                          system_changes=all_changes):
                Exploding.calls += 1
                if Exploding.calls > 3:      # survive the entry fmax check
                    raise RuntimeError("boom")
                super().calculate(atoms, properties, system_changes)

        atoms = _spring_water()
        atoms.calc = Exploding(atoms.calc.bonds, atoms.calc.charges)
        before = set(glob.glob(os.path.join(tempfile.gettempdir(), "simpleatom-vib-*")))
        with self.assertRaises(RuntimeError):
            vt.run_vibrational_analysis(atoms, {})
        after = set(glob.glob(os.path.join(tempfile.gettempdir(), "simpleatom-vib-*")))
        self.assertEqual(after - before, set())


class TestResultShape(unittest.TestCase):
    """The result must be a drop-in for what calculate.py already returns."""

    def test_result_shape_matches_calculate_py(self):
        """
        Guard against drift in the deliberately-duplicated _build_result().

        vibrations_thermo._build_result is a copy of calculate._build_result
        (a real import would be a cycle once dispatch is wired). If calculate.py
        ever gains or renames a key, this test fails instead of the frontend.
        """
        try:
            import calculate
        except Exception as exc:  # pragma: no cover — Docker builds without it
            self.skipTest(f"calculate.py not importable here: {exc}")

        atoms = _spring_water()
        forces = atoms.get_forces()
        reference = calculate._build_result(
            atoms, atoms.get_potential_energy(), forces, "msg", 0.0,
            {"referenceEnergy": -1.0}, {"modelType": "custom"},
            warnings=["w"], manifest={"m": 1},
        )
        ours = vt._build_result(
            atoms, atoms.get_potential_energy(), forces, "msg", 0.0,
            {"referenceEnergy": -1.0}, {"modelType": "custom"},
            warnings=["w"], manifest={"m": 1},
        )
        self.assertEqual(set(reference), set(ours))
        for key in reference:
            if key == "timeTaken":
                continue
            self.assertEqual(reference[key], ours[key], key)

    def test_top_level_keys_present(self):
        out = vt.run_vibrational_analysis(_spring_water(), {}, filename="toy")
        for key in ("status", "energy", "forces", "positions", "symbols",
                    "lattice", "properties", "params", "message", "timeTaken",
                    "vibrations", "thermochemistry"):
            self.assertIn(key, out)
        self.assertEqual(out["status"], "success")
        self.assertEqual(out["params"]["calculationType"], vt.CALCULATION_TYPE)
        # The message carries the verdict, because it is the field that
        # survives PDF export and MACE Link sharing.
        self.assertIn("MINIMUM", out["message"])
        self.assertIn("sigma=", out["message"])
        self.assertIn("IR intensities", out["message"])


# ── Real science: MACE-OFF23 against experiment ─────────────────────────────


@unittest.skipUnless(RUN_MACE, "MACE tests disabled with --no-mace")
class TestWaterAgainstExperiment(unittest.TestCase):
    """
    Water, MACE-OFF23(small), float64, relaxed to fmax < 0.001 eV/Å.

    3N-6 = 3 modes, compared against the gas-phase fundamentals the task
    specifies: 1595, 3657, 3756 cm^-1.
    """

    @classmethod
    def setUpClass(cls):
        cls.atoms = relaxed("H2O")
        cls.out = vt.run_vibrational_analysis(
            cls.atoms, {"pressure": 1.0e5}, filename="H2O"
        )

    def test_three_real_modes(self):
        vib = self.out["vibrations"]
        self.assertEqual(vib["geometry"], "nonlinear")
        self.assertEqual(vib["nVibrational"], 3)
        self.assertEqual(vib["nImaginary"], 0)
        self.assertEqual(vib["stationaryPointType"], "minimum")

    def test_frequencies_against_experiment(self):
        found = self.out["vibrations"]["frequenciesCm1"]
        report("")
        report("  WATER (H2O) — MACE-OFF23 small, float64, fmax < 0.001 eV/A")
        report("  mode   MACE      exp. fundamental   dev      exp. harmonic   dev")
        deviations = []
        for value, fundamental, harmonic in zip(
            found, H2O_FUNDAMENTAL_CM1, H2O_HARMONIC_CM1
        ):
            dev_f = 100.0 * (value - fundamental) / fundamental
            dev_h = 100.0 * (value - harmonic) / harmonic
            deviations.append(dev_f)
            report(f"  {value:9.1f}   {fundamental:9.2f}      {dev_f:+6.2f}%   "
                   f"{harmonic:9.2f}     {dev_h:+6.2f}%")
        report(f"  mean |deviation| vs fundamentals: "
               f"{np.mean(np.abs(deviations)):.2f}%")

        for value, fundamental in zip(found, H2O_FUNDAMENTAL_CM1):
            self.assertLess(
                abs(100.0 * (value - fundamental) / fundamental), 10.0,
                f"{value:.1f} vs fundamental {fundamental:.1f} cm^-1",
            )
        # Directional: a harmonic O-H stretch must exceed its anharmonic
        # fundamental. This is the assertion that catches a real error.
        self.assertGreater(found[1], H2O_FUNDAMENTAL_CM1[1])
        self.assertGreater(found[2], H2O_FUNDAMENTAL_CM1[2])

    def test_symmetry_number_is_two(self):
        symmetry = self.out["thermochemistry"]["symmetry"]
        self.assertEqual(symmetry["symmetryNumber"], 2)
        self.assertEqual(symmetry["source"], "detected")
        self.assertEqual(symmetry["rotationalSubgroup"], "C2")
        self.assertTrue(symmetry["confident"])

    def test_entropy_against_experiment(self):
        """
        S°(H2O, g, 298.15 K, 1 bar) = 188.83 J/(mol*K).

        The rigid-rotor / harmonic-oscillator entropy should land within ~1%.
        This is the end-to-end check on the symmetry number: sigma = 1 instead
        of 2 would add kB*ln2 = 5.76 J/(mol*K) and blow the tolerance.
        """
        thermo = self.out["thermochemistry"]
        found = thermo["entropyJPerMolPerK"]
        error = 100.0 * (found - H2O_ENTROPY_J_PER_MOL_K) / H2O_ENTROPY_J_PER_MOL_K
        report("")
        report(f"  H2O thermochemistry at 298.15 K, 1 bar (sigma="
               f"{thermo['symmetry']['symmetryNumber']}):")
        report(f"    ZPE   {thermo['zeroPointEnergyEv']:.4f} eV")
        report(f"    U     {thermo['internalEnergyEv']:.4f} eV")
        report(f"    H     {thermo['enthalpyEv']:.4f} eV")
        report(f"    S     {found:.2f} J/(mol K)   experiment "
               f"{H2O_ENTROPY_J_PER_MOL_K:.2f}   dev {error:+.2f}%")
        report(f"    G     {thermo['gibbsEnergyEv']:.4f} eV")
        self.assertLess(abs(error), 1.5, f"S = {found:.2f} J/(mol K)")

    def test_zero_point_energy_is_positive_and_consistent(self):
        vib = self.out["vibrations"]
        thermo = self.out["thermochemistry"]
        expected = 0.5 * sum(f * units.invcm for f in vib["frequenciesCm1"])
        self.assertAlmostEqual(vib["zeroPointEnergyEv"], expected, places=6)
        self.assertAlmostEqual(thermo["zeroPointEnergyEv"], expected, places=6)

    def test_translation_rotation_modes_are_small_against_the_real_modes(self):
        """
        Water is the WORST case for the absolute residual — its O-H bonds are
        the stiffest thing in this test suite, and the finite-difference
        truncation error tracks bond stiffness. What has to be small is the
        residual RELATIVE to the softest genuine mode, since that is the mode
        whose entropy contribution contamination would corrupt.
        """
        vib = self.out["vibrations"]
        self.assertEqual(len(vib["translationRotationResidualCm1"]), 6)
        report(f"  H2O residual translation/rotation: max "
               f"{vib['maxTranslationRotationResidualCm1']:.2f} cm^-1 = "
               f"{vib['translationRotationResidualFraction']:.1%} of the lowest "
               f"genuine mode (exact analytic value is 0)")
        self.assertLess(vib["translationRotationResidualFraction"],
                        vt.TR_RESIDUAL_RELATIVE_WARN)
        # ...and no spurious warning was raised for a perfectly good result.
        self.assertFalse(any("translational/rotational modes" in w
                             for w in self.out.get("warnings", [])))


@unittest.skipUnless(RUN_MACE, "MACE tests disabled with --no-mace")
class TestMethaneAgainstExperiment(unittest.TestCase):
    """Methane: 3N-6 = 9 modes, sigma = 12 (Td -> rotation subgroup T)."""

    @classmethod
    def setUpClass(cls):
        cls.atoms = relaxed("CH4")
        cls.out = vt.run_vibrational_analysis(
            cls.atoms, {"pressure": 1.0e5}, filename="CH4"
        )

    def test_nine_real_modes(self):
        vib = self.out["vibrations"]
        self.assertEqual(vib["nVibrational"], 9)
        self.assertEqual(vib["nImaginary"], 0)

    def test_frequencies_against_experiment(self):
        found = self.out["vibrations"]["frequenciesCm1"]
        report("")
        report("  METHANE (CH4) — MACE-OFF23 small, float64, fmax < 0.001 eV/A")
        report("  mode   MACE      exp. fundamental   dev      exp. harmonic   dev")
        deviations = []
        for value, fundamental, harmonic in zip(
            found, CH4_FUNDAMENTAL_CM1, CH4_HARMONIC_CM1
        ):
            dev_f = 100.0 * (value - fundamental) / fundamental
            deviations.append(dev_f)
            report(f"  {value:9.1f}   {fundamental:9.1f}      {dev_f:+6.2f}%   "
                   f"{harmonic:9.1f}     "
                   f"{100.0 * (value - harmonic) / harmonic:+6.2f}%")
        report(f"  mean |deviation| vs fundamentals: "
               f"{np.mean(np.abs(deviations)):.2f}%")

        for value, fundamental in zip(found, CH4_FUNDAMENTAL_CM1):
            self.assertLess(
                abs(100.0 * (value - fundamental) / fundamental), 10.0,
                f"{value:.1f} vs fundamental {fundamental:.1f} cm^-1",
            )
        # The four C-H stretches (modes 5-8) must exceed their fundamentals.
        for value, fundamental in zip(found[5:], CH4_FUNDAMENTAL_CM1[5:]):
            self.assertGreater(value, fundamental)

    def test_degeneracies_are_reproduced(self):
        """Td forces 3+2+1+3 degeneracy; a broken Hessian would split them."""
        found = self.out["vibrations"]["frequenciesCm1"]
        for group in (found[0:3], found[3:5], found[6:9]):
            self.assertLess(max(group) - min(group), 15.0, f"split: {group}")

    def test_symmetry_number_is_twelve(self):
        symmetry = self.out["thermochemistry"]["symmetry"]
        report(f"  CH4 symmetry: sigma={symmetry['symmetryNumber']} "
               f"({symmetry['rotationalSubgroup']}), source "
               f"{symmetry['source']}, confident {symmetry['confident']}")
        self.assertEqual(symmetry["symmetryNumber"], 12)
        self.assertEqual(symmetry["rotationalSubgroup"], "T")

    def test_entropy_against_experiment(self):
        """S°(CH4, g, 298.15 K, 1 bar) = 186.25 J/(mol*K)."""
        thermo = self.out["thermochemistry"]
        found = thermo["entropyJPerMolPerK"]
        error = 100.0 * (found - CH4_ENTROPY_J_PER_MOL_K) / CH4_ENTROPY_J_PER_MOL_K
        report("")
        report(f"  CH4 thermochemistry at 298.15 K, 1 bar (sigma="
               f"{thermo['symmetry']['symmetryNumber']}):")
        report(f"    ZPE   {thermo['zeroPointEnergyEv']:.4f} eV")
        report(f"    H     {thermo['enthalpyEv']:.4f} eV")
        report(f"    S     {found:.2f} J/(mol K)   experiment "
               f"{CH4_ENTROPY_J_PER_MOL_K:.2f}   dev {error:+.2f}%")
        report(f"    G     {thermo['gibbsEnergyEv']:.4f} eV")
        self.assertLess(abs(error), 1.5, f"S = {found:.2f} J/(mol K)")


@unittest.skipUnless(RUN_MACE, "MACE tests disabled with --no-mace")
class TestMaceSpecificBehaviour(unittest.TestCase):

    def test_ir_unavailable_for_mace(self):
        """
        The IR claim in the module docstring, verified against the real model.

        If this ever starts failing because MACE gained dipoles, the gate opens
        by itself — the module probes the capability, it does not hardcode it.
        """
        calc = mace_off_small()
        self.assertNotIn("dipole", calc.implemented_properties)
        capable, reason = vt.dipole_capability(calc, molecule("H2O"))
        self.assertFalse(capable)
        self.assertIn("does not declare 'dipole'", reason)
        self.assertIn("foundations_models.py", reason)

        out = vt.run_vibrational_analysis(relaxed("H2O"), {}, filename="H2O")
        ir = out["vibrations"]["infrared"]
        self.assertFalse(ir["available"])
        self.assertIsNone(ir["stickSpectrum"]["intensities"])
        self.assertIsNone(ir["intensityUnits"])
        # Frequencies are still there in full — the sticks have positions, just
        # no heights.
        self.assertEqual(len(ir["stickSpectrum"]["frequenciesCm1"]), 3)
        self.assertTrue(any("IR intensities are NOT available" in w
                            for w in out["warnings"]))
        report("")
        report("  IR intensities: UNAVAILABLE for MACE-OFF23 / MACE-MP-0.")
        report(f"    implemented_properties = {calc.implemented_properties}")
        report("    get_dipole_moment() -> PropertyNotImplementedError")

    def _float32_water(self):
        """
        Water on a float32 MACE-OFF23(small).

        `MACECalculator.__init__` calls `torch_tools.set_default_dtype()`, which
        mutates torch's PROCESS-GLOBAL default. Building a float32 calculator
        therefore breaks every float64 calculator already alive in this process
        — including the one cached in `_MACE_CALC`. The teardown below restores
        the global and drops the cache, which is also a live demonstration of
        why vibrations_thermo._check_precision() guards against exactly this.
        """
        from mace.calculators import mace_off
        atoms = relaxed("H2O")
        atoms.calc = mace_off(model="small", device="cpu", default_dtype="float32")
        return atoms

    def tearDown(self):
        global _MACE_CALC
        import torch
        from mace.tools import torch_tools
        if torch.get_default_dtype() is not torch.float64:
            torch_tools.set_default_dtype("float64")
            globals()["_MACE_CALC"] = None

    def test_refuses_float32(self):
        atoms = self._float32_water()
        with self.assertRaises(ValueError) as ctx:
            vt.run_vibrational_analysis(atoms, {"fmaxTolerance": 0.05})
        self.assertIn("requires float64", str(ctx.exception))
        self.assertIn("float32", str(ctx.exception))

    def test_float32_opt_in_warns_loudly(self):
        atoms = self._float32_water()
        out = vt.run_vibrational_analysis(
            atoms, {"allowFloat32": True, "fmaxTolerance": 0.05}
        )
        self.assertEqual(out["params"]["hessianPrecision"], "float32")
        self.assertTrue(any("rounding noise" in w for w in out["warnings"]))

    def test_refuses_global_dtype_mismatch(self):
        """
        The cryptic-torch-error guard, provoked deliberately.

        A float64 model whose process has since had its global default flipped
        to float32 must be refused by name, not allowed to blow up 30 frames
        deep in torch.matmul.
        """
        import torch
        from mace.tools import torch_tools
        atoms = relaxed("H2O")
        float64_calc = atoms.calc
        try:
            torch_tools.set_default_dtype("float32")
            self.assertIs(torch.get_default_dtype(), torch.float32)
            self.assertEqual(vt.detect_calculator_dtype(float64_calc), "float64")
            with self.assertRaises(ValueError) as ctx:
                vt.run_vibrational_analysis(atoms, {})
            self.assertIn("global default dtype", str(ctx.exception))
        finally:
            torch_tools.set_default_dtype("float64")

    def test_delta_convergence(self):
        """
        The justification for delta = 0.01 Å, measured rather than asserted.

        MACE forces are analytic autograd gradients, so in float64 there is no
        finite-difference noise floor to speak of and the only error is the
        O(delta^2) truncation. If 0.005, 0.01 and 0.02 Å agree to ~1 cm^-1 then
        0.01 Å is in the flat part of the curve and the choice is settled.
        """
        atoms = relaxed("H2O")
        results = {}
        for delta in (0.005, 0.01, 0.02):
            out = vt.run_vibrational_analysis(atoms, {"delta": delta})
            results[delta] = out["vibrations"]["frequenciesCm1"]

        report("")
        report("  DELTA CONVERGENCE (H2O, cm^-1):")
        for delta, frequencies in results.items():
            report(f"    delta = {delta:5.3f} A   "
                   + "  ".join(f"{f:8.2f}" for f in frequencies))
        spreads = [max(v[i] for v in results.values()) -
                   min(v[i] for v in results.values()) for i in range(3)]
        report(f"    max spread across delta: {max(spreads):.2f} cm^-1")
        self.assertLess(max(spreads), 5.0)

    def test_cost_estimate_is_measured(self):
        out = vt.run_vibrational_analysis(relaxed("H2O"), {})
        cost = out["vibrations"]["cost"]
        self.assertEqual(cost["nForceEvaluations"], 6 * 3 + 1)
        self.assertGreater(cost["measuredForceEvalSeconds"], 0.0)
        self.assertEqual(cost["atomCeiling"], vt.MAX_ATOMS)
        report("")
        report(f"  Cost gate on this machine: one MACE-OFF23(small) force "
               f"evaluation on H2O = {cost['measuredForceEvalSeconds']:.4f} s, "
               f"{cost['nForceEvaluations']} evaluations = "
               f"{cost['estimatedSeconds']:.1f} s estimated, "
               f"{out['timeTaken']:.1f} s actual.")


if __name__ == "__main__":
    argv = [a for a in sys.argv if a != "--no-mace"]
    print("=" * 72)
    print("SimpleAtom — vibrational analysis and thermochemistry")
    print("=" * 72)
    runner = unittest.main(argv=argv, verbosity=2, exit=False)
    if REPORT:
        print()
        print("=" * 72)
        print("MEASURED RESULTS")
        print("=" * 72)
        for line in REPORT:
            print(line)
        print("=" * 72)
    sys.exit(0 if runner.result.wasSuccessful() else 1)
