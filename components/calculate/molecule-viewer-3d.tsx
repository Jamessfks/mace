"use client";

/**
 * MoleculeViewer3D — Dual-engine 3D structure viewer.
 *
 * VIEWER ENGINES:
 *   1. 3Dmol.js (npm) — Full-featured: representations, force vectors, spin,
 *      atom selection + geometry measurement, C–H hiding, PNG export.
 *   2. WEAS (CDN) — Matches ml-peg (https://github.com/ddmms/ml-peg).
 *      Used for compatibility with the MACE team's ecosystem.
 *      See: https://github.com/superstar54/weas
 *
 * The user can toggle between the two engines via a button in the toolbar.
 * Both engines receive the same XYZ data built from the CalculationResult.
 *
 * NOTE ON FORCE VECTORS:
 *   Only 3Dmol.js supports force arrow overlays. When WEAS is active, the
 *   force toggle button is disabled.
 *
 * RENDER QUALITY CONTRACT (see docs/v2/bars/rowan.md):
 *   1. Retina — the WebGL backing store is always >= 2x the CSS box.
 *      3Dmol's Renderer.setSize() reads window.devicePixelRatio and, when
 *      `upscale` is on, floors it at 2. Both `antialias` and `upscale` are
 *      passed EXPLICITLY below so this does not depend on a library default.
 *      setSize() only runs from viewer.resize(), which 3Dmol fires on CSS-box
 *      changes only — so we additionally watch devicePixelRatio itself
 *      (see watchPixelRatio) and re-resize when it changes with no relayout
 *      (browser zoom, dragging the window to a display of different density).
 *   2. Framing — the structure is measured in screen space and fitted to
 *      TARGET_FILL of the canvas. 3Dmol's own zoomTo() leaves a small molecule
 *      at ~28% and cannot be corrected with a constant (see the framing block
 *      below). The fit is re-solved on every size change, including entering
 *      and leaving fullscreen.
 *   3. Shading — renderer-level dark contact outline + screen-space ambient
 *      occlusion, so overlapping atoms separate and contacts darken.
 *   4. Colours — Jmol CPK (C grey, H off-white, N blue, O red), with a
 *      luminance ceiling so nothing renders at the background colour. 3Dmol's
 *      built-in default is the washed-out RasMol table (C #C8C8C8, N #8F8FFF).
 *   5. Background — the canvas is TRANSPARENT (backgroundAlpha 0), so the
 *      molecule sits on whatever surface hosts the component instead of on an
 *      opaque rectangle of its own. This component therefore draws no card and
 *      no well: its callers own the surface. PNG export composites onto an
 *      opaque colour before download (see handleDownloadPng).
 *   6. Shape — the viewer box is `aspect-square` (capped in height), not a
 *      fixed 420 px. A fixed height makes a phone-width box 291x420 portrait,
 *      where a correct fit binds on the 291 px axis and leaves 45% of the box
 *      empty. The bar uses `aspect-square w-full max-w-md`.
 *
 * DEPENDENCIES:
 *   - 3dmol (npm)         — dynamically imported for 3Dmol.js mode
 *   - weas (CDN via iframe) — loaded at runtime for WEAS mode
 *   - ./weas-viewer.tsx   — WEAS iframe wrapper component
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  Eye,
  EyeOff,
  Circle,
  Box,
  Boxes,
  Settings2,
  Check,
  Download,
  Ruler,
  X,
} from "lucide-react";
import type { AtomSpec, AtomStyleSpec, GLViewer } from "3dmol";
import type { CalculationResult } from "@/types/mace";
import { WeasViewer } from "./weas-viewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Representation = "ball-and-stick" | "stick" | "spacefill";
type ViewerEngine = "3dmol" | "weas";

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface MoleculeViewer3DProps {
  result: CalculationResult;
}

/**
 * Snapshot of one 3Dmol atom taken once at load. Measurement and box-select
 * read this instead of re-querying the viewer, so a style rebuild mid-gesture
 * cannot change the coordinates a measurement was computed from.
 */
interface AtomRecord {
  /** 3Dmol's own atom index — the key used by every selection spec here. */
  index: number;
  elem: string;
  x: number;
  y: number;
  z: number;
  /** Indices of the atoms 3Dmol PERCEIVED a bond to (distance-based). */
  bonds: number[];
}

/** Everything the renderer needs to know about what should currently be drawn. */
interface ViewOptions {
  representation: Representation;
  showForces: boolean;
  hideNonpolarH: boolean;
  /** Ordered 3Dmol atom indices. Order is load-bearing: it sets the
   *  angle vertex and the dihedral sign. */
  selection: number[];
}

// ---------------------------------------------------------------------------
// 3Dmol.js render-quality settings
// ---------------------------------------------------------------------------

/**
 * Ceiling on the BASE colour's luminance, in 0-255. Jmol's hydrogen is
 * #FFFFFF, so without this every hydrogen's lit cap rendered at the background
 * colour and the atom dissolved into it, surviving only on its outline —
 * measured at 108 pixels of exactly (255,255,255) inside the silhouette.
 *
 * Set to 237 rather than 240: the canvas is now transparent and composites
 * onto the page tint #FBFAF7, whose luminance is ~250, not 255. The bar keeps
 * about 13 levels of headroom (its brightest pixel is 242 on a 255 page), and
 * 237 against 250 reproduces that same margin.
 *
 * This caps the base colour, NOT the rendered pixel. An earlier version of
 * this comment claimed 3Dmol's scene has a single directional light with no
 * ambient term, so output could never exceed base — that is false, and a
 * critic disproved it: oxygen's base is #FF0D0D yet its brightest rendered
 * pixel is (235,176,176), so green and blue land 163 above base. There is a
 * specular term. Grey and white are capped as intended (max measured exactly
 * 240); saturated colours can still blow toward pale. Ours reaches
 * (235,176,176) on oxygen where the bar holds (236,82,82) and keeps its hue —
 * their specular is tighter. Unfixed, and NOT addressed by this constant.
 *
 * Capping *luminance* (not per channel) darkens only the near-white entries and
 * leaves saturated colours alone: a red oxygen pixel at (255,13,13) has
 * luminance 64 and can never be confused with the background. Over the whole
 * 204-entry Jmol table this touches exactly four elements —
 *   H  #FFFFFF -> #F0F0F0     He #D9FFFF -> #D3F8F8
 *   Ce #FFFFC7 -> #F4F4BE     Pr #D9FFC7 -> #D6FCC5
 * C, N, O, F, P, S, Cl and every metal are unchanged.
 */
const WHITE_CEILING = 237;

/**
 * Ball-and-stick proportions. 3Dmol's `sphere.scale` multiplies the element's
 * van der Waals radius, so the ratio below is per element:
 *   C  (r_vdW 1.70) -> 0.374 A sphere / 0.15 A bond  = 2.49
 *   N  (r_vdW 1.55) -> 0.341 A                       = 2.27
 *   O  (r_vdW 1.52) -> 0.334 A                       = 2.23
 *   H  (r_vdW 1.20) -> 0.264 A                       = 1.76
 * Previously 0.30 / 0.25 — chunky spheres on very fat bonds. The bar renders
 * small spheres against a substantial bond radius; these numbers are the knob
 * to turn if a side-by-side still reads too heavy or too spindly.
 */
const SPHERE_SCALE = 0.22;
const BOND_RADIUS = 0.15;
const LICORICE_RADIUS = 0.18;
const SPACEFILL_SCALE = 1.0;

/** Fallback van der Waals radius, in Angstroms, for an element 3Dmol has no
 *  entry for. 1.2 A is hydrogen's — the smallest in the table, so an unknown
 *  element can only ever be UNDER-padded by the framing solver, never over. */
const FALLBACK_VDW = 1.2;

/**
 * Jmol CPK with the white cap applied — C grey, H off-white, N blue, O red.
 * 3Dmol's *default* table is RasMol (C #C8C8C8, N #8F8FFF, O #F00000), whose
 * carbon and nitrogen read as washed-out pastels on a white canvas.
 *
 * Built lazily because the source table lives on the dynamically imported
 * module. `{ prop, map }` is the shape 3Dmol uses for its own built-in schemes
 * (see getColorFromStyle in 3dmol/src/utilities.ts).
 */
type ElementScheme = { prop: "elem"; map: Record<string, number> };
let cpkScheme: ElementScheme | null = null;

/** van der Waals radii, cached off the imported module for framing maths. */
let vdwRadii: Record<string, number | undefined> | null = null;

/**
 * Dark contact outline — what separates overlapping atoms and keeps white
 * hydrogens visible against a white canvas.
 *
 * `width` is in view-space Angstroms, `maxpixels` caps the result in CSS pixels
 * (3Dmol multiplies the cap by devicePixelRatio internally, so the outline has
 * the same apparent weight at 1x and 2x). At typical framing — a ~12 A molecule
 * across an ~800 px canvas, so ~66 px/A — 0.05 A would project to ~3 px, and
 * the cap is what actually sets the weight. Zoomed out on a large slab the
 * width term takes over and the outline thins instead of swallowing the atoms.
 */
const OUTLINE = { width: 0.05, color: "#14171C", maxpixels: 2 };

/**
 * Screen-space ambient occlusion — soft contact shading where atoms meet.
 * `radius` is the occlusion sampling ray length in Angstroms (view space, not
 * pixels), so the width of the rim band ON SCREEN scales with radius x the
 * current pixels-per-Angstrom. Framing now fills the canvas ~2.7x more than it
 * used to, which would have widened the rim by the same factor and turned the
 * shading into an embossed vignette around every atom; 0.9 A holds the band at
 * roughly its previous absolute pixel width while the atoms themselves grew,
 * so it reads as contact shading rather than an outline glow. It also shrinks
 * the SSAO halo that leaks around silhouette edges (the depth-discontinuity
 * artifact behind occluded bonds). 3Dmol's default 5.0 A is longer than a whole
 * small molecule; strength 1.0 (also the default) crushes crevices to black.
 * WebGL2 only; also gated on atom count below.
 */
