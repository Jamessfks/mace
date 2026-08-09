# Bar 2 — The Materials Project (next-gen.materialsproject.org)

Captured 2026-08-09 for SimpleAtom v2.0. Measured off the live site.

## Why this is the second bar

It covers the half of SimpleAtom that Rowan does not: periodic materials and crystals,
which is MACE-MP-0's home turf. And because MACE-MP-0 was trained on Materials Project
data, MP supplies the **numeric** half of the bar — published DFT reference values we
can hold SimpleAtom's numbers against. Taste plus a number.

## Fetchability — read this before judging anything

| Surface | Public? |
|---|---|
| Material detail pages (e.g. `/materials/mp-149`) | **Yes** |
| Summary property panel (formation energy, hull, band gap, space group) | **Yes** |
| Static crystal structure image | **Yes** |
| **Interactive crystal viewer** | **No — "Login or register to view an interactive crystal"** |
| REST API (`mp-api`) | Free key required |

Cloudflare shows a brief "Just a moment…" interstitial that clears on its own.

So: MP is a bar for **data presentation and scientific numbers**, not for viewer
interaction. Rowan is the viewer bar. A critic comparing SimpleAtom's viewer against MP
is comparing against a static PNG and should say so rather than pretend otherwise.

## What it does better than SimpleAtom (the judgeable part)

Reference page: `https://next-gen.materialsproject.org/materials/mp-149` (silicon).

Layout is a three-column result view:
- **Left** — identity block (formula glyph, `Si`, `mp-149`) plus a sticky table of
  contents: Summary, Crystal Structure, Properties, Property Origins, Contributed Data,
  Literature References, External Links, More, Related Materials.
- **Centre** — the structure, large, in a white card.
- **Right** — a dense key/value property card: Energy Above Hull, Space Group, Band Gap,
  Predicted Formation Energy, Magnetic Ordering, Total Magnetization, Experimentally
  Observed. Label left in bold, value right in blue, hairline rules between rows.

Two things to steal (as patterns, not pixels):
1. **Every value carries its unit inline** — `0.000 eV/atom`, `0.61 eV`, `0.00 µB/f.u.`
   No bare numbers. SimpleAtom's rules in CLAUDE.md demand this and it should be visible
   in the UI, not just the JSON.
2. **Provenance is a first-class section.** "Property Origins" and "Literature
   References" are peers of the data itself. This is the model for the calculation
   manifest / audit trail the v2.0 brief asks for.

Note their honesty pattern: the description is explicitly labelled
"Description (Auto-generated)". Machine-produced text is marked as such.

## Reference values for the numeric bar

Silicon, `mp-149`, from the public summary panel:

| Quantity | MP value |
|---|---|
| Energy above hull | 0.000 eV/atom |
| Predicted formation energy | 0.000 eV/atom |
| Band gap | 0.61 eV |
| Space group | Fd3̄m |

Caveats that must be respected when comparing MACE against these:
- MP values are **PBE(+U) DFT**, and MACE-MP-0 is trained to reproduce them — so
  agreement tests MACE's fit to PBE, *not* agreement with experiment. Do not present it
  as accuracy vs reality.
- Band gap is **not computable by MACE at all** (no electronic structure). Only
  energy-like quantities are comparable.
- MP total energies use VASP PAW reference states. Absolute energies are not directly
  comparable to MACE's; compare **formation energies** or **energy differences**, never
  raw totals.

Pulling more reference values needs a free `mp-api` key from the site. That is a
user-supplied credential — the key belongs in an env var, never committed.
