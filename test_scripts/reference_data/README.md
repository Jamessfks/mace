# Reference data: experimental vibrational frequencies and thermochemistry

`cccbdb_frequencies.json` is a hand-verified ground-truth dataset for validating the
vibrational-frequency / thermochemistry feature against **experiment**, not against
another calculation. Every leaf value in the JSON carries a `"source"` URL (or literature
citation) and a `"sourceType"` of `"experimental"` or `"computed"`.

## What's in it, and how complete it is

All 10 target molecules — water, methane, ammonia, carbon dioxide, formaldehyde,
methanol, ethylene, acetylene, benzene, ethanol — got **complete, verified** data:

- Full set of experimental fundamental frequencies (cm⁻¹) with symmetry labels and
  degeneracies
- Expected number of real vibrational modes (3N−6 / 3N−5) and linearity, cross-checked
  by summing degeneracies against the mode-counting formula
- Rotational symmetry number (σ), derived from the point group
- Vibrational zero-point energy, in cm⁻¹, kJ/mol, and kcal/mol
- Gas-phase standard entropy S°(298.15 K, 1 bar) in J/mol/K
- Point group and rotational constants (bonus context, not explicitly requested but
  useful for sanity-checking a MACE-computed geometry/Hessian)

Two molecules (water, carbon dioxide) also came with CCCBDB-tabulated spectroscopic
**harmonic** frequencies alongside the fundamentals — these are a bonus, not
requested, but they're the cleanest illustration in the dataset of the anharmonicity gap
(see tolerance justification below), so they're included.

**None of the CCCBDB fallback plan was needed.** Every species page
(`https://cccbdb.nist.gov/exp2x.asp?casno=<CAS-no-dashes>`) fetched successfully on the
first attempt, contrary to the assumption in the task brief that CCCBDB would resist
plain fetching. The NIST Chemistry WebBook and primary literature were used only for the
two research questions (scaling factors, MACE-OFF23 accuracy), not for the per-molecule
table, because CCCBDB directly answered every field requested for all 10 molecules.

### How the numbers were verified (not just trusted)

WebFetch summarizes page content through a small model, which can hallucinate. Before
accepting any page's numbers, each molecule's data was cross-checked two ways:

1. **Mode-count consistency** — the sum of listed mode degeneracies must equal 3N−6 (or
   3N−5 for linear molecules) for that molecule's atom count. All 10 molecules pass
   exactly (verified programmatically; see below).
2. **ZPE consistency** — CCCBDB's reported "vibrational zero-point energy" must equal
   half the sum of the listed fundamental frequencies (weighted by degeneracy). All 10
   molecules pass to within ≤1.1 cm⁻¹ (ethanol, 21 modes each individually rounded to
   the nearest integer — well within expected rounding noise; every other molecule
   matches exactly).
3. **Spot-check against known literature values** — e.g. water's 3657/1595/3756 cm⁻¹
   triplet, methane's 2917/1534/3019/1306 cm⁻¹ set, and benzene's 20-line Wilson-mode
   assignment (992 cm⁻¹ ring-breathing mode, etc.) are textbook Herzberg-era values;
   entropies (H₂O 188.84, CO₂ 213.79, C₆H₆ 269.30 J/mol/K, etc.) match standard
   NIST-JANAF tables. This gives high confidence the fetched tables are genuine CCCBDB
   content, not fabricated by the fetch tool.

Verification script used (rerun any time to re-check the JSON after edits):

```python
import json
d = json.load(open("cccbdb_frequencies.json"))
for name, m in d["molecules"].items():
    modes = m["vibrational_modes"]
    total_deg = sum(mm["degeneracy"] for mm in modes)
    expected = m["mode_count"]["expected_real_modes"]
    zpe_half_sum = sum(mm["frequency_cm-1"] * mm["degeneracy"] for mm in modes) / 2.0
    zpe_reported = m["zero_point_energy"]["value_cm-1"]
    assert total_deg == expected, name
    assert abs(zpe_half_sum - zpe_reported) < 2.0, name
print("all consistent")
```

### Known caveats / things that are *not* fully clean

- **CCCBDB's "vibrational zero-point energy" is not a true harmonic ZPE.** It's
  computed as half the sum of the *experimental fundamentals* shown on the same page,
  which already contain real anharmonic content. A MACE Hessian's ZPE (half the sum of
  *harmonic* frequencies) is a different, larger quantity by construction. Don't diff
  them directly — see each molecule's `zero_point_energy.methodNote` in the JSON.
- **Rotational symmetry numbers are not tabulated per-species by CCCBDB.** They were
  derived by combining CCCBDB's own point-group determination for each species (which
  *is* on the experimental page, e.g. water = C2v) with CCCBDB's general
  symmetry-number-by-point-group table on
  [`thermox.asp`](https://cccbdb.nist.gov/thermox.asp) (Cₙᵥ → σ=n; Dₙₕ → σ=2n; Td → 12;
  Cs/C1/C∞ᵥ → 1). This derivation step is marked `sourceType: "computed"` in the JSON,
  distinct from the experimentally-measured point group it's built from.
