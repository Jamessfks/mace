"use client";

/**
 * MoleculeViewer3D — Dual-engine 3D structure viewer.
 *
 * VIEWER ENGINES:
 *   1. 3Dmol.js (npm) — Full-featured: representations, force vectors, spin.
 *      Used for post-calculation results where force arrows are needed.
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
 *      no well: its callers own the surface.
 *
 * DEPENDENCIES:
 *   - 3dmol (npm)         — dynamically imported for 3Dmol.js mode
 *   - weas (CDN via iframe) — loaded at runtime for WEAS mode
 *   - ./weas-viewer.tsx   — WEAS iframe wrapper component
 */

import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  Eye,
  EyeOff,
  CircleDot,
  Circle,
  Box,
  Boxes,
} from "lucide-react";
import type { AtomStyleSpec, GLViewer } from "3dmol";
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

/** Fraction of the short axis the silhouette should span. Bar measures 0.739. */
const TARGET_FILL = 0.76;

/** Extra screen-pixel allowance for the outline, which sits outside the atom. */
const OUTLINE_PAD_PX = 3;

/** Measure/correct passes. Two is normally enough; the third is insurance. */
const FRAMING_PASSES = 3;

/** Stop once the correction is this close to 1. */
const FRAMING_TOLERANCE = 0.02;

/** Hard ceiling on total zoom applied after zoomTo(), against runaway fits. */
const MAX_TOTAL_FRAMING_ZOOM = 8;

/** Floor, so a structure that would crop can always be pulled back. */
const MIN_TOTAL_FRAMING_ZOOM = 0.2;

/** Angstroms drawn per eV/A of force. Shared by the arrows and the framing. */
const FORCE_ARROW_SCALE = 5;

/** Fallback canvas background if the theme token cannot be resolved. */
const FALLBACK_BACKGROUND = "#FFFFFF";

// ---------------------------------------------------------------------------
// Helpers
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

/** Largest drawn sphere radius in Angstroms for the elements actually present. */
function maxDrawnRadius(elements: Iterable<string>, rep: Representation): number {
  if (rep === "stick") return LICORICE_RADIUS;
  let maxVdw = 1.2;
  for (const element of elements) {
    const r =
      vdwRadii?.[element] ??
      vdwRadii?.[element.charAt(0).toUpperCase() + element.slice(1).toLowerCase()];
    if (typeof r === "number" && r > maxVdw) maxVdw = r;
  }
  return maxVdw * (rep === "spacefill" ? SPACEFILL_SCALE : SPHERE_SCALE);
}

/**
 * Half-extent of the rendered silhouette and of the viewport, both in CSS
 * pixels, measured through 3Dmol's own projection. Returns null when the
 * viewer is not in a measurable state.
 */
interface ProjectedExtent {
  halfWidth: number;
  halfHeight: number;
  viewHalfWidth: number;
  viewHalfHeight: number;
}

