# Workflow illustrations

Seven original SVG illustrations, one per calculation type, authored from scratch
for SimpleAtom (no external image assets, no traced or copied artwork). They were
built for the workflow-card grid in the style of rowansci.com/features, but every
line, curve, and color in these files is hand-authored code — nothing was
downloaded, screenshotted, or derived from another site's imagery.

Where a real result file exists in this repo, the illustration is drawn from its
actual numbers rather than an invented shape. Where no such file exists for a
calculation type, the illustration is a physically-typical schematic (correct
qualitative shape, informed by the conventions in `CLAUDE.md`) rather than a
literal dataset.

## Files and their data sources

- **single-point.svg** — Real data. Ethane (C2H6) positions, symbols, and the
  per-atom force vectors from `docs/schemas/sample-scan-ethane.json` (top-level
  `positions` / `forces` / `symbols`, energy `-2173.3479...` eV). Projected onto
  the (x, z) plane. Force arrows are amplified for visibility (a uniform scale
  factor so the largest real force, ~0.0087 eV/Å, reads as a ~26 px arrow) —
  direction and relative magnitude between atoms are real; only the absolute
  pixel length is a display choice, same as any force-vector diagram.

- **geometry-opt.svg** — Mixed. The relaxed ("after") geometry is the real
  water minimum from `docs/schemas/sample-vibrations-water.json` (`positions`).
  The distorted ("before") ghost geometry and the RMS-force-vs-step convergence
  curve are illustrative — no real BFGS trajectory file exists in this repo for
  geometry-opt, so the curve is a schematic BFGS-typical decay (occasional small
  upward bumps, then a monotonic tail) crossing the project's fmax = 0.05 eV/Å
  convention from `CLAUDE.md`.

- **molecular-dynamics.svg** — Schematic. No real MD trajectory file exists in
  this repo, so the wandering path and the temperature trace are a deterministic
  sum of a few incommensurate sine waves (not a single "fake sine," and not
  literal MD output) shaped to look like a thermostatted NVT run: bounded
  wandering, and temperature fluctuating around a target with a dashed
  reference line — matching the real UI's own convention in
  `components/calculate/trajectory/trajectory-viewer.tsx` (temperature drawn in
  `DATA_COLORS.red`, "fluctuates around the target temperature" under NVT).

- **vibrations.svg** — Real data. Water's bending normal mode (1631.7 cm⁻¹)
  from `docs/schemas/sample-vibrations-water.json`: atom positions are the real
  relaxed geometry (`positions`), and the arrows are the real Cartesian
  displacement eigenvector (`vibrations.modes[0].displacementsAngstrom`),
  projected onto the (y, z) plane where the molecule actually lies (x ≈ 0 for
  all three atoms). The stick spectrum sits at the three real frequencies
  (`vibrations.frequenciesCm1`: 1631.7366, 3844.7052, 3948.9439 cm⁻¹) — the two
  stretches land only ~5 px apart at this scale because they are genuinely that
  close (≈104 cm⁻¹ apart). Stick height is uniform and is explicitly *not*
  intensity: the source file states IR intensities are unavailable for this
  model (no `dipole` in `MACECalculator.implemented_properties`), so no
  intensity is drawn or implied.

- **coordinate-scan.svg** — Real data. The full relaxed ethane dihedral scan
  from `docs/schemas/sample-scan-ethane.json` (`profile.x` in degrees,
  `profile.y` in eV, converted to kcal/mol for the label). All 13 real scan
  points are plotted; the barrier point (index 6, the eclipsed conformation) is
  ringed and labeled with the real barrier value, 2.487 kcal/mol
  (`scan.barrierKcalPerMol`). The Newman-projection hint beside the curve shows
  the staggered conformation (front bonds offset 60° from the back bonds) that
  the profile's two minima correspond to.

- **neb.svg** — Schematic. No real NEB result file exists in this repo. The
  asymmetric double-basin profile and the seven-image band are a physically
  typical CI-NEB illustration: images concentrate near the barrier, and the
  highest-energy image (ringed, "climbing image") sits exactly on the profile's
  true maximum, illustrating what climbing-image NEB is for for — driving that
  one image to converge on the saddle point rather than merely relaxing
  perpendicular to the band.

- **irc.svg** — Schematic. No real IRC result file exists in this repo. A
  single continuous steepest-descent curve (not a chain of discrete images,
  which is the real distinction from NEB) with a diamond marker at the saddle
  point and arrows descending in both directions toward the reactant and
  product minima.

## Palette tokens used (from `app/globals.css`)

All colors are written as `var(--color-token, #fallbackHex)` so the SVGs pick
up the live theme if ever inlined into the page, but render correctly standalone
via the hex fallback.

| Role | Token | Hex |
|---|---|---|
| Ink (atoms, bonds, saddle-path default) | `--color-text-primary` | `#262521` |
| Secondary ink (bonds, labels) | `--color-text-secondary` | `#5C574E` |
| Muted ink (captions, ghost outlines, axes) | `--color-text-muted` | `#8A8478` |
| Border / axis lines | `--color-border-emphasis` / `--color-border-subtle` | `#D8D2C6` / `#EAE6DD` |
| Card background | `--color-bg-elevated` | `#FFFFFF` |
| Accent green (vectors, converged/special points) | `--color-accent-strong` | `#3A7A40` |
| Oxygen atoms | `--color-data-red` (Paul Tol) | `#EE6677` |
| Energy / reaction-path curves | `--color-data-blue` (Paul Tol) | `#4477AA` |
| Scan/curve point markers | `--color-data-cyan` (Paul Tol) | `#66CCEE` |
| Vibrational stick spectrum | `--color-data-purple` (Paul Tol) | `#AA3377` |
| Temperature trace | `--color-data-red` (Paul Tol) | `#EE6677` |

Typography: numeric captions use a monospace stack
(`ui-monospace, "Geist Mono", monospace`) to match the app's scientific-data
convention.

## Conventions shared across all seven files

- `viewBox="0 0 280 180"`, no fixed `width`/`height` attribute, so each scales
  cleanly to any card size and stays crisp at 2x.
- `role="img"` plus a `<title>` and, where useful, a `<desc>` for accessibility.
- No gradients, no photographic texture, no clip-art — restrained line art and
  flat fills only, consistent with the app's calm/humanist visual language.
- Each file is 2.6–3.7 KB, well under the ~12 KB budget.