- **Methanol and ethanol have low-frequency internal rotations** (CH₃ torsion at
  ~200 cm⁻¹ in both; also an OH torsion in ethanol) that CCCBDB lists as ordinary
  harmonic modes. Physically these are hindered rotors, and a rigorous treatment would
  use a separate internal symmetry number (3, for a methyl top) in a hindered-rotor
  partition function rather than folding it into the harmonic mode list. Expect these
  specific modes to be the worst match for any harmonic calculation (MACE included),
  independent of how good the potential energy surface is.
- **CO₂'s 1333 cm⁻¹ mode is Fermi-resonance-shifted** (textbook coupling between the
  symmetric stretch and the bend overtone) — the tabulated "fundamental" is the
  resonance-mixed experimental band position, not a clean single-mode value. A harmonic
  calculation has no Fermi resonance and will not reproduce this specific number well by
  construction, independent of the quality of the underlying potential.
- Enthalpies of formation and heat capacities were also retrieved from the same CCCBDB
  pages but were **not** included in the JSON — they weren't requested and would have
  expanded scope beyond the vibrational/entropy/ZPE feature being validated.

## Vibrational scaling factors: why they're needed

Computed harmonic frequencies are systematically higher than experimental fundamentals
for two separable reasons: the electronic-structure/PES description carries some method
error, and — independent of that — **the real potential energy surface is anharmonic**.
Near a bond-stretch minimum it's better approximated by a Morse-like potential, whose
vibrational levels `G(v) = ωₑ(v+½) − ωₑxₑ(v+½)² + ...` are more closely spaced than the
harmonic ladder; the observed 0→1 fundamental transition therefore always sits below the
underlying harmonic frequency ωₑ, even for an exact solution of a given PES. CCCBDB
states this directly on its scaling-factor justification page and notes that scale
factors in the 0.8–1.0 range are conventionally applied, with **different factors
appropriate for low- and high-frequency vibrations** — a single flat number is itself an
approximation.

CCCBDB's own compiled scale factors cluster by method quality: HF ≈0.90 (large
correction, since HF also carries large systematic method error on top of
anharmonicity), MP2 ≈0.94–0.96, B3LYP ≈0.96–0.97, PBE-type GGA functionals ≈0.98–0.99,
and CCSD(T) with a large basis ≈0.98–0.99 — the CCSD(T) number is the closest to a
*pure* anharmonicity-only correction, since method error is small at that level. A
representative literature value for a range-separated hybrid, wB97X-D/3-21G², is 0.955.

