# v2.0 — where the loop stands, and how to resume it

Written 2026-08-09 at the point the v2.0 branch was merged. This is the handover
document: what the method is, what is done, what is not, and the exact next move.

Live progress dashboard: `/v2` (reads `docs/v2/progress.json`).

---

## The method, in one paragraph

Every piece of work has a **bar** — a real, fetchable thing that is undeniably good — a
**builder**, and a separate **critic** with fresh context whose job is to find reasons ours
is worse. A piece is only done when the critic picks ours over the bar. Not a score out of
ten, which drifts upward every round. A pick. The exit is winning, or the user calling it —
never a fixed number of rounds.

The counter on `/v2` reads **0 of 13 pieces winning blind**. That is accurate and is not the
whole story: it counts only blind-comparison wins and deliberately says nothing about the
scientific defects fixed along the way, which is where most of the value landed. Both numbers
are shown on the page for that reason.

---

## The three bars

| Bar | Judges | Fetchable? |
|---|---|---|
| [Rowan](https://rowansci.com) | Interface quality, 3D viewer | Marketing site **and their live production viewer** are public. The app's job-config and results screens are **behind login**. |
| [Materials Project](https://next-gen.materialsproject.org/materials/mp-149) | Data density, scientific numbers | Property data public. Interactive crystal viewer **behind login**. |
| [ACEsuit/mace](https://github.com/ACEsuit/mace) | Scientific correctness | Fully public. Where SimpleAtom disagrees with upstream, SimpleAtom is wrong by definition. |

Details, measured tokens and the public viewer-embed URL are in `docs/v2/bars/`.

**Read this before judging anything:** only Rowan's *viewer* is genuinely interactive and
public. A critic judging the job-config or results screens is working from docs prose and
must say so rather than inventing the comparison. That is the single most common way this
method fails.

---

## Round-2 critic verdicts: three losses

| Piece | Verdict | Why |
|---|---|---|
| 3D viewer | **ROWAN** | Ambient occlusion never runs; canvas is an opaque white box on a warm page; framing solver misses its own target |
| Landing | **ROWAN** | A hard `<br/>` in the h1 forces four staircase lines and pushes all proof below the fold; body copy one step small |
| Nav | **ROWAN** | Per-route chrome widths move the wordmark 120px between pages |

Fixes for all three were dispatched and **may not have landed before the merge** — see
"Unfinished" below.

---

## Unfinished — start here

### In flight at merge time (verify before redoing)
Two builders were mid-task. Check `git log` and the files before assuming this work is missing.

1. **Viewer round 3** — `components/calculate/molecule-viewer-3d.tsx`
   - **AO has never actually run.** `rendersWithWebGL2()` calls `getContext("webgl2")` on the
     *visible* canvas, but `upscale: true` makes 3Dmol render into an `OffscreenCanvas` and
     blit, so the visible canvas holds a `bitmaprenderer` context and the check returns
     `null`. The guard disables AO on every load. Check `renderer._webglversion === 2`
     instead. The `AMBIENT_OCCLUSION` radius constant is therefore untested in reality.
   - Canvas should be `alpha: true` so the molecule sits on the page with no seam, as Rowan's
     does, instead of being an opaque `#FFFFFF` box inside an `#F3F0E8` card on `#FBFAF7`.
   - Framing solver never reaches its own `TARGET_FILL = 0.76`: ball-and-stick 0.705, stick
     0.734, spacefill 0.671 — spacefill ends up *smaller*, which is backwards.
   - `frameView()` is never re-run on container resize: 1280 → 375 gives fill 0.998, clipped.
   - `toggleFullscreen` has no `.catch()` and flips state optimistically; a rejected request
     leaves the component in CSS-fullscreen inside the hero column, clipping all four sides.
   - At 375px the toolbar overflows its card and the Fullscreen button is **unreachable**.

2. **Landing + nav round 2** — `components/intro-section.tsx`, `components/site-header.tsx`,
   `components/site-footer.tsx`
   - Delete the `<br/>` in the h1 (`intro-section.tsx` ~line 201). Fixes the rag *and*
     reclaims ~48px, lifting the proof strip from y=807 to ~759, above the fold.
   - Body copy and the primary CTA are 14px against the bar's 16px.
   - Radius scale is flat (six values, no dominant) against Rowan's four with 60% at 6px.
   - **Reverse the per-route chrome width.** Collapse `contentWidthClass()` to one site-wide
     width. Rowan uses one width everywhere and accepts the misalignment; a jump in
     persistent chrome is noticed, a static misalignment is not.

### Never started
| Piece | Notes |
|---|---|
| **Viewer selection & measurement** | The largest visible gap vs Rowan. Click an atom → highlight; two/three/four atoms → bond length / angle / dihedral readout. Serialised behind the render work (same file). |
| **Viewer chrome** | Settings menu parity: auto-rotate, hide C–H bonds, download PNG. Partly exists already. |
| **Provenance manifest** | Make any displayed number reproducible months later. Research recommends: model SHA256 (hashing a 134 MB checkpoint costs 0.06 s), `ase.db` logging, `pytest-regressions` + `hypothesis`. `pint` was evaluated and **rejected** — real per-op cost against a risk confined to a few known conversion sites. |
| **MACE Link share view** | Judge against Rowan's `iframe2` embed — they ship exactly this primitive. |
| **Benchmark vs MP** | The numeric half of the bar. Use the **unauthenticated** OPTIMADE endpoint (`optimade.materialsproject.org`), key `gga_gga+u` — MACE-MP-0 trained on PBE, not r2SCAN. Compare **formation energies**, never raw totals (different reference states). Band gap is **not computable** by MACE. |
| **Mobile** | Rowan's own mobile is weak — their hero molecule clips off-screen. Winnable. |

### Known defects, deliberately not fixed
- `mace-api/main.py` returns **HTTP 500** instead of 400 for a rejected `calculationType`, so
  the hosted FastAPI path reports the wrong status.
- **19 stale `mace-api/validate_calculation.py` references** remain outside the files fixed so
  far (README fixed; `app/docs/validation`, `app/docs/getting-started`, `docs/science/`,
  `docs/getting-started.md`, `mace-api/README.md`, `docs/architecture/`).
- **Audit finding 8**: the foundation-model comparison picks its baseline by substring-matching
  the uploaded *filename* for `"off"`/`"organic"` (`app/calculate/page.tsx` ~259). This can
  silently compare across two incompatible energy conventions.
- **Audit finding 6**: geometry-opt trajectories contain a duplicated frame 0 with off-by-one
  step labels — the message and the trajectory contradict each other.
- **Audit finding 10**: upstream computes stress on every call and it is discarded;
  `properties.pressure` is declared in the types and never populated.
- ASE's `get_temperature()` divides by 3N even with COM momentum pinned, so reported
  temperature reads ~11% low for a 9-atom molecule. The MD temperature chart shows it as-is.
- `components/calculate/results-display.tsx` is dead code (zero importers) still carrying the
  old mislabelling. A separate session was spawned to remove it.

---

## The pattern worth remembering

Five separate defects in this branch were **code that reviews as correct and does nothing at
runtime**. None would be caught by reading a diff:

1. `calculationType` had no allow-list — any unrecognised type silently ran a single-point
   and returned it as the requested calculation.
2. `modelType` had no allow-list — "custom" with no checkpoint returned MACE-MP-0 results
   labelled `custom`, shareable and PDF-exportable.
3. The validator's model-aware energy bounds were dead because `_build_result()` never echoed
   the `params` the validator reads.
4. The D3 toggle was live but a no-op for custom models, whose loader takes no dispersion arg.
5. The MACE-OFF element and NPT periodicity guards were implemented but inert because nothing
   passed the props.

And a sixth, found only because wiring the fifth forced the question "where is the lattice?":
`parseCIF` never converted fractional coordinates, loading silicon with nearest-neighbour
**0.433 Å instead of 2.3516 Å**.

**Lesson for whoever continues: verify by execution, never by reading.** Run the thing. The
`docs/v2/bars/` files exist so a critic can measure rather than assert.

---

## Resuming

```bash
git checkout -b v2.1 main
npm install && npm run dev          # dashboard at /v2
```

Verification gates that must stay green:

```bash
npm run build                                        # must compile
npx eslint .                                         # 37 known pre-existing problems
export KMP_DUPLICATE_LIB_OK=TRUE                     # else OMP Error #15
python3 test_scripts/validate_calculation.py --test  # all_passed: true
```

Guards that must keep failing loudly — if any of these ever returns a result, a regression
has reintroduced a silent fallthrough:

```bash
python3 mace-api/calculate_local.py public/demo/ethanol.xyz '{"calculationType":"phonon"}'
python3 mace-api/calculate_local.py public/demo/ethanol.xyz '{"modelType":"custom"}'
python3 mace-api/calculate_local.py public/demo/ethanol.xyz '{"modelType":"MACE-MP"}'
```

And the CIF fixture, which regresses to a 1 Å box if fractional-coordinate conversion breaks:
`public/demo/silicon.cif` — correct nearest-neighbour is **2.3516 Å** (a·√3/4).

---

Method credit: the gauntlet loop is [Matt Shumer's](https://github.com/mshumer); packaged as
a skill by [Jay E / RoboNuggets](https://robonuggets.com), CC BY 4.0.