const AMBIENT_OCCLUSION = { strength: 0.6, radius: 0.9 };

/** Above this many atoms the SSAO depth pre-pass costs more than it buys. */
const AO_MAX_ATOMS = 600;

/** How long the pointer must rest on an atom before the info box appears. */
const HOVER_DURATION_MS = 140;

// ── Framing ────────────────────────────────────────────────────────────────
//
// 3Dmol's zoomTo() is badly under-zoomed for small structures. It sets the
// camera so the viewport half-height equals the largest centre-to-atom distance
// (3dmol/src/GLViewer.ts, zoomTo) — a 3D bounding-sphere radius, floored at
// `minimumZoomToDistance` = 5 A. Ethanol's atoms all sit within ~2.2 A of the
// centroid, so the floor wins outright and the molecule occupies ~28% of the
// short axis. It also ignores orientation: a flat molecule seen face-on gets
// the same fit as edge-on.
//
// Rather than multiplying by a constant (right for 9 atoms, clips at 75), the
// framing below measures the actual projected silhouette and solves for the
// zoom that lands it at TARGET_FILL, then re-measures. Cropping is impossible
// by construction for any structure size.

/**
 * Fraction of the binding axis the silhouette should span.
 *
 * WHY 0.82, AND WHY THE OLD 0.76 WAS CALIBRATED AGAINST A WRONG NUMBER:
 * this constant used to read "Bar measures 0.739" — a figure that appears
 * nowhere in docs/v2/bars/rowan.md and carries no record of the box it was
 * measured in. Fill on the binding axis is aspect-dependent, so a number
 * without its aspect ratio is not a target. The measurement that IS recorded
 * (docs/v2/progress.json) has the bar at 0.825 on its binding axis in an
 * 824x840 backing buffer — a 412x420 CSS box at DPR 2, byte-identical to the
 * buffer this component gets in the hero. So 0.76 was not "just under the
 * bar": it was 3% over an unattributed number and 8% under the only
 * attributed one.
 *
 * 0.82, not 0.825, because the remaining 18% of the box has to absorb things
 * the solver deliberately does not measure:
 *   - the contact outline, ~2 CSS px per side (OUTLINE.maxpixels);
 *   - the selection halo, which is +SELECTION_HALO_PAD (0.10 A) outside the
 *     drawn atom and is NOT re-framed when you click, so it must fit in the
 *     margin — ~4 px on spacefill, ~8 px on stick at a typical fit;
 *   - FRAMING_TOLERANCE, up to 0.5% of the fit;
 *   - the bar's own 0.825 being a single-aspect measurement of a single
 *     molecule. Matching it to three digits would be calibrating to noise for
 *     the second time.
 * At 412 CSS px that leaves ~37 px of margin per side on the binding axis,
 * against a worst case of roughly 10 px. Nothing above is aspect-dependent:
 * the solver takes min(width constraint, height constraint), so the binding
 * axis lands on TARGET_FILL and the other axis lands below it, at any shape
 * of box.
 *
 * KNOWN LIMIT, deliberately not fixed here: zoomTo() centres the CENTROID of
 * the atoms, not the centre of the projected bounding box, and the solver
 * fits the centroid-symmetric envelope so that neither side can crop. A
 * structure whose projected bbox centre is far from its centroid therefore
 * lands BELOW TARGET_FILL by exactly that asymmetry. Correcting it means
 * panning the model off 3Dmol's rotation centre, which makes rotate and spin
 * orbit rather than turn in place — a worse defect than a few percent of fill.
 */
const TARGET_FILL = 0.82;

/** Extra screen-pixel allowance for the outline, which sits outside the atom. */
const OUTLINE_PAD_PX = 3;

/** Measure/correct passes. Two is normally enough; the rest are insurance. */
const FRAMING_PASSES = 4;

/** Stop once the correction is this close to 1. */
const FRAMING_TOLERANCE = 0.005;

/** Hard ceiling on total zoom applied after zoomTo(), against runaway fits. */
const MAX_TOTAL_FRAMING_ZOOM = 8;

/** Floor, so a structure that would crop can always be pulled back. */
const MIN_TOTAL_FRAMING_ZOOM = 0.2;

/** Angstroms drawn per eV/A of force. Shared by the arrows and the framing. */
const FORCE_ARROW_SCALE = 5;

/** Shaft radius of a force arrow, in Angstroms. */
const FORCE_ARROW_RADIUS = 0.08;

/**
 * Framing pad for a force-arrow TIP, in Angstroms. 3Dmol's addArrow defaults
 * `radiusRatio` to 1.618034, so the cone at the tip is 0.08 x 1.618 = 0.129 A
 * across at its widest. 0.14 covers it.
 */
const FORCE_ARROW_PAD = 0.14;

/** Fallback canvas background if the theme token cannot be resolved. */
const FALLBACK_BACKGROUND = "#FFFFFF";

// ── Selection & measurement ────────────────────────────────────────────────

/** SimpleAtom's own accent green (--color-accent-primary), NOT Rowan's. */
const SELECTION_COLOUR = "#4F9A54";

/** Opacity of the translucent selection shell. */
const SELECTION_OPACITY = 0.45;

/** Angstroms the selection shell extends beyond the drawn atom. */
const SELECTION_HALO_PAD = 0.1;

/** Floor on the shell radius so it is still visible in the stick rep. */
const SELECTION_HALO_MIN = 0.3;

/** Drag shorter than this (CSS px) counts as a click, not a box-select. */
const MARQUEE_CLICK_SLOP_PX = 4;

/**
 * Extra CSS pixels of slack around a stick when deciding "did the user click
 * the bond rather than the atom". 3Dmol reports the nearer ATOM for a click
 * anywhere on that atom's half-cylinder and never says which geometry was hit,
 * so the atom-vs-bond distinction has to be re-derived in screen space here.
 */
const BOND_PICK_SLOP_PX = 3;

// ---------------------------------------------------------------------------
// Helpers — theme, WebGL, colour
// ---------------------------------------------------------------------------

/**
 * Resolve the canvas background from the theme instead of hard-coding it.
 * Light theme -> #FFFFFF (matches the bar); .dark -> the dark elevated surface.
 * 3Dmol's colour parser treats an unrecognised string as black, so anything
 * that is not an unambiguous hex/rgb() value falls back to white.
 */
function readCanvasBackground(host: HTMLElement): string {
  if (typeof window === "undefined") return FALLBACK_BACKGROUND;
  try {
    const value = window
      .getComputedStyle(host)
      .getPropertyValue("--color-bg-elevated")
      .trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
    if (/^rgba?\(/i.test(value)) return value;
  } catch {
    /* getComputedStyle can throw on detached nodes — use the fallback */
  }
  return FALLBACK_BACKGROUND;
}

/**
 * 3Dmol's ambient-occlusion path allocates depth/shading attachments that only
 * exist on a WebGL2 context; on WebGL1 it silently no-ops at best. Asking an
 * already-initialised canvas for "webgl2" returns the existing context if it is
 * WebGL2 and null otherwise — no second context is created.
 */
function rendersWithWebGL2(viewer: GLViewer): boolean {
  try {
    const renderer = viewer.getRenderer();
    if (!renderer) return false;

    // Ask the renderer what it actually created. Do NOT probe the visible
    // canvas: `upscale: true` makes 3Dmol render into an OffscreenCanvas and
    // blit the result, so the visible canvas holds a `bitmaprenderer` context
    // and getContext("webgl2") returns null even on a WebGL2 machine. That
    // false negative disabled ambient occlusion on every single load, which
    // in turn made the AO radius constant dead code.
    const version = (renderer as unknown as { _webglversion?: number })
      ._webglversion;
    if (typeof version === "number") return version === 2;

    // Older 3Dmol builds do not expose _webglversion. Fall back to the visible
    // canvas, which is only meaningful when we are not rendering offscreen.
    const canvas = renderer.getCanvas?.() as HTMLCanvasElement | undefined;
    return !!canvas?.getContext?.("webgl2");
  } catch {
    return false;
  }
}

/**
 * Scale a packed 0xRRGGBB colour down until its Rec.709 luminance is at most
 * WHITE_CEILING. Hue and saturation are preserved because all three channels
 * are scaled by the same factor.
 */
function capLuminance(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luminance <= WHITE_CEILING) return hex;
  const k = WHITE_CEILING / luminance;
  return (
    (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k)
  );
}

/**
 * Cache the Jmol table (white-capped) and the vdW radii off the imported
 * module. Both are static data on a singleton module, so building once is safe.
 */
function cacheColourTables($3Dmol: typeof import("3dmol")): void {
  if (!cpkScheme) {
    const jmol = $3Dmol.elementColors?.Jmol as
      | Record<string, number>
      | undefined;
    const map: Record<string, number> = {};
    for (const [element, colour] of Object.entries(jmol ?? {})) {
      if (typeof colour === "number") map[element] = capLuminance(colour);
    }
    cpkScheme = { prop: "elem", map };
  }
  if (!vdwRadii) {
    vdwRadii = $3Dmol.GLModel?.vdwRadii as
      | Record<string, number | undefined>
      | null;
  }
}

// ---------------------------------------------------------------------------
// Helpers — representation geometry
// ---------------------------------------------------------------------------

/** Style spec for a representation, using the white-capped CPK scheme. */
function repStyle(rep: Representation): AtomStyleSpec {
  // Falls back to the built-in scheme name if the module has not loaded yet;
  // in practice applyView only runs after cacheColourTables().
  const scheme = cpkScheme ?? "Jmol";
  switch (rep) {
    case "spacefill":
      // True van der Waals spacefill. Was 0.6, which is not spacefill.
      return { sphere: { scale: SPACEFILL_SCALE, colorscheme: scheme } };
    case "stick":
      // Licorice. showNonBonded keeps isolated atoms visible when 3Dmol's
      // distance-based bond perception finds no neighbours (ions, lone atoms).
      return {
        stick: {
          radius: LICORICE_RADIUS,
          colorscheme: scheme,
          showNonBonded: true,
        },
      };
    default:
      return {
        stick: { radius: BOND_RADIUS, colorscheme: scheme },
        sphere: { scale: SPHERE_SCALE, colorscheme: scheme },
      };
  }
}