function measureProjectedExtent(
  viewer: GLViewer,
  rep: Representation,
  extra: Point3[]
): ProjectedExtent | null {
  const canvas = viewer.getRenderer()?.getCanvas() as
    | HTMLCanvasElement
    | undefined;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const atoms = viewer.selectedAtoms({});
  const points = atoms
    .filter(
      (a) =>
        Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)
    )
    .map((a) => ({ x: a.x as number, y: a.y as number, z: a.z as number }));
  if (points.length === 0) return null;

  // Centroid — the point zoomTo() puts at the viewport centre (getExtent
  // returns the mean, not the bounding-box midpoint).
  const centroid = points.reduce(
    (acc, p) => ({
      x: acc.x + p.x / points.length,
      y: acc.y + p.y / points.length,
      z: acc.z + p.z / points.length,
    }),
    { x: 0, y: 0, z: 0 }
  );

  // Probe the projection: centroid plus one unit step along each model axis.
  // For a rotation R followed by a drop of the depth component, the projected
  // lengths of an orthonormal basis satisfy sum|P R e_i|^2 = 2, so the scale
  // factor is sqrt(sum / 2) — no assumption about how the model is rotated.
  const probes = [
    centroid,
    { x: centroid.x + 1, y: centroid.y, z: centroid.z },
    { x: centroid.x, y: centroid.y + 1, z: centroid.z },
    { x: centroid.x, y: centroid.y, z: centroid.z + 1 },
    ...points,
    // Force arrows are shapes, not atoms, so selectedAtoms() misses them. On an
    // unrelaxed structure they can be tens of Angstroms long; zoomTo() folds
    // shapes into its own fit, and the correction below has to as well or it
    // zooms in until the arrows are cropped.
    ...extra,
  ];
  const screen = viewer.modelToScreen(probes) as Array<{
    x: number;
    y: number;
  }>;
  if (!Array.isArray(screen) || screen.length !== probes.length) return null;

  const origin = screen[0];
  let sumSquares = 0;
  for (let i = 1; i <= 3; i++) {
    const dx = screen[i].x - origin.x;
    const dy = screen[i].y - origin.y;
    sumSquares += dx * dx + dy * dy;
  }
  const pxPerAngstrom = Math.sqrt(sumSquares / 2);
  if (!Number.isFinite(pxPerAngstrom) || pxPerAngstrom <= 0) return null;

  // modelToScreen returns page coordinates, so build the viewport centre the
  // same way 3Dmol's canvasOffset() does.
  const doc = canvas.ownerDocument.documentElement;
  const left = rect.left + window.scrollX - doc.clientLeft;
  const top = rect.top + window.scrollY - doc.clientTop;
  const centreX = left + rect.width / 2;
  const centreY = top + rect.height / 2;

  const pad =
    maxDrawnRadius(
      atoms.map((a) => a.elem ?? "C"),
      rep
    ) *
      pxPerAngstrom +
    OUTLINE_PAD_PX;

  let halfWidth = 0;
  let halfHeight = 0;
  for (let i = 4; i < screen.length; i++) {
    halfWidth = Math.max(halfWidth, Math.abs(screen[i].x - centreX));
    halfHeight = Math.max(halfHeight, Math.abs(screen[i].y - centreY));
  }

  return {
    halfWidth: halfWidth + pad,
    halfHeight: halfHeight + pad,
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
 */
function frameView(
  viewer: GLViewer,
  rep: Representation,
  extra: Point3[] = []
): void {
  viewer.zoomTo();

  let applied = 1;
  for (let pass = 0; pass < FRAMING_PASSES; pass++) {
    const extent = measureProjectedExtent(viewer, rep, extra);
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

// ---------------------------------------------------------------------------
// Helper: build XYZ string from CalculationResult
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MoleculeViewer3D({ result }: MoleculeViewer3DProps) {
  // Viewer engine: user can toggle between 3Dmol.js and WEAS
  const [engine, setEngine] = useState<ViewerEngine>("3dmol");

  // 3Dmol.js state
  const viewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<GLViewer | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pixelRatioWatcherRef = useRef<(() => void) | null>(null);

  const [representation, setRepresentation] = useState<Representation>("ball-and-stick");
  const [showForces, setShowForces] = useState(true);
  // The viewer-init effect depends only on [result, engine], so its resize()
  // closure would capture the representation from first render. These refs let
  // resize() re-solve the fit against the CURRENT representation without
  // rebuilding the viewer every time the user switches style.
  const representationRef = useRef(representation);
  const showForcesRef = useRef(showForces);
  useEffect(() => {
    representationRef.current = representation;
    showForcesRef.current = showForces;
  }, [representation, showForces]);
  const [spin, setSpin] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Pre-build XYZ string (shared by both engines)
  const xyzData = buildXYZ(result);

  // ── 3Dmol.js: apply representation + force arrows ──
  const applyView = (
    viewer: GLViewer,
    rep: Representation,
    forcesVisible: boolean
  ) => {
    if (!result.symbols || !result.positions) return;

    viewer.removeAllShapes();
    viewer.setStyle({}, repStyle(rep));
    viewer.render();

    if (result.forces && forcesVisible) {
      result.forces.forEach((force, i) => {
        const pos = result.positions![i];
        viewer.addArrow({
          start: { x: pos[0], y: pos[1], z: pos[2] },
          end: {
            x: pos[0] + force[0] * FORCE_ARROW_SCALE,
            y: pos[1] + force[1] * FORCE_ARROW_SCALE,
            z: pos[2] + force[2] * FORCE_ARROW_SCALE,
          },
          radius: 0.08,
          color: "#228833", // Paul Tol green — matches "force vectors" legend
        });
      });
      viewer.render();
    }
  };

  // ── 3Dmol.js: initialize viewer ──
  useEffect(() => {
    // Only run when 3Dmol engine is active
    if (engine !== "3dmol") return;
    if (!viewerRef.current || !result.positions || !result.symbols) return;

    setLoading(true);

    // resize() -> Renderer.setSize() -> canvas.width = cssWidth * dpr.
    // This is the only place the backing-store resolution is recomputed, so it
    // is driven by BOTH the ResizeObserver (CSS box) and the DPR watcher.
    const resize = () => {
      const v = viewerInstance.current;
      if (!v) return;
      v.resize();
      // Re-solve the fit. Without this a 1280 -> 375 change takes the fill from
      // 0.705 to 0.998 with the molecule clipped at both edges, because the fit
      // was solved for the old aspect ratio and zoom is not recomputed by
      // resize(). Measured; Reset view recovered it, which is what identified
      // this as a missing frameView() rather than a solver bug.
      frameView(
        v,
        representationRef.current,
        forceArrowTips(result, showForcesRef.current)
      );
      v.render();
    };

    let cancelled = false;

    import("3dmol").then(($3Dmol) => {
      const host = viewerRef.current;
      if (cancelled || !host || !result.symbols || !result.positions) return;

      host.innerHTML = "";
      cacheColourTables($3Dmol);

      const atomCount = result.symbols.length;
      const viewer = $3Dmol.createViewer(host, {
        // Transparent canvas. The bar renders its molecule straight onto the
        // page; ours was an opaque rectangle inside a card on a warm canvas —
        // three background values and a hard-edged box, which read as a pasted
        // screenshot rather than an object. backgroundColor is still supplied
        // because 3Dmol reads it for PNG export, where transparency is usually
        // not what a user wants in a figure.
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
      });
      viewerInstance.current = viewer;

      // AO needs the WebGL2 framebuffer attachments; drop it otherwise.
      if (!rendersWithWebGL2(viewer)) {
        viewer.getRenderer()?.disableAmbientOcclusion();
      }

      viewer.addModel(xyzData, "xyz");
      viewer.enableFog(false);
      applyView(viewer, representation, showForces);
      frameView(
        viewer,
        representation,
        forceArrowTips(result, showForces)
      );

      resize();
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(host);
      pixelRatioWatcherRef.current = watchPixelRatio(resize);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      pixelRatioWatcherRef.current?.();
      pixelRatioWatcherRef.current = null;
      viewerInstance.current?.clear();
      viewerInstance.current = null;
    };
  }, [result, engine]);

  // ── 3Dmol.js: update representation / forces ──
  // Re-frames as well as re-styles: spacefill spheres are ~4.5x the radius of
  // ball-and-stick ones and force arrows extend past the atoms, so a fit made
  // for one representation crops in the other.
  useEffect(() => {
    if (engine !== "3dmol") return;
    const v = viewerInstance.current;
    if (!v || !result.symbols) return;
    applyView(v, representation, showForces);
    frameView(v, representation, forceArrowTips(result, showForces));
  }, [representation, showForces]);

  // ── 3Dmol.js: spin toggle ──
  useEffect(() => {
    if (engine !== "3dmol") return;
    viewerInstance.current?.spin(spin);
  }, [spin]);

  // ── 3Dmol.js: reset view ──
  const handleReset = () => {
    if (engine !== "3dmol") return;
    const v = viewerInstance.current;
    if (!v) return;
    frameView(v, representation, forceArrowTips(result, showForces));
  };

  // ── Fullscreen ──
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (fullscreen) {
      document.exitFullscreen?.();
    } else {
      containerRef.current.requestFullscreen?.();
    }
    setFullscreen(!fullscreen);
  };

  useEffect(() => {
    const onFullscreenChange = () =>
      setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const hasForces = !!result.forces?.length;
  const is3Dmol = engine === "3dmol";

  // ── Reusable toolbar button ──
  const ToolbarButton = ({
    onClick,
    title,
    active,
    children,
    disabled,
  }: {
    onClick: () => void;
    title: string;
    active?: boolean;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
          : "border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]/60 hover:text-[var(--color-accent-primary)]"
      }`}
    >
      {children}
    </button>
  );

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

        <div className="flex items-center gap-2">
          {/* ── Engine toggle: 3Dmol ↔ WEAS ── */}
          <div className="flex rounded border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]">
            <button
              type="button"
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

          <div className="h-4 w-px bg-[var(--color-border-subtle)]" />

          {/* ── 3Dmol.js-only controls: representation + forces + spin + reset ── */}
          {is3Dmol && (
            <>
              <div className="flex rounded border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]">
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
                    onClick={() => setRepresentation(key)}
                    title={label}
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

              <div className="h-4 w-px bg-[var(--color-border-subtle)]" />

              <div className="flex items-center gap-1">
                <ToolbarButton
                  onClick={() => setShowForces(!showForces)}
                  title={showForces ? "Hide force vectors" : "Show force vectors"}
                  active={showForces}
                  disabled={!hasForces}
                >
                  {showForces ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => setSpin(!spin)}
                  title={spin ? "Stop rotation" : "Auto-rotate"}
                  active={spin}
                >
                  <CircleDot className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={handleReset} title="Reset view">
                  <RotateCcw className="h-4 w-4" />
                </ToolbarButton>
              </div>
            </>
          )}

          {/* ── Fullscreen (both engines) ── */}
          <ToolbarButton
            onClick={toggleFullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            active={fullscreen}
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
          no border. Callers own the surface. */}
      <div
        className={`relative overflow-hidden rounded-lg ${
          fullscreen ? "min-h-0 flex-1" : ""
        }`}
      >
        {/* 3Dmol.js viewer (shown when engine === "3dmol") */}
        {is3Dmol && (
          <div
            ref={viewerRef}
            className="h-full w-full"
            style={{
              position: "relative",
              height: fullscreen ? "100%" : 420,
              minHeight: 420,
            }}
          />
        )}

        {/* WEAS viewer (shown when engine === "weas") */}
        {!is3Dmol && xyzData && (
          <WeasViewer
            structureData={xyzData}
            format="xyz"
            height={fullscreen ? 600 : 420}
          />
        )}

        {/* Loading spinner (3Dmol only — WEAS has its own) */}
        {is3Dmol && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-elevated)]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent-primary)]" />
          </div>
        )}
      </div>

      {/* ── Footer help text ── */}
      <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
        {is3Dmol ? (
          <>
            Drag to rotate · Scroll to zoom · Right-drag to pan
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
 *      - Auto-rotate (spin)
 *      - Reset view
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
 *   [3Dmol | WEAS] | [Ball-and-stick | Stick | Spacefill] | [Forces] [Spin] [Reset] | [Fullscreen]
 *   ^^ engine       ^^ 3Dmol-only controls                                            ^^ both
 *
 * FILES:
 *   - molecule-viewer-3d.tsx (this file) — Main viewer with engine toggle
 *   - weas-viewer.tsx — WEAS iframe wrapper component
 *
 * RENDER SETTINGS — DO NOT DROP WHEN ADDING FEATURES:
 *   The ViewerSpec passed to createViewer() carries four deliberate options:
 *   `antialias` + `upscale` (>= 2x backing store), `outline` (dark contact
 *   outline), and `ambientOcclusion` (soft contact shading). Together with
 *   frameView(), repStyle()'s white-capped CPK scheme and the theme-derived
 *   background, these are the render-quality bar from docs/v2/bars/rowan.md.
 *   Selection highlighting and measurement overlays should be layered on top of
 *   this config, not by re-creating the viewer with a different one.
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
