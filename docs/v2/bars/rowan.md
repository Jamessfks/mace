# Bar 1 — Rowan (rowansci.com)

Captured 2026-08-09 for SimpleAtom v2.0. Everything here was measured off the live
site, not read off marketing copy. Re-verify before trusting; sites change.

## Fetchability (this is what makes the bar usable)

| Surface | URL | Login? |
|---|---|---|
| Marketing site | https://rowansci.com | No |
| Feature list | https://rowansci.com/features | No |
| Docs | https://docs.rowansci.com | No |
| **Live production 3D viewer** | `https://labs.rowansci.com/iframe2/calculation/<uuid>?auto-rotate=false&no-border=true` | **No** |
| App (job config, results, workflows) | https://labs.rowansci.com | **Yes — not fetchable** |

Known-good public viewer instance (Maraviroc, AIMNet2 opt+freq):

```
https://labs.rowansci.com/iframe2/calculation/c1cd40a2-f781-4be0-8c68-b6b4e681b9b5?auto-rotate=false&no-border=true
```

The homepage hero embeds exactly this iframe. It is the real app component, not a
marketing mock — so the viewer piece has a fully interactive bar. **The job
configuration and results screens do not.** Any critic judging those is working from
the feature list and docs prose only, and must say so rather than inventing detail.

Note the shape of that URL: Rowan ships shareable single-calculation embeds. SimpleAtom
already has the same primitive in `app/r/[id]` (MACE Link). Direct comparison available.

## Design tokens (computed from the live DOM)

| Token | Value |
|---|---|
| Page background | `#FFFFFF` |
| Body text | `#181D18` (near-black, green cast) |
| Primary green | `#189143` |
| Bright green | `#24B256` |
| Sage / secondary | `#74967E` |
| Deep sage | `#5A7763` |
| Surface | `#F0F3F1` |
| Border | `#BACBBF` |
| Muted text | `#6E716E` |
| Dominant radius | `6px` (then `4px`, `8px`, full-round pills) |

Type: **Matter** (Displaay) — a *licensed commercial typeface*. Do not download, embed,
or copy it. Match the typographic **system**, not the face:

| Element | Size / leading | Weight |
|---|---|---|
| h1 | 48px / 48px (leading 1.0 — very tight) | 600 |
| h4 | 20px / 28px | 500 |
| body | 16px / 24px | 400 |
| button | 16px / 24px | 500 |

Layout: Tailwind. Hero container is `mx-auto max-w-5xl px-6 py-24`, viewer wrapper is
`aspect-square w-full max-w-md overflow-hidden rounded-lg`. So: 1024px max content
width, 24px gutters, 96px section rhythm, 8px card radius.

Their semantic token names, visible in class strings: `bg-primary-std`,
`hover:bg-primary-hover`, `active:bg-primary-act`, `bg-light_ac`, `bg-offlight`,
`border-dark_acc-std`, `text-light`. Useful as a naming pattern; the values are ours.

## The 3D viewer — the actual bar

Rendering:
- **WebGL2 canvas.** Backing buffer `1600×900` for an `800×450` CSS box — i.e. it
  renders at **devicePixelRatio 2**. This is the single most checkable quality gap:
  a viewer at DPR 1 looks visibly soft next to it.
- Ball-and-stick. Glossy specular highlights on atoms, dark contact outline, soft
  shadowing. Not flat shading.
- CPK coloring: C grey, H white, N blue, O red.
- Docs state Three.js/WebGL. `window.THREE` is not exposed (bundled).

Settings menu (gear icon) — exact item labels:
- `Rotate structure`
- `Manage molecule view`
- `Hide C–H bonds`
- `Download PNG`

Chrome: gear (settings) and expand (fullscreen) bottom-left, reset/refresh bottom-right.
A `View on Rowan` pill sits top-right on the embed.

Interaction (from docs, `docs.rowansci.com/tutorials/3d/viewer`):
- Drag to rotate, scroll/pinch to zoom, right-drag to pan, refresh icon resets.
- Click selects an atom → transparent green highlight. Ctrl/Cmd+drag = rectangular
  multiselect. Clicking a bond selects both its atoms.
- Selecting 2/3/4 atoms measures bond length / angle / dihedral. Result renders top-left.
  Selection order matters for angles and dihedrals.
- Hover shows an info box; selection info shows in a green box top-left.
- Where applicable it overlays computed properties (charges, Fukui indices, pKa).
  **SimpleAtom cannot do those three — MACE has no electron density.** Do not fake them.

## Scope honesty

Rowan's engine list includes DFT (~20 functionals), xTB, composite methods, and several
ML potentials — one of which is `MACE-MP-0b2(Large)`, the same family SimpleAtom runs.
v2.0 is scoped to MACE only, so the *methods* bar is deliberately not matched. Only the
interface, the viewer, and the workflows MACE genuinely supports are in scope.