/** van der Waals radius in Angstroms for one element symbol. */
function vdwRadius(elem: string | undefined): number {
  const e = elem ?? "C";
  const r =
    vdwRadii?.[e] ??
    vdwRadii?.[e.charAt(0).toUpperCase() + e.slice(1).toLowerCase()];
  return typeof r === "number" && r > 0 ? r : FALLBACK_VDW;
}

/**
 * Radius, in Angstroms, that THIS atom is actually drawn at in THIS
 * representation.
 *
 * THE FRAMING BUG THIS REPLACES: the old maxDrawnRadius() returned the largest
 * radius over every element PRESENT, and measureProjectedExtent added that one
 * number to the extreme projected coordinate — and to the force-arrow tips,
 * which have no sphere at all. The estimated silhouette was therefore
 *     max_i |x_i - centre|  +  max_i r_i
 * where the true silhouette is
 *     max_i ( |x_i - centre| + r_i ).
 * Those are equal only when the outermost atom is also the fattest one. The
 * gap is (max_i r_i - r_outermost) and it scales with the radii, so the
 * bulkier the representation the more the solver over-padded and the more it
 * under-zoomed: measured fill was stick 0.732 > ball-and-stick 0.703 >
 * spacefill 0.669 against a 0.76 target — the bulkiest representation came out
 * SMALLEST, which is backwards. With force arrows visible it was worse still,
 * because every arrow tip was padded by a full spacefill sphere radius (1.7 A
 * for carbon) that is not drawn anywhere near it.
 *
 * Per-atom radii make the estimate tight for every representation, so the
 * three now converge on the same fill instead of ranking by bulk.
 */
function drawnRadius(elem: string | undefined, rep: Representation): number {
  if (rep === "stick") return LICORICE_RADIUS;
  if (rep === "spacefill") return vdwRadius(elem) * SPACEFILL_SCALE;
  // Ball-and-stick: the sphere normally wins, but never report less than the
  // bond radius — the stick is drawn right through the atom centre.
  return Math.max(vdwRadius(elem) * SPHERE_SCALE, BOND_RADIUS);
}

/** Radius of the translucent selection shell drawn over a selected atom. */
function selectionHaloRadius(elem: string | undefined, rep: Representation) {
  return Math.max(
    drawnRadius(elem, rep) + SELECTION_HALO_PAD,
    SELECTION_HALO_MIN
  );
}

// ---------------------------------------------------------------------------
// Helpers — projection & framing
// ---------------------------------------------------------------------------

interface ProjectedExtent {
  halfWidth: number;
  halfHeight: number;
  viewHalfWidth: number;
  viewHalfHeight: number;
}

/** What the framing solver has to keep inside the frame. */
interface FrameSpec {
  rep: Representation;
  /** Atom indices currently styled away (hidden C–H hydrogens). */
  hidden: ReadonlySet<number>;
  /** Force-arrow tips — shapes, so selectedAtoms() cannot see them. */
  extra: Point3[];
}

/** Screen-space basis of the current projection, in CSS pixels per Angstrom. */
interface ProjectionBasis {
  /** Pixels per Angstrom at the probe point (perspective: depth-dependent). */
  pxPerAngstrom: number;
  /** Model-space unit vector that projects to screen +x with no y component. */
  screenX: Point3;
  /** Model-space unit vector that projects to screen +y with no x component. */
  screenY: Point3;
}

/**
 * Probe 3Dmol's own projection at `origin` and recover the screen basis.
 *
 * For a model rotation R followed by dropping the depth component, the screen
 * images of the model unit axes are the first two ROWS of R (times the scale).
 * So the model-space direction that maps to screen +x is the COLUMN vector
 * (a.x, b.x, c.x) where a, b, c are the projected images of e_x, e_y, e_z —
 * and it is perpendicular to the view axis by construction, which is what
 * makes it safe to offset a sphere along it under a perspective camera: the
 * offset changes screen x only, not depth. sum|P R e_i|^2 = 2 gives the scale
 * with no assumption about how the model is rotated.
 */
function probeProjection(
  viewer: GLViewer,
  origin: Point3
): ProjectionBasis | null {
  const probes = [
    origin,
    { x: origin.x + 1, y: origin.y, z: origin.z },
    { x: origin.x, y: origin.y + 1, z: origin.z },
    { x: origin.x, y: origin.y, z: origin.z + 1 },
  ];
  const screen = viewer.modelToScreen(probes) as Array<{
    x: number;
    y: number;
  }>;
  if (!Array.isArray(screen) || screen.length !== 4) return null;

  const o = screen[0];
  const ax = screen[1].x - o.x;
  const ay = screen[1].y - o.y;
  const bx = screen[2].x - o.x;
  const by = screen[2].y - o.y;
  const cx = screen[3].x - o.x;
  const cy = screen[3].y - o.y;

  const sumSquares = ax * ax + ay * ay + bx * bx + by * by + cx * cx + cy * cy;
  const pxPerAngstrom = Math.sqrt(sumSquares / 2);
  if (!Number.isFinite(pxPerAngstrom) || pxPerAngstrom <= 0) return null;

  const ux = ax;
  const uy = bx;
  const uz = cx;
  const un = Math.hypot(ux, uy, uz);
  const vx = ay;
  const vy = by;
  const vz = cy;
  const vn = Math.hypot(vx, vy, vz);
  if (!un || !vn) return null;

  return {
    pxPerAngstrom,
    screenX: { x: ux / un, y: uy / un, z: uz / un },
    screenY: { x: vx / vn, y: vy / vn, z: vz / vn },
  };
}

/**
 * Half-extent of the rendered silhouette and of the viewport, both in CSS
 * pixels, measured through 3Dmol's own projection. Returns null when the
 * viewer is not in a measurable state.
 *
 * Each drawn item contributes FOUR probes — its centre offset by its own
 * radius along +/-screenX and +/-screenY — so the sphere edge is projected by
 * 3Dmol rather than approximated with one shared radius and one shared scale.
 * That makes the estimate correct per atom AND correct under perspective (an
 * atom nearer the camera projects its own radius larger, and the probe follows
 * it), which is what the single `pad` term got wrong.
 */
function measureProjectedExtent(
  viewer: GLViewer,
  spec: FrameSpec
): ProjectedExtent | null {
  const canvas = viewer.getRenderer()?.getCanvas() as
    | HTMLCanvasElement
    | undefined;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const drawn: Array<{ p: Point3; r: number }> = [];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let atomCount = 0;

  for (const a of viewer.selectedAtoms({})) {
    if (
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(a.z)
    ) {
      continue;
    }
    if (typeof a.index === "number" && spec.hidden.has(a.index)) continue;
    const p = { x: a.x as number, y: a.y as number, z: a.z as number };
    drawn.push({ p, r: drawnRadius(a.elem, spec.rep) });
    sx += p.x;
    sy += p.y;
    sz += p.z;
    atomCount++;
  }
  if (atomCount === 0) return null;

  for (const p of spec.extra) drawn.push({ p, r: FORCE_ARROW_PAD });

  // Probe the projection at the centroid of the DRAWN atoms. Arrow tips are
  // excluded from the centroid so the probe point stays inside the molecule.
  const basis = probeProjection(viewer, {
    x: sx / atomCount,
    y: sy / atomCount,
    z: sz / atomCount,
  });
  if (!basis) return null;

  const { screenX: u, screenY: v } = basis;
  const probes: Point3[] = [];
  for (const { p, r } of drawn) {
    probes.push(
      { x: p.x + r * u.x, y: p.y + r * u.y, z: p.z + r * u.z },
      { x: p.x - r * u.x, y: p.y - r * u.y, z: p.z - r * u.z },
      { x: p.x + r * v.x, y: p.y + r * v.y, z: p.z + r * v.z },
      { x: p.x - r * v.x, y: p.y - r * v.y, z: p.z - r * v.z }
    );
  }

  const screen = viewer.modelToScreen(probes) as Array<{
    x: number;
    y: number;
  }>;
  if (!Array.isArray(screen) || screen.length !== probes.length) return null;

  // modelToScreen returns page coordinates, so build the viewport centre the
  // same way 3Dmol's canvasOffset() does.
  const doc = canvas.ownerDocument.documentElement;
  const left = rect.left + window.scrollX - doc.clientLeft;
  const top = rect.top + window.scrollY - doc.clientTop;
  const centreX = left + rect.width / 2;
  const centreY = top + rect.height / 2;

  let halfWidth = 0;
  let halfHeight = 0;
  for (const s of screen) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
    halfWidth = Math.max(halfWidth, Math.abs(s.x - centreX));
    halfHeight = Math.max(halfHeight, Math.abs(s.y - centreY));
  }

  return {
    halfWidth: halfWidth + OUTLINE_PAD_PX,
    halfHeight: halfHeight + OUTLINE_PAD_PX,
    viewHalfWidth: rect.width / 2,
    viewHalfHeight: rect.height / 2,
  };
}

/**
 * Fit the structure to TARGET_FILL of the canvas. zoomTo() first (it centres
 * the model and sets the slab), then measure the projected silhouette and
 * correct. Measuring after each correction absorbs perspective non-linearity,
 * force-arrow overhang and representation changes, so the same code frames a
 * 9-atom molecule and a 300-atom slab without clipping either. Used on load,
 * on representation change and on "reset view" so framing never differs.
 *
 * The final pass is a no-crop guard rather than a fit: if the silhouette is
 * still outside the viewport when the passes run out, zoom out until it is not.
 */