Sources:
- [CCCBDB vibrational scaling factor justification](https://cccbdb.nist.gov/vibscalejust.asp) — Morse-potential/anharmonicity explanation, 0.8–1.0 range
- [CCCBDB vibrational scaling factor tutorial](https://cccbdb.nist.gov/vibscalejustx.asp) — method-dependent factor ranges, low-vs-high-frequency note
- [CCCBDB wB97X-D/3-21G* scale factor table](https://cccbdb.nist.gov/vibscale2x.asp?method=60&basis=8) — 0.955
- Alecu, I. M.; Zheng, J.; Zhao, Y.; Truhlar, D. G. *Computational Thermochemistry: Scale
  Factor Databases and Scale Factors for Vibrational Frequencies Obtained from
  Electronic Model Chemistries.* J. Chem. Theory Comput. 2010, 6, 2872–2887.
  [DOI:10.1021/ct100326h](https://pubs.acs.org/doi/10.1021/ct100326h) — independent,
  widely-cited scale-factor compilation distinguishing harmonic/fundamental/ZPE scale
  factors as different quantities

## What MACE-OFF23 is actually documented to achieve on frequencies

**No published MACE-OFF23-vs-experiment frequency accuracy number was found.** Every
quantitative benchmark located compares MACE-OFF23 (or the wider MACE family) against a
*DFT* reference, never against experimental fundamentals directly:

- **Kovacs et al., MACE-OFF23 original paper** (arXiv:2312.15211 /
  [JACS 2025, 147, 17598](https://arxiv.org/abs/2312.15211)) — the abstract mentions
  "accurate secondary structure and vibrational spectrum" qualitatively (for a solvated
  protein MD trajectory) but reports no quantitative frequency MAE/RMSE. No numeric
  claim from the primary paper could be confirmed.
- **Pracht et al., *Efficient Composite Infrared Spectroscopy*, J. Chem. Theory Comput.
  2024, 20(24), 10986–11004** ([DOI:10.1021/acs.jctc.4c01157](https://doi.org/10.1021/acs.jctc.4c01157))
  — on the IR7193 benchmark (7193 gas-phase molecules, 3–77 atoms, H/C/N/O/F/Cl/Br/S/P),
  **MACE-OFF23 ZPVE MAE = 0.22–0.23 kcal/mol, RMSE = 0.30–0.31 kcal/mol against a
  B3LYP-3c DFT reference** (not experiment). This is the single most concrete
  MACE-OFF23 vibrational-accuracy number found anywhere, and it is a whole-molecule ZPVE
  error, not a per-mode frequency MAE, and it's DFT-referenced, not experiment-referenced.
- **Suárez-Dou et al., QVib benchmark, arXiv:2601.09845 (2026)** — introduces a
  293-molecule/1365-conformer benchmark against PBE0+MBD DFT (again not experiment).
  Reports qualitatively that "the MACE family provides the best overall agreement with
  the reference across both frequency MAE and IR-spectrum similarity metrics" among
  tested MLFFs, but also flags that ~90% (257/293) of its molecules have close chemical
  analogues in MACE-OFF23's training set — i.e. the benchmark is largely interpolative
  for MACE. No MACE-OFF23-specific aggregate cm⁻¹ number could be extracted from the
  accessible text (a worked example for a *different* model, SO3LR, on aspartame gives
  MAE = 8.2 cm⁻¹ vs PBE0+MBD — useful as an order-of-magnitude reference for a
  well-trained MLFF, but not a MACE-OFF23 figure).

**Bottom line, stated plainly:** there is currently no published MACE-OFF23-vs-experiment
frequency error in the literature we could locate. The only hard number is a
DFT-referenced ZPVE MAE (0.22–0.23 kcal/mol vs B3LYP-3c). Any tolerance for validating
this feature has to be built from that DFT-reference number plus the independent,
well-established, method-agnostic anharmonicity gap documented by CCCBDB — not from a
single MACE-specific ground-truth figure, because that figure doesn't appear to exist yet.

## Recommended pass/fail tolerance

**Apply a 0.97 scaling factor to the MACE harmonic frequency first, then require
agreement with the experimental fundamental within ±4% relative or ±50 cm⁻¹ absolute,
whichever is larger.**

Justification:

1. **Why scale first, and why 0.97.** MACE-OFF23 is trained on wB97M-D3BJ, a
   high-quality hybrid DFT functional, so its own method error relative to *that*
   reference should be small (bounded by the Pracht et al. ZPVE MAE, ≈0.22 kcal/mol
   ≈77 cm⁻¹ spread across all of a molecule's modes — a few cm⁻¹ per mode on average).
   The dominant harmonic-vs-experimental-fundamental gap is therefore anharmonicity, not
   MACE's own error, which is exactly the regime CCCBDB's high-quality-method scale
   factors (0.96–0.99) target. 0.97 is the midpoint of that band.
2. **Why the tolerance can't be a single flat cm⁻¹ number.** CCCBDB explicitly states
   that low- and high-frequency vibrations need different scale factors, and this
   dataset itself spans ~200 cm⁻¹ torsions (methanol, ethanol) to >3800 cm⁻¹ O–H/C–H
   stretches (water, methanol, ethanol, benzene). A flat absolute tolerance in cm⁻¹
   would be far too loose at 200 cm⁻¹ and far too tight at 3800 cm⁻¹; a flat percentage
   solves that but becomes unreasonably tight (a few cm⁻¹) for the lowest modes — hence
   the combined "relative-OR-absolute, whichever is larger" rule.
3. **Where the 4%/50 cm⁻¹ numbers come from, using this dataset's own cited CCCBDB
   values as the direct evidence:** water's CCCBDB-tabulated fundamental-vs-harmonic gap
   is −4.8% (3657 vs 3832 cm⁻¹, symmetric stretch), −4.9% (3756 vs 3943 cm⁻¹, asymmetric
   stretch), and −3.4% (1595 vs 1649 cm⁻¹, bend) — i.e. real, sourced anharmonicity gaps
   of 3–5% for a molecule this dataset already has verified data for. 4% sits inside that
   observed band with a small margin, rather than being picked arbitrarily. The 50 cm⁻¹
   absolute floor keeps low-frequency modes (torsions, ring puckers) from requiring
   sub-percent precision that neither CCCBDB's own scale-factor uncertainties nor MACE's
   documented DFT-reference error (point 1) can actually support.
4. **What this tolerance will *not* cleanly catch:** the CO₂ Fermi-resonance mode
   (1333 cm⁻¹) and the methanol/ethanol internal-rotation torsions are flagged in the
   JSON as cases where even a "correct" harmonic calculation is expected to disagree with
   the experimental fundamental by more than this tolerance, for reasons unrelated to the
   PES quality (resonance coupling, hindered-rotor physics). Treat failures on those
   specific modes as expected/informative rather than as evidence of a MACE calculation
   bug.

This is an engineering judgment built from the literature above, not a validated
MACE-OFF23-specific number — because, as documented, that number does not currently
exist. Revisit it if a direct MACE-OFF23-vs-experiment frequency benchmark is ever
published, and expect to widen it further for hindered-rotor modes regardless.

## File index

- `cccbdb_frequencies.json` — the dataset described above. Every leaf value has
  `"source"` (URL or citation) and `"sourceType"` (`"experimental"` or `"computed"`).
- `README.md` — this file.
