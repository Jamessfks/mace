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
 *   2. Shading — renderer-level dark contact outline + screen-space ambient
 *      occlusion, so overlapping atoms separate and contacts darken.
 *   3. Colours — Jmol CPK (C grey, H white, N blue, O red). 3Dmol's built-in
 *      default is the washed-out RasMol table (C #C8C8C8, N #8F8FFF), which
 *      disappears against a white canvas.
 *   4. Background — the canvas uses the theme's elevated surface (pure white
 *      in the light theme) rather than the warm off-white page tint.
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

interface MoleculeViewer3DProps {
  result: CalculationResult;
}

// ---------------------------------------------------------------------------
// 3Dmol.js render-quality settings
// ---------------------------------------------------------------------------

/**
 * Jmol CPK: C #909090 grey, H #FFFFFF white, N #3050F8 blue, O #FF0D0D red.
 * 3Dmol's *default* table is RasMol (C #C8C8C8, N #8F8FFF, O #F00000) — both
 * carbon and nitrogen read as washed-out pastels on a white canvas.
 */
const CPK_SCHEME = "Jmol";

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

const REP_STYLES: Record<Representation, AtomStyleSpec> = {
  "ball-and-stick": {
    stick: { radius: BOND_RADIUS, colorscheme: CPK_SCHEME },
    sphere: { scale: SPHERE_SCALE, colorscheme: CPK_SCHEME },
  },
  // Licorice. showNonBonded keeps isolated atoms visible when 3Dmol's
  // distance-based bond perception finds no neighbours (ions, gas-phase atoms).
  stick: {
    stick: { radius: 0.18, colorscheme: CPK_SCHEME, showNonBonded: true },
  },
  // True van der Waals spacefill (scale 1.0). Was 0.6, which is not spacefill.
  spacefill: { sphere: { scale: 1.0, colorscheme: CPK_SCHEME } },
};

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
 * pixels). 3Dmol's default 5.0 A is longer than a whole small molecule, so it
 * produces flat overall dimming instead of contact shadow; ~1.5x a C-C bond
 * keeps the darkening local to where a sphere meets a stick. strength 1.0
 * (the default) crushes those crevices to black. WebGL2 only; also gated on
 * atom count below.
 */
const AMBIENT_OCCLUSION = { strength: 0.6, radius: 2.5 };

/** Above this many atoms the SSAO depth pre-pass costs more than it buys. */
const AO_MAX_ATOMS = 600;

/** zoomTo() fits tight to the bounding sphere; back off for framing margin. */
const FRAMING_ZOOM = 0.88;

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
    const canvas = viewer.getRenderer()?.getCanvas() as
      | HTMLCanvasElement
      | undefined;
    return !!canvas?.getContext?.("webgl2");
  } catch {
    return false;
  }
}

/**
 * Fit the structure to the canvas with a little margin. zoomTo() fits tight to
 * the bounding sphere, which crops atoms against the border; the bar frames the
 * molecule with visible breathing room. Used on load and on "reset view" so
 * both produce the same framing.
 */
function frameView(viewer: GLViewer): void {
  viewer.zoomTo();
  viewer.zoom(FRAMING_ZOOM);
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
    viewer.setStyle({}, REP_STYLES[rep]);
    viewer.render();

    if (result.forces && forcesVisible) {
      result.forces.forEach((force, i) => {
        const pos = result.positions![i];
        const scale = 5;
        viewer.addArrow({
          start: { x: pos[0], y: pos[1], z: pos[2] },
          end: {
            x: pos[0] + force[0] * scale,
            y: pos[1] + force[1] * scale,
            z: pos[2] + force[2] * scale,
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
      v.render();
    };

    let cancelled = false;

    import("3dmol").then(($3Dmol) => {
      const host = viewerRef.current;
      if (cancelled || !host || !result.symbols || !result.positions) return;

      host.innerHTML = "";

      const atomCount = result.symbols.length;
      const viewer = $3Dmol.createViewer(host, {
        backgroundColor: readCanvasBackground(host),
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
      frameView(viewer);

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
  useEffect(() => {
    if (engine !== "3dmol") return;
    const v = viewerInstance.current;
    if (!v || !result.symbols) return;
    applyView(v, representation, showForces);
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
    frameView(v);
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
          bg-elevated (pure white in the light theme) so the canvas well matches
          the WebGL clear colour exactly — the warm page tint read as muddy
          next to a white-background viewer. */}
      <div
        className={`relative overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] ${
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
 *   outline), and `ambientOcclusion` (soft contact shading). Together with the
 *   Jmol colourscheme in REP_STYLES and the theme-derived background, these are
 *   the render-quality bar from docs/v2/bars/rowan.md. Selection highlighting
 *   and measurement overlays should be layered on top of this config, not by
 *   re-creating the viewer with a different one.
 *
 *   KNOWN GAP vs the bar: no specular highlight. 3Dmol 2.5.4 ships Lambert-only
 *   shaders — there is no specular term anywhere in src/WebGL/shaders, and the
 *   package entry point does not export ShaderLib, so gloss cannot be added
 *   without forking the library. Outline + SSAO are the closest available.
 *
 * FUTURE ml-peg INTEGRATION:
 *   Using the same WEAS viewer as ml-peg means structures will look identical
 *   in both tools. A future "Browse ml-peg structures" feature could load
 *   benchmark structures directly into this viewer.
 *   See: https://github.com/ddmms/ml-peg
 * ============================================================================
 */