function frameView(viewer: GLViewer, spec: FrameSpec): void {
  viewer.zoomTo();

  let applied = 1;
  for (let pass = 0; pass < FRAMING_PASSES; pass++) {
    const extent = measureProjectedExtent(viewer, spec);
    if (!extent) break;
    if (extent.halfWidth <= 0 || extent.halfHeight <= 0) break;

    const wanted = Math.min(
      (extent.viewHalfWidth * TARGET_FILL) / extent.halfWidth,
      (extent.viewHalfHeight * TARGET_FILL) / extent.halfHeight
    );
    if (!Number.isFinite(wanted) || wanted <= 0) break;

    // Clamp the cumulative zoom, not just this step, so repeated passes can
    // never compound into a runaway.
    const step = Math.min(
      Math.max(wanted, MIN_TOTAL_FRAMING_ZOOM / applied),
      MAX_TOTAL_FRAMING_ZOOM / applied
    );
    if (Math.abs(step - 1) < FRAMING_TOLERANCE) break;

    viewer.zoom(step);
    applied *= step;
  }

  // No-crop guard. Costs one extra measurement and makes "nothing is ever
  // clipped" a checked property of the final state rather than of the loop.
  const finalExtent = measureProjectedExtent(viewer, spec);
  if (finalExtent) {
    const overflow = Math.max(
      finalExtent.halfWidth / finalExtent.viewHalfWidth,
      finalExtent.halfHeight / finalExtent.viewHalfHeight
    );
    if (Number.isFinite(overflow) && overflow > 1) {
      viewer.zoom(1 / overflow);
    }
  }

  viewer.render();
}

/**
 * Fire `onChange` whenever window.devicePixelRatio changes.
 *
 * 3Dmol recomputes the canvas backing store inside Renderer.setSize(), which
 * only runs from viewer.resize() — and 3Dmol only calls resize() when the CSS
 * box changes (its own ResizeObserver / window resize). Browser zoom and moving
 * the window between displays of different density change devicePixelRatio
 * WITHOUT changing the CSS box, so without this watcher the canvas keeps a
 * stale backing store and the render is visibly soft until an unrelated
 * relayout happens. Returns a disposer.
 */
function watchPixelRatio(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  let query: MediaQueryList | null = null;
  let disposed = false;

  function arm() {
    if (disposed) return;
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    if (typeof query.addEventListener !== "function") {
      query = null;
      return;
    }
    query.addEventListener("change", handle, { once: true });
  }

  function handle() {
    if (disposed) return;
    onChange();
    // The old query no longer matches; re-arm against the new ratio.
    arm();
  }

  arm();

  return () => {
    disposed = true;
    query?.removeEventListener("change", handle);
    query = null;
  };
}

/**
 * True when the element has a non-zero CSS box.
 *
 * 3Dmol sizes its framebuffer attachments from container.offsetWidth/Height at
 * createViewer() time and again on every resize(). A zero-size container
 * produces a zero-size attachment and the driver logs
 * `GL_INVALID_FRAMEBUFFER_OPERATION ... Attachment has zero size` on every
 * draw — 39 of them per Fast Refresh remount, because the replacement tree
 * mounts before layout. Every entry point that can reach setSize() is gated
 * on this.
 */
function hasSize(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
}

// ---------------------------------------------------------------------------
// Helpers — structure data
// ---------------------------------------------------------------------------

/** Tip coordinates of the drawn force arrows, for framing. Empty when hidden. */
function forceArrowTips(
  result: CalculationResult,
  forcesVisible: boolean
): Point3[] {
  if (!forcesVisible || !result.forces || !result.positions) return [];
  return result.forces.map((force, i) => {
    const pos = result.positions![i];
    return {
      x: pos[0] + force[0] * FORCE_ARROW_SCALE,
      y: pos[1] + force[1] * FORCE_ARROW_SCALE,
      z: pos[2] + force[2] * FORCE_ARROW_SCALE,
    };
  });
}

function buildXYZ(result: CalculationResult): string {
  if (!result.symbols || !result.positions) return "";
  const atomCount = result.symbols.length;
  let xyzData = `${atomCount}\n`;
  xyzData += `Energy: ${result.energy ?? "N/A"} eV\n`;
  result.symbols.forEach((symbol, i) => {
    const pos = result.positions![i];
    xyzData += `${symbol} ${pos[0].toFixed(6)} ${pos[1].toFixed(6)} ${pos[2].toFixed(6)}\n`;
  });
  return xyzData;
}

/** Snapshot the loaded model, including the bonds 3Dmol perceived. */
function collectAtoms(viewer: GLViewer): AtomRecord[] {
  const out: AtomRecord[] = [];
  for (const a of viewer.selectedAtoms({}) as AtomSpec[]) {
    if (typeof a.index !== "number") continue;
    if (
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(a.z)
    ) {
      continue;
    }
    out.push({
      index: a.index,
      elem: a.elem ?? "X",
      x: a.x as number,
      y: a.y as number,
      z: a.z as number,
      bonds: Array.isArray(a.bonds) ? [...a.bonds] : [],
    });
  }
  return out;
}

/**
 * Indices of hydrogens whose every perceived bond is to carbon.
 *
 * The bar's gear item is labelled "Hide C–H bonds"; what that conventionally
 * means in a structure viewer is hiding the nonpolar hydrogens themselves, not
 * leaving them floating unbonded. Hiding the atom hides the bond too:
 * GLModel.drawBondSticks skips a bond whose partner has no stick style
 * (`if (!style2.stick || style2.stick.hidden) continue`), so styling these
 * atoms to {} removes both ends. Polar hydrogens (O–H, N–H, S–H) and isolated
 * hydrogens are kept — they are the chemically interesting ones.
 */
function nonpolarHydrogens(atoms: AtomRecord[]): number[] {
  const byIndex = new Map<number, AtomRecord>();
  for (const a of atoms) byIndex.set(a.index, a);
  const out: number[] = [];
  for (const a of atoms) {
    if (a.elem !== "H") continue;
    if (a.bonds.length === 0) continue;
    if (a.bonds.every((b) => byIndex.get(b)?.elem === "C")) out.push(a.index);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers — geometry measurement (Angstroms and degrees)
// ---------------------------------------------------------------------------

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Point3, b: Point3): Point3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(a: Point3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function scale(a: Point3, k: number): Point3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

/** Straight-line separation in ANGSTROMS. Says nothing about bonding. */
function distanceAngstrom(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Angle at vertex `b`, in DEGREES, in [0, 180]. */
function angleDegrees(a: Point3, b: Point3, c: Point3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const nu = norm(u);
  const nv = norm(v);
  if (nu === 0 || nv === 0) return NaN;
  const cosine = Math.min(1, Math.max(-1, dot(u, v) / (nu * nv)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * Signed torsion a-b-c-d about the b-c axis, in DEGREES, in (-180, 180].
 * Standard IUPAC sign convention; swapping the order of the four atoms flips
 * the sign, which is exactly why selection ORDER is preserved.
 */
function dihedralDegrees(a: Point3, b: Point3, c: Point3, d: Point3): number {
  const b0 = sub(a, b);
  const b1raw = sub(c, b);
  const b2 = sub(d, c);
  const n1 = norm(b1raw);
  if (n1 === 0) return NaN;
  const b1 = scale(b1raw, 1 / n1);
  const v = sub(b0, scale(b1, dot(b0, b1)));
  const w = sub(b2, scale(b1, dot(b2, b1)));
  if (norm(v) === 0 || norm(w) === 0) return NaN;
  const x = dot(v, w);
  const y = dot(cross(b1, v), w);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** "C3" — element plus 1-based position in the XYZ, which is what users see. */
function atomLabel(a: AtomRecord): string {
  return `${a.elem}${a.index + 1}`;
}

interface Measurement {
  /** e.g. "Bond length", "Distance", "Angle", "Dihedral". */
  kind: string;
  /** Formatted value INCLUDING its unit. Never a bare number. */
  value: string;
  /** e.g. "C3 – C2 – O1". */
  path: string;
  /** Present when the readout needs a caveat (unbonded pair, too many atoms). */
  note?: string;
}

/**
 * Turn an ordered selection into a measurement.
 *
 * Deliberately conservative about chemistry: two atoms are reported as a
 * "Bond length" only when 3Dmol's own distance-based perception put a bond
 * between them, and as a plain "Distance" otherwise. MACE does not give us
 * bond orders and this component must not invent them.
 */
function describeSelection(
  selected: AtomRecord[]
): Measurement | null {
  if (selected.length < 2) return null;
  const path = selected.map(atomLabel).join(" – ");

  if (selected.length === 2) {
    const [a, b] = selected;
    const bonded = a.bonds.includes(b.index) || b.bonds.includes(a.index);
    return {
      kind: bonded ? "Bond length" : "Distance",
      value: `${distanceAngstrom(a, b).toFixed(3)} Å`,
      path,
      note: bonded
        ? undefined
        : "3Dmol perceived no bond here — geometric separation only",
    };
  }

  if (selected.length === 3) {
    const [a, b, c] = selected;
    return {
      kind: "Angle",
      value: `${angleDegrees(a, b, c).toFixed(2)}°`,
      path,
      note: `vertex ${atomLabel(b)}`,
    };
  }

  if (selected.length === 4) {
    const [a, b, c, d] = selected;
    return {
      kind: "Dihedral",
      value: `${dihedralDegrees(a, b, c, d).toFixed(2)}°`,
      path,
      note: `about ${atomLabel(b)}–${atomLabel(c)}`,
    };
  }

  return {
    kind: `${selected.length} atoms selected`,
    value: "—",
    path,
    note: "select 2, 3 or 4 atoms to measure",
  };
}

// ---------------------------------------------------------------------------
// Helpers — picking
// ---------------------------------------------------------------------------

/** Page coordinates of a mouse or touch event, or null if it has none. */
function eventPagePoint(
  event: MouseEvent | TouchEvent | undefined
): { x: number; y: number } | null {
  if (!event) return null;
  const touchEvent = event as TouchEvent;
  const touch =
    touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0] ?? undefined;
  const source = touch ?? (event as MouseEvent);
  const cx = (source as { clientX?: number }).clientX;
  const cy = (source as { clientY?: number }).clientY;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return { x: cx + window.scrollX, y: cy + window.scrollY };
}

/**
 * Decide whether a click on `atom` landed on the atom itself or on one of its
 * bonds, and return the atoms to select.
 *
 * 3Dmol reports the nearer ATOM for a click anywhere on that atom's half of a
 * stick and does not say which geometry was hit, so the distinction is
 * re-derived here in screen space: inside the projected sphere -> the atom;
 * otherwise, whichever bonded neighbour's projected segment the click sits on
 * -> both atoms of that bond, in [clicked, neighbour] order.
 *
 * Falls back to the single atom whenever the geometry cannot be resolved.
 */
function resolvePick(
  viewer: GLViewer,
  atom: AtomRecord,
  byIndex: Map<number, AtomRecord>,
  hidden: ReadonlySet<number>,
  rep: Representation,
  event: MouseEvent | TouchEvent | undefined
): number[] {
  const click = eventPagePoint(event);
  if (!click || rep === "spacefill") return [atom.index];

  const basis = probeProjection(viewer, atom);
  if (!basis) return [atom.index];

  const neighbours = atom.bonds
    .map((b) => byIndex.get(b))
    .filter((n): n is AtomRecord => !!n && !hidden.has(n.index));

  const points = [atom, ...neighbours].map((a) => ({
    x: a.x,
    y: a.y,
    z: a.z,
  }));
  const screen = viewer.modelToScreen(points) as Array<{
    x: number;
    y: number;
  }>;
  if (!Array.isArray(screen) || screen.length !== points.length) {
    return [atom.index];
  }

  const atomScreen = screen[0];
  const atomRadiusPx = drawnRadius(atom.elem, rep) * basis.pxPerAngstrom;
  const distToCentre = Math.hypot(
    click.x - atomScreen.x,
    click.y - atomScreen.y
  );
  if (distToCentre <= atomRadiusPx) return [atom.index];

  const stickPx =
    (rep === "stick" ? LICORICE_RADIUS : BOND_RADIUS) * basis.pxPerAngstrom +
    BOND_PICK_SLOP_PX;

  let best: { index: number; d: number } | null = null;
  for (let i = 0; i < neighbours.length; i++) {
    const nScreen = screen[i + 1];
    const d = pointToSegmentDistance(click, atomScreen, nScreen);
    if (d <= stickPx && (!best || d < best.d)) {
      best = { index: neighbours[i].index, d };
    }
  }

  return best ? [atom.index, best.index] : [atom.index];
}

function pointToSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * Toggle semantics for a pick. A pick is one atom (atom click) or two (bond
 * click). Clicking something already selected removes it; otherwise it is
 * appended, so ORDER follows the clicks — which is what makes the angle vertex
 * and the dihedral sign predictable.
 */
function togglePick(current: number[], picked: number[]): number[] {
  if (picked.length === 0) return current;
  const allPresent = picked.every((i) => current.includes(i));
  if (allPresent) return current.filter((i) => !picked.includes(i));
  const next = [...current];
  for (const i of picked) if (!next.includes(i)) next.push(i);
  return next;
}

// ---------------------------------------------------------------------------
// Helpers — rendering the current view
// ---------------------------------------------------------------------------

/**
 * Apply representation, C–H hiding, force arrows and selection shells.
 *
 * Everything drawn as a SHAPE (arrows, selection shells) is torn down and
 * rebuilt here, because 3Dmol has no per-shape identity we can diff against.
 * Order matters: the base style first, then the hidden set on top of it —
 * setStyle replaces rather than merges when `add` is falsy.
 */
function applyView(
  viewer: GLViewer,
  result: CalculationResult,
  atoms: AtomRecord[],
  opts: ViewOptions,
  hidden: readonly number[]
): void {
  viewer.removeAllShapes();
  viewer.setStyle({}, repStyle(opts.representation));
  if (opts.hideNonpolarH && hidden.length > 0) {
    viewer.setStyle({ index: [...hidden] }, {});
  }
  viewer.render();

  if (result.forces && result.positions && opts.showForces) {
    result.forces.forEach((force, i) => {
      const pos = result.positions![i];
      if (!pos) return;
      viewer.addArrow({
        start: { x: pos[0], y: pos[1], z: pos[2] },
        end: {
          x: pos[0] + force[0] * FORCE_ARROW_SCALE,
          y: pos[1] + force[1] * FORCE_ARROW_SCALE,
          z: pos[2] + force[2] * FORCE_ARROW_SCALE,
        },
        radius: FORCE_ARROW_RADIUS,
        color: "#228833", // Paul Tol green — matches "force vectors" legend
      });
    });
  }

  if (opts.selection.length > 0) {
    const hiddenSet = opts.hideNonpolarH ? new Set(hidden) : new Set<number>();
    const byIndex = new Map(atoms.map((a) => [a.index, a]));
    for (const index of opts.selection) {
      const atom = byIndex.get(index);
      if (!atom || hiddenSet.has(index)) continue;
      viewer.addSphere({
        center: { x: atom.x, y: atom.y, z: atom.z },
        radius: selectionHaloRadius(atom.elem, opts.representation),
        color: SELECTION_COLOUR,
        opacity: SELECTION_OPACITY,
      });
    }
  }

  viewer.render();
}

// ---------------------------------------------------------------------------
// Presentational bits
// ---------------------------------------------------------------------------

/**
 * Square icon button. Module scope, not a closure inside the component: a
 * component identity that changes every render remounts every button on every
 * keystroke, which drops focus and restarts CSS transitions.
 */
function ToolbarButton({
  onClick,
  title,
  active,
  children,
  disabled,
  pressed,
  expanded,
  hasPopup,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  /** Sets aria-pressed. Omit for buttons that are actions, not toggles. */
  pressed?: boolean;
  expanded?: boolean;
  hasPopup?: "menu";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      className={`flex h-8 w-8 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
          : "border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]/60 hover:text-[var(--color-accent-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

/** One row of the gear menu. */
function MenuItem({
  onClick,
  label,
  hint,
  checked,
  icon,
  disabled,
}: {
  onClick: () => void;
  label: string;
  hint?: string;
  /** Present => rendered as a checkable item with role="menuitemcheckbox". */
  checked?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const checkable = typeof checked === "boolean";
  return (
    <button
      type="button"
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? checked : undefined}
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-accent-primary)]/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-accent-primary)]">
        {checkable ? checked ? <Check className="h-3.5 w-3.5" /> : null : icon}
      </span>
      <span className="flex-1 whitespace-nowrap font-mono">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MoleculeViewer3D({ result }: MoleculeViewer3DProps) {
  // Viewer engine: user can toggle between 3Dmol.js and WEAS
  const [engine, setEngine] = useState<ViewerEngine>("3dmol");

  // 3Dmol.js state
  const viewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<GLViewer | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pixelRatioWatcherRef = useRef<(() => void) | null>(null);
  /** Latest resize+reframe closure, so fullscreen changes can re-solve the fit. */
  const resizeRef = useRef<() => void>(() => {});

  const [representation, setRepresentation] =
    useState<Representation>("ball-and-stick");
  const [showForces, setShowForces] = useState(true);
  const [hideNonpolarH, setHideNonpolarH] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [spin, setSpin] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Atom snapshot + derived sets. Populated once the model is parsed.
  const [atoms, setAtoms] = useState<AtomRecord[]>([]);
  const atomsRef = useRef<AtomRecord[]>([]);
  const hiddenRef = useRef<number[]>([]);

  // The viewer-init effect and the 3Dmol click/hover callbacks are registered
  // once, so they cannot close over state. They read this instead.
  const optionsRef = useRef<ViewOptions>({
    representation,
    showForces,
    hideNonpolarH,
    selection,
  });

  // Hover info box, positioned relative to the viewer box.
  const [hover, setHover] = useState<{
    text: string;
    detail: string;
    x: number;
    y: number;
  } | null>(null);

  // Ctrl/Cmd-drag rectangular multiselect.
  const [modifierHeld, setModifierHeld] = useState(false);
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  /**
   * Live width of the viewer box, in CSS px. Only used to size the WEAS
   * iframe: WeasViewer takes a NUMBER of pixels, so it cannot inherit the
   * `aspect-square` box the 3Dmol path uses and would otherwise render 420 px
   * tall inside a 291 px box on a phone and be clipped by overflow-hidden.
   */
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setBoxWidth(box.clientWidth);
    });
    observer.observe(box);
    setBoxWidth(box.clientWidth);
    return () => observer.disconnect();
  }, []);

  const xyzData = useMemo(() => buildXYZ(result), [result]);
  const hasForces = !!result.forces?.length;
  const is3Dmol = engine === "3dmol";

  /** Hydrogens the "Hide C–H bonds" item can hide, derived from the model. */
  const hiddenIndices = useMemo(() => nonpolarHydrogens(atoms), [atoms]);

  /** Empty unless hiding is on — this is what "currently not drawn" means. */
  const hiddenSet = useMemo(
    () => (hideNonpolarH ? new Set(hiddenIndices) : new Set<number>()),
    [hideNonpolarH, hiddenIndices]
  );

  // Mirror for the imperative paths (3Dmol click/hover callbacks and the
  // resize closure) that are registered once and cannot see React state.
  useEffect(() => {
    hiddenRef.current = hiddenIndices;
  }, [hiddenIndices]);

  const selectedAtoms = useMemo(() => {
    const byIndex = new Map(atoms.map((a) => [a.index, a]));
    return selection
      .map((i) => byIndex.get(i))
      .filter((a): a is AtomRecord => !!a);
  }, [atoms, selection]);

  const measurement = useMemo(
    () => describeSelection(selectedAtoms),
    [selectedAtoms]
  );

  // ── Keep the ref the 3Dmol callbacks read in sync ──
  // Declared FIRST so it runs before the effects below in the same commit.
  useEffect(() => {
    optionsRef.current = {
      representation,
      showForces,
      hideNonpolarH,
      selection,
    };
  }, [representation, showForces, hideNonpolarH, selection]);

  // ── 3Dmol.js: initialize viewer ──
  useEffect(() => {
    // Only run when 3Dmol engine is active
    if (engine !== "3dmol") return;
    const host = viewerRef.current;
    if (!host || !result.positions || !result.symbols) return;

    setLoading(true);

    // resize() -> Renderer.setSize() -> canvas.width = cssWidth * dpr.
    // This is the only place the backing-store resolution is recomputed, so it
    // is driven by BOTH the ResizeObserver (CSS box) and the DPR watcher.
    const resize = () => {
      const v = viewerInstance.current;
      // Size guard: a zero-size container makes 3Dmol allocate a zero-size
      // framebuffer attachment, which the driver rejects on every draw.
      if (!v || !hasSize(viewerRef.current)) return;
      v.resize();
      // Re-solve the fit. Without this a 1280 -> 375 change takes the fill from
      // 0.705 to 0.998 with the molecule clipped at both edges, because the fit
      // was solved for the old aspect ratio and zoom is not recomputed by
      // resize(). Measured; Reset view recovered it, which is what identified
      // this as a missing frameView() rather than a solver bug.
      const opts = optionsRef.current;
      frameView(v, {
        rep: opts.representation,
        hidden: opts.hideNonpolarH
          ? new Set(hiddenRef.current)
          : new Set<number>(),
        extra: forceArrowTips(result, opts.showForces),
      });
      v.render();
    };
    resizeRef.current = resize;

    let cancelled = false;
    let sizeWatcher: ResizeObserver | null = null;

    const boot = ($3Dmol: typeof import("3dmol")) => {
      if (cancelled || !result.symbols || !result.positions) return;
      if (!hasSize(host)) return;

      host.innerHTML = "";
      cacheColourTables($3Dmol);

      const atomCount = result.symbols.length;
      const viewer = $3Dmol.createViewer(host, {
        // Transparent canvas. The bar renders its molecule straight onto the
        // page; ours was an opaque rectangle inside a card on a warm canvas —
        // three background values and a hard-edged box, which read as a pasted
        // screenshot rather than an object. backgroundColor is still supplied
        // because it is the colour PNG export composites onto (3Dmol itself
        // does NOT use it for export — pngURI() just reads the transparent
        // canvas, so the compositing happens in handleDownloadPng).
        backgroundColor: readCanvasBackground(host),
        backgroundAlpha: 0,
        // Retina. antialias defaults to true inside GLViewer today and upscale
        // defaults to antialias, but both are stated here so the >= 2x backing
        // store is a property of this component, not of a library default.
        antialias: true,
        upscale: true,
        // Dark contact outline around every atom and bond.
        outline: OUTLINE,
        // Soft contact shading. Skipped for large systems (extra depth pass).
        ambientOcclusion:
          atomCount <= AO_MAX_ATOMS ? AMBIENT_OCCLUSION : undefined,
        // 3Dmol's default is 500 ms, which reads as an unresponsive tooltip.
        hoverDuration: HOVER_DURATION_MS,
      });
      viewerInstance.current = viewer;

      // AO needs the WebGL2 framebuffer attachments; drop it otherwise.
      if (!rendersWithWebGL2(viewer)) {
        viewer.getRenderer()?.disableAmbientOcclusion();
      }

      viewer.addModel(xyzData, "xyz");
      viewer.enableFog(false);

      const records = collectAtoms(viewer);
      atomsRef.current = records;
      hiddenRef.current = nonpolarHydrogens(records);
      setAtoms(records);
      setSelection([]);

      const byIndex = new Map(records.map((a) => [a.index, a]));

      // ── Click: select an atom, or both atoms of a bond ──
      viewer.setClickable(
        {},
        true,
        (
          clicked: AtomSpec,
          _v: GLViewer,
          event: MouseEvent | TouchEvent | undefined
        ) => {
          if (typeof clicked.index !== "number") return;
          const atom = byIndex.get(clicked.index);
          if (!atom) return;
          const opts = optionsRef.current;
          const hiddenNow = opts.hideNonpolarH
            ? new Set(hiddenRef.current)
            : new Set<number>();
          if (hiddenNow.has(atom.index)) return;
          const picked = resolvePick(
            viewer,
            atom,
            byIndex,
            hiddenNow,
            opts.representation,
            event
          );
          setSelection((current) => togglePick(current, picked));
        }
      );

      // ── Hover: identity + coordinates + force magnitude, all with units ──
      viewer.setHoverable(
        {},
        true,
        (
          hovered: AtomSpec,
          _v: GLViewer,
          event: MouseEvent | TouchEvent | undefined
        ) => {
          if (typeof hovered.index !== "number") return;
          const atom = byIndex.get(hovered.index);
          const box = boxRef.current;
          if (!atom || !box) return;
          const point = eventPagePoint(event);
          if (!point) return;
          const rect = box.getBoundingClientRect();
          const force = result.forces?.[atom.index];
          const magnitude = force
            ? Math.hypot(force[0], force[1], force[2])
            : null;
          // Clamp so the info box cannot hang off either edge of the viewer.
          const localX = point.x - window.scrollX - rect.left;
          const localY = point.y - window.scrollY - rect.top;
          setHover({
            text: atomLabel(atom),
            detail:
              `${atom.x.toFixed(3)}, ${atom.y.toFixed(3)}, ${atom.z.toFixed(3)} Å` +
              (magnitude === null ? "" : ` · |F| ${magnitude.toFixed(3)} eV/Å`),
            x: Math.min(Math.max(localX, 90), Math.max(90, rect.width - 90)),
            y: Math.min(Math.max(localY, 40), rect.height),
          });
        },
        () => setHover(null)
      );

      const opts = optionsRef.current;
      applyView(viewer, result, records, { ...opts, selection: [] }, hiddenRef.current);
      frameView(viewer, {
        rep: opts.representation,
        hidden: opts.hideNonpolarH
          ? new Set(hiddenRef.current)
          : new Set<number>(),
        extra: forceArrowTips(result, opts.showForces),
      });

      resize();
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(host);
      pixelRatioWatcherRef.current = watchPixelRatio(resize);
      setLoading(false);
    };

    import("3dmol").then(($3Dmol) => {
      if (cancelled) return;
      if (hasSize(host)) {
        boot($3Dmol);
        return;
      }
      // Zero-size container — typically the Fast Refresh remount path, where
      // the replacement tree mounts before layout. Wait rather than creating a
      // viewer against a zero-size framebuffer.
      sizeWatcher = new ResizeObserver(() => {
        if (cancelled || !hasSize(host)) return;
        sizeWatcher?.disconnect();
        sizeWatcher = null;
        boot($3Dmol);
      });
      sizeWatcher.observe(host);
    });

    return () => {
      cancelled = true;
      sizeWatcher?.disconnect();
      sizeWatcher = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      pixelRatioWatcherRef.current?.();
      pixelRatioWatcherRef.current = null;
      // 3Dmol installs its OWN ResizeObserver and IntersectionObserver on the
      // container and never removes them. On unmount the container collapses
      // to 0x0, those observers fire, and resize() reallocates a zero-size
      // framebuffer on a viewer nobody is looking at. Reaching into the
      // private fields is deliberate; both accesses are optional.
      const dying = viewerInstance.current as unknown as {
        divwatcher?: { disconnect?: () => void };
        intwatcher?: { disconnect?: () => void };
      } | null;
      dying?.divwatcher?.disconnect?.();
      dying?.intwatcher?.disconnect?.();
      viewerInstance.current?.clear();
      viewerInstance.current = null;
      // `host`, not viewerRef.current: the ref may already point elsewhere by
      // the time cleanup runs.
      host.innerHTML = "";
      setHover(null);
    };
  }, [result, engine, xyzData]);

  // ── 3Dmol.js: re-apply style / arrows / selection shells ──
  useEffect(() => {
    if (engine !== "3dmol") return;
    const v = viewerInstance.current;
    if (!v || atoms.length === 0) return;
    applyView(
      v,
      result,
      atoms,
      { representation, showForces, hideNonpolarH, selection },
      hiddenIndices
    );
  }, [
    engine,
    result,
    atoms,
    hiddenIndices,
    representation,
    showForces,
    hideNonpolarH,
    selection,
  ]);

  // ── 3Dmol.js: re-frame ──
  // Separate from the style effect and NOT keyed on `selection`: spacefill
  // spheres are ~4.5x the radius of ball-and-stick ones and force arrows
  // extend past the atoms, so a fit made for one representation crops in the
  // other — but the view must not jump every time someone clicks an atom.
  useEffect(() => {
    if (engine !== "3dmol") return;
    const v = viewerInstance.current;
    if (!v || atoms.length === 0) return;
    frameView(v, {
      rep: representation,
      hidden: hiddenSet,
      extra: forceArrowTips(result, showForces),
    });
  }, [engine, result, atoms, hiddenSet, representation, showForces]);

  // ── 3Dmol.js: spin toggle ──
  useEffect(() => {
    if (engine !== "3dmol") return;
    viewerInstance.current?.spin(spin);
  }, [engine, spin]);

  // ── Ctrl/Cmd tracking for the box-select overlay ──
  useEffect(() => {
    if (engine !== "3dmol") return;
    const sync = (e: KeyboardEvent) => setModifierHeld(e.ctrlKey || e.metaKey);
    const clear = () => setModifierHeld(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
    };
  }, [engine]);

  // ── Escape clears the selection ──
  useEffect(() => {
    if (selection.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection.length]);

  // ── Gear menu: outside click / Escape ──
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ── Reset view ──
  const handleReset = useCallback(() => {
    if (engine !== "3dmol") return;
    const v = viewerInstance.current;
    if (!v) return;
    frameView(v, {
      rep: representation,
      hidden: hiddenSet,
      extra: forceArrowTips(result, showForces),
    });
  }, [engine, representation, hiddenSet, result, showForces]);

  // ── Fullscreen ──
  // State is driven ONLY by the fullscreenchange event. The old code flipped
  // it optimistically and dropped the promise, so a rejected request (iframe
  // without allow="fullscreen", a permissions policy, a non-user gesture) left
  // the component in CSS fullscreen inside its original column, clipped on all
  // four sides with no way back.
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const target = el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (active) {
        Promise.resolve(
          document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()
        ).catch(() => {});
      } else {
        Promise.resolve(
          target.requestFullscreen?.() ?? target.webkitRequestFullscreen?.()
        ).catch(() => {});
      }
    } catch {
      /* Synchronous throw in older engines — state stays event-driven. */
    }
  }, []);

  useEffect(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    const onChange = () => {
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
      setFullscreen(active === containerRef.current);
      // The box changed size; re-solve the fit once layout has settled. The
      // ResizeObserver normally covers this, but entering fullscreen on a
      // display of different density also changes the backing store.
      requestAnimationFrame(() => resizeRef.current());
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // ── Hide C–H bonds ──
  const toggleHideNonpolarH = useCallback(() => {
    setHideNonpolarH((current) => {
      const next = !current;
      if (next) {
        const gone = new Set(hiddenIndices);
        setSelection((sel) => sel.filter((i) => !gone.has(i)));
      }
      return next;
    });
  }, [hiddenIndices]);

  // ── PNG export ──
  // The canvas is transparent (backgroundAlpha 0), and a transparent PNG
  // dropped into a figure or a slide picks up whatever is behind it — usually
  // not what anyone wants. So the frame is composited onto an OPAQUE colour
  // first: the theme's `--color-bg-elevated`, which is #FFFFFF in the light
  // theme and the dark elevated surface under `.dark`. That is the same value
  // already handed to createViewer as `backgroundColor`, so there is one
  // source of truth for "what colour is behind the molecule in an export".
  const handleDownloadPng = useCallback(() => {
    const v = viewerInstance.current;
    const host = viewerRef.current;
    if (!v || !host) return;
    v.render();
    let uri: string;
    try {
      uri = v.pngURI();
    } catch {
      return;
    }
    const background = readCanvasBackground(host);
    const image = new window.Image();
    image.onload = () => {
      const out = document.createElement("canvas");
      out.width = image.naturalWidth || image.width;
      out.height = image.naturalHeight || image.height;
      const ctx = out.getContext("2d");
      if (!ctx || !out.width || !out.height) return;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(image, 0, 0);
      const link = document.createElement("a");
      link.href = out.toDataURL("image/png");
      link.download = `simpleatom-structure-${atoms.length || result.symbols?.length || 0}-atoms.png`;
      // Firefox only honours a programmatic click on an anchor that is in the
      // document.
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    image.src = uri;
  }, [atoms.length, result.symbols?.length]);

  // ── Box select (Ctrl/Cmd + drag) ──
  const marqueeActive = modifierHeld || marquee !== null;

  const onMarqueeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    marqueeStart.current = { x, y };
    setMarquee({ x0: x, y0: y, x1: x, y1: y });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, []);

  const onMarqueeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = marqueeStart.current;
    const box = boxRef.current;
    if (!start || !box) return;
    const rect = box.getBoundingClientRect();
    setMarquee({
      x0: start.x,
      y0: start.y,
      x1: e.clientX - rect.left,
      y1: e.clientY - rect.top,
    });
  }, []);

  const onMarqueeUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = marqueeStart.current;
      marqueeStart.current = null;
      setMarquee(null);
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const box = boxRef.current;
      const v = viewerInstance.current;
      if (!start || !box || !v) return;

      const rect = box.getBoundingClientRect();
      const x1 = e.clientX - rect.left;
      const y1 = e.clientY - rect.top;
      if (
        Math.abs(x1 - start.x) < MARQUEE_CLICK_SLOP_PX &&
        Math.abs(y1 - start.y) < MARQUEE_CLICK_SLOP_PX
      ) {
        // Modifier-click with no drag: treat as "clear".
        setSelection([]);
        return;
      }

      const left = rect.left + window.scrollX + Math.min(start.x, x1);
      const right = rect.left + window.scrollX + Math.max(start.x, x1);
      const top = rect.top + window.scrollY + Math.min(start.y, y1);
      const bottom = rect.top + window.scrollY + Math.max(start.y, y1);

      const candidates = atomsRef.current.filter(
        (a) => !hiddenSet.has(a.index)
      );
      if (candidates.length === 0) return;
      const screen = v.modelToScreen(
        candidates.map((a) => ({ x: a.x, y: a.y, z: a.z }))
      ) as Array<{ x: number; y: number }>;
      if (!Array.isArray(screen) || screen.length !== candidates.length) return;

      const picked: number[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const s = screen[i];
        if (s.x >= left && s.x <= right && s.y >= top && s.y <= bottom) {
          picked.push(candidates[i].index);
        }
      }
      setSelection(picked);
    },
    [hiddenSet]
  );

  const canHideCH = hiddenIndices.length > 0;

  /** Square-ish WEAS box, clamped to the same 260-520 px band as the 3Dmol one. */
  const weasHeight = fullscreen
    ? 600
    : Math.round(Math.max(260, Math.min(boxWidth || 420, 520)));

  return (
    <div
      ref={containerRef}
      className={`group relative rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4 transition-all ${
        fullscreen ? "flex h-screen flex-col" : ""
      }`}
    >
      {/* ── Header & toolbar ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm font-bold text-[var(--color-accent-primary)]">
            3D STRUCTURE VIEWER
          </h3>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {result.symbols?.length || 0} atoms
          </span>
        </div>

        {/* flex-wrap here as well as on the header row. Without it the inner
            group is a single 364 px line starting at left 41, so at a 375 px
            viewport the last control sits at x = 373-405: outside the
            viewport, not focusable by pointer, and silently clipped because
            the row has no scrollbar. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* ── Engine toggle: 3Dmol ↔ WEAS ── */}
          <div
            role="radiogroup"
            aria-label="Viewer engine"
            className="flex rounded border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]"
          >
            <button
              type="button"
              role="radio"
              aria-checked={is3Dmol}
              onClick={() => setEngine("3dmol")}
              title="3Dmol.js viewer (force arrows supported)"
              className={`flex h-8 items-center justify-center rounded-l px-2 font-mono text-[10px] transition-colors ${
                is3Dmol
                  ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]"
              }`}
            >
              3Dmol
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!is3Dmol}
              onClick={() => setEngine("weas")}
              title="WEAS viewer (ml-peg compatible)"
              className={`flex h-8 items-center justify-center rounded-r px-2 font-mono text-[10px] transition-colors ${
                !is3Dmol
                  ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]"
              }`}
            >
              WEAS
            </button>
          </div>

          {/* ── 3Dmol.js-only controls: representation + forces + reset ── */}
          {is3Dmol && (
            <>
              <div
                role="radiogroup"
                aria-label="Representation"
                className="flex rounded border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]"
              >
                {(
                  [
                    ["ball-and-stick", Boxes, "Ball-and-stick"],
                    ["stick", Box, "Stick"],
                    ["spacefill", Circle, "Spacefill"],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={representation === key}
                    onClick={() => setRepresentation(key)}
                    title={label}
                    aria-label={label}
                    className={`flex h-8 w-8 items-center justify-center transition-colors ${
                      representation === key
                        ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <ToolbarButton
                  onClick={() => setShowForces(!showForces)}
                  title={showForces ? "Hide force vectors" : "Show force vectors"}
                  active={showForces}
                  pressed={showForces}
                  disabled={!hasForces}
                >
                  {showForces ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </ToolbarButton>
                <ToolbarButton onClick={handleReset} title="Reset view">
                  <RotateCcw className="h-4 w-4" />
                </ToolbarButton>

                {/* ── Settings (gear) ── mirrors the bar's menu: rotate,
                    hide C–H bonds, download PNG. Kept as a menu rather than
                    three more toolbar buttons: the row already wraps at
                    375 px and each added button costs another 36 px. */}
                <div className="relative" ref={menuRef}>
                  <ToolbarButton
                    onClick={() => setMenuOpen((o) => !o)}
                    title="Viewer settings"
                    active={menuOpen}
                    expanded={menuOpen}
                    hasPopup="menu"
                  >
                    <Settings2 className="h-4 w-4" />
                  </ToolbarButton>
                  {menuOpen && (
                    <div
                      role="menu"
                      aria-label="Viewer settings"
                      className="absolute right-0 top-9 z-30 min-w-[13rem] overflow-hidden rounded border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] py-1 shadow-lg"
                    >
                      <MenuItem
                        label="Rotate structure"
                        checked={spin}
                        onClick={() => setSpin((s) => !s)}
                        hint="Continuous auto-rotation"
                      />
                      <MenuItem
                        label="Hide C–H bonds"
                        checked={hideNonpolarH}
                        disabled={!canHideCH}
                        onClick={toggleHideNonpolarH}
                        hint={
                          canHideCH
                            ? "Hide hydrogens whose only bonds are to carbon (and those bonds). Polar O–H / N–H hydrogens stay."
                            : "No carbon-bound hydrogens in this structure"
                        }
                      />
                      <MenuItem
                        label="Clear selection"
                        icon={<X className="h-3.5 w-3.5" />}
                        disabled={selection.length === 0}
                        onClick={() => setSelection([])}
                        hint="Also bound to Escape"
                      />
                      <MenuItem
                        label="Download PNG"
                        icon={<Download className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setMenuOpen(false);
                          handleDownloadPng();
                        }}
                        hint="Composited onto an opaque background"
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Fullscreen (both engines) ── */}
          <ToolbarButton
            onClick={toggleFullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            active={fullscreen}
            pressed={fullscreen}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </ToolbarButton>
        </div>
      </div>

      {/* ── Viewer canvas ──
          NO background and NO border. The canvas is transparent
          (backgroundAlpha 0), so whatever sits here shows through — and a
          white well made that transparency a pixel-level no-op: the well
          painted exactly the white the opaque canvas used to paint, measured
          identical. Stacking an elevated surface inside a secondary surface on
          the page tint gave three backgrounds and two borders around the
          molecule, which read as a screenshot in a box rather than an object
          on the page. The bar's wrapper is a bare rounded box with no fill and
          no border. Callers own the surface.

          SHAPE: aspect-square, capped at 520 px tall, instead of a fixed 420.
          At 375 px the old box was 291x420 portrait; the fit binds on the
          291 px axis, so the molecule reached 48% of the height and 11% of the
          area and the rest was scroll. Square wastes none of it and keeps the
          molecule the same size on screen. On a wide results column the height
          cap keeps it from becoming a full-page square. The bar uses
          `aspect-square w-full max-w-md`.

          WEAS takes a pixel height rather than filling its parent, so in WEAS
          mode the box stays auto-height and the same 260-520 band is applied
          to the iframe instead (weasHeight). */}
      <div
        ref={boxRef}
        className={`relative overflow-hidden rounded-lg ${
          fullscreen
            ? "min-h-0 flex-1"
            : is3Dmol
              ? "aspect-square max-h-[520px] min-h-[260px] w-full"
              : "w-full"
        }`}
      >
        {/* 3Dmol.js viewer (shown when engine === "3dmol") */}
        {is3Dmol && (
          <div
            ref={viewerRef}
            className="h-full w-full"
            style={{ position: "relative", height: "100%", width: "100%" }}
          />
        )}

        {/* WEAS viewer (shown when engine === "weas") */}
        {!is3Dmol && xyzData && (
          <WeasViewer structureData={xyzData} format="xyz" height={weasHeight} />
        )}

        {/* ── Box-select overlay ──
            Transparent, and pointer-transparent unless Ctrl/Cmd is held, so
            3Dmol keeps every gesture it normally owns. When it IS armed it
            swallows the drag, which is why Ctrl-drag no longer pans (3Dmol
            binds pan to ctrlKey as well as to middle-drag; middle-drag still
            pans). Any button is accepted, because on macOS Ctrl+click is a
            SECONDARY click — the pointerdown arrives with button 2 — and the
            context menu is suppressed for the same reason. */}
        {is3Dmol && (
          <div
            className="absolute inset-0 z-10"
            style={{
              pointerEvents: marqueeActive ? "auto" : "none",
              cursor: marqueeActive ? "crosshair" : "default",
            }}
            onPointerDown={onMarqueeDown}
            onPointerMove={onMarqueeMove}
            onPointerUp={onMarqueeUp}
            onPointerCancel={onMarqueeUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            {marquee && (
              <div
                className="absolute border border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/15"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
          </div>
        )}

        {/* ── Measurement readout (top-left, like the bar) ── */}
        {is3Dmol && selection.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)]">
            <div className="rounded border border-[var(--color-accent-primary)]/60 bg-[var(--color-bg-elevated)]/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Ruler className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent-primary)]" />
                <div className="min-w-0">
                  {measurement ? (
                    <>
                      <p className="font-mono text-xs font-bold text-[var(--color-accent-primary)]">
                        {measurement.kind}
                        {measurement.value !== "—" && (
                          <span className="text-[var(--color-text-primary)]">
                            {" "}
                            {measurement.value}
                          </span>
                        )}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                        {measurement.path}
                        {measurement.note ? ` · ${measurement.note}` : ""}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-mono text-xs font-bold text-[var(--color-accent-primary)]">
                        {selectedAtoms[0]
                          ? atomLabel(selectedAtoms[0])
                          : "1 atom"}{" "}
                        selected
                      </p>
                      <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        add a 2nd atom for a distance in Å
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelection([])}
                  title="Clear selection (Esc)"
                  aria-label="Clear selection"
                  className="pointer-events-auto ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-accent-primary)]/10 hover:text-[var(--color-accent-primary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Hover info box ── */}
        {is3Dmol && hover && !marquee && (
          <div
            className="pointer-events-none absolute z-20 max-w-[16rem] -translate-x-1/2 -translate-y-full rounded border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]/95 px-2 py-1 shadow-sm"
            style={{
              left: Math.max(8, hover.x),
              top: Math.max(24, hover.y - 8),
            }}
          >
            <p className="font-mono text-[11px] font-bold text-[var(--color-text-primary)]">
              {hover.text}
            </p>
            <p className="whitespace-nowrap font-mono text-[10px] text-[var(--color-text-muted)]">
              {hover.detail}
            </p>
          </div>
        )}

        {/* Loading spinner (3Dmol only — WEAS has its own) */}
        {is3Dmol && loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-bg-elevated)]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent-primary)]" />
          </div>
        )}
      </div>

      {/* ── Footer help text ── */}
      <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
        {is3Dmol ? (
          <>
            Drag to rotate · Scroll or right-drag to zoom · Middle-drag to pan ·
            Click an atom to select (2 = distance in Å, 3 = angle, 4 = dihedral)
            · Ctrl/Cmd-drag to box-select · Esc to clear
            {hasForces && " · Green arrows = force vectors"}
          </>
        ) : (
          <>
            WEAS viewer (ml-peg compatible) · Drag to rotate · Scroll to zoom
          </>
        )}
      </p>
    </div>
  );
}

/*
 * ============================================================================
 * DOCUMENTATION: Dual-Engine Viewer (3Dmol.js + WEAS)
 * ============================================================================
 *
 * OVERVIEW:
 *   The viewer supports two rendering engines that users can toggle between:
 *
 *   1. 3Dmol.js — Full-featured viewer with:
 *      - Ball-and-stick, stick, spacefill representations
 *      - Force vector arrows (green, scaled)
 *      - Auto-rotate (spin), reset view, fullscreen
 *      - Atom / bond selection with distance, angle and dihedral readout
 *      - Hide C–H bonds, PNG export
 *      Loaded from npm (3dmol package), rendered via direct DOM control.
 *
 *   2. WEAS — ml-peg compatible viewer with:
 *      - Ball-and-stick rendering
 *      - XYZ and CIF format support
 *      - Trajectory support (future)
 *      - Same look as https://ml-peg.stfc.ac.uk
 *      Loaded from CDN (unpkg.com/weas), rendered in a sandboxed iframe.
 *
 * WHEN TO USE WHICH:
 *   - 3Dmol.js: Default. Use when you need force arrows or advanced controls.
 *   - WEAS: Use when you want ml-peg compatibility or plan to integrate with
 *     the MACE team's tooling.
 *
 * TOOLBAR LAYOUT:
 *   [3Dmol | WEAS] | [Ball-and-stick | Stick | Spacefill] | [Forces] [Reset]
 *   [Gear] | [Fullscreen]
 *   The gear menu holds Rotate structure, Hide C–H bonds, Clear selection and
 *   Download PNG — the bar's own menu is Rotate structure / Manage molecule
 *   view / Hide C–H bonds / Download PNG. "Manage molecule view" is the
 *   representation switcher, which stays visible in the toolbar here.
 *
 * SELECTION & MEASUREMENT:
 *   Click an atom to select it (translucent SimpleAtom-green shell). Clicking
 *   a bond selects both of its atoms. Ctrl/Cmd-drag box-selects. 2 atoms give
 *   a distance in Å, 3 an angle in degrees about the middle atom, 4 a signed
 *   dihedral in degrees — selection ORDER sets the vertex and the sign, so the
 *   selection is a list, not a set. Two atoms are only called a "bond length"
 *   when 3Dmol's distance-based perception actually put a bond there;
 *   otherwise the readout says "Distance" and says why. MACE gives no bond
 *   orders and none are invented here.
 *
 * FILES:
 *   - molecule-viewer-3d.tsx (this file) — Main viewer with engine toggle
 *   - weas-viewer.tsx — WEAS iframe wrapper component
 *
 * RENDER SETTINGS — DO NOT DROP WHEN ADDING FEATURES:
 *   The ViewerSpec passed to createViewer() carries five deliberate options:
 *   `antialias` + `upscale` (>= 2x backing store), `outline` (dark contact
 *   outline), `ambientOcclusion` (soft contact shading) and `hoverDuration`.
 *   Together with frameView(), repStyle()'s white-capped CPK scheme and the
 *   theme-derived background, these are the render-quality bar from
 *   docs/v2/bars/rowan.md.
 *
 * FRAMING — WHY THE PAD IS PER-ATOM:
 *   See drawnRadius() and measureProjectedExtent(). The short version: a
 *   single shared "largest radius" pad overestimates the silhouette by
 *   (largest radius - outermost atom's radius), which grows with the
 *   representation's bulk, so the solver under-zoomed most where the atoms
 *   were fattest and spacefill came out SMALLER than ball-and-stick. Do not
 *   reintroduce a single shared pad, and do not special-case spacefill.
 *
 * SPECULAR HIGHLIGHTS — SETTLED, DO NOT RE-OPEN:
 *   An earlier round listed "no gloss" as a gap needing a 3Dmol fork. It is
 *   not a gap. The bar was measured pixel-by-pixel and has no specular term
 *   either: its brightest pixel anywhere in the molecule is 242/255 and zero
 *   pixels reach 245. What reads as gloss there is a hard dark contour over a
 *   flat mid-grey fill — a graphic-design effect, not a shading model. Our
 *   render is already the more strongly lit of the two (carbon spans ~117
 *   luminance levels against the bar's ~34).
 *
 *   Forking 3Dmol to add a specular term would therefore buy no visible
 *   quality AND would actively regress the white-ceiling fix above, since a
 *   specular lobe adds exactly the blown-out near-background pixels that
 *   WHITE_CEILING exists to prevent. Rejected on measurement, not on effort.
 *
 * FUTURE ml-peg INTEGRATION:
 *   Using the same WEAS viewer as ml-peg means structures will look identical
 *   in both tools. A future "Browse ml-peg structures" feature could load
 *   benchmark structures directly into this viewer.
 *   See: https://github.com/ddmms/ml-peg
 * ============================================================================
 */
