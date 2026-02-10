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
  Layers,
} from "lucide-react";
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
// 3Dmol.js representation styles
// ---------------------------------------------------------------------------

const REP_STYLES: Record<Representation, object> = {
  "ball-and-stick": { stick: { radius: 0.25 }, sphere: { scale: 0.3 } },
  stick: { stick: { radius: 0.3 } },
  spacefill: { sphere: { scale: 0.6 } },
};

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
  const viewerInstance = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [representation, setRepresentation] = useState<Representation>("ball-and-stick");
  const [showForces, setShowForces] = useState(true);
  const [spin, setSpin] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Pre-build XYZ string (shared by both engines)
  const xyzData = buildXYZ(result);

  // ── 3Dmol.js: apply representation + force arrows ──
  const applyView = (
    viewer: any,
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
          color: "#00ff41",
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
    const resize = () => {
      viewerInstance.current?.resize?.();
      viewerInstance.current?.render?.();
    };

    import("3dmol").then(($3Dmol) => {
      if (!viewerRef.current || !result.symbols || !result.positions) return;

      viewerRef.current.innerHTML = "";
      viewerInstance.current = $3Dmol.createViewer(viewerRef.current, {
        backgroundColor: "black",
      });
      const viewer = viewerInstance.current;

      viewer.addModel(xyzData, "xyz");
      viewer.enableFog(false);
      applyView(viewer, representation, showForces);
      viewer.zoomTo();
      viewer.render();

      resize();
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(viewerRef.current);
      setLoading(false);
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      viewerInstance.current?.clear?.();
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
    viewerInstance.current?.spin?.(spin);
  }, [spin]);

  // ── 3Dmol.js: reset view ──
  const handleReset = () => {
    if (engine !== "3dmol") return;
    viewerInstance.current?.zoomTo?.();
    viewerInstance.current?.render?.();
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
          ? "border-matrix-green bg-matrix-green/20 text-matrix-green"
          : "border-matrix-green/40 bg-black/60 text-zinc-400 hover:border-matrix-green/60 hover:text-matrix-green"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div
      ref={containerRef}
      className={`group relative rounded-lg border border-matrix-green/20 bg-black/80 p-4 transition-all ${
        fullscreen ? "flex h-screen flex-col" : ""
      }`}
    >
      {/* ── Header & toolbar ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm font-bold text-matrix-green">
            3D STRUCTURE VIEWER
          </h3>
          <span className="font-mono text-xs text-zinc-500">
            {result.symbols?.length || 0} atoms
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* ── Engine toggle: 3Dmol ↔ WEAS ── */}
          <div className="flex rounded border border-matrix-green/40 bg-black/60">
            <button
              type="button"
              onClick={() => setEngine("3dmol")}
              title="3Dmol.js viewer (force arrows supported)"
              className={`flex h-8 items-center justify-center rounded-l px-2 font-mono text-[10px] transition-colors ${
                is3Dmol
                  ? "bg-matrix-green/20 text-matrix-green"
                  : "text-zinc-400 hover:text-matrix-green"
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
                  ? "bg-matrix-green/20 text-matrix-green"
                  : "text-zinc-400 hover:text-matrix-green"
              }`}
            >
              WEAS
            </button>
          </div>

          <div className="h-4 w-px bg-matrix-green/30" />

          {/* ── 3Dmol.js-only controls: representation + forces + spin + reset ── */}
          {is3Dmol && (
            <>
              <div className="flex rounded border border-matrix-green/40 bg-black/60">
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
                        ? "bg-matrix-green/20 text-matrix-green"
                        : "text-zinc-400 hover:text-matrix-green"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-matrix-green/30" />

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

      {/* ── Viewer canvas ── */}
      <div
        className={`relative overflow-hidden rounded-lg border border-matrix-green/20 bg-black shadow-inner ${
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-matrix-green/30 border-t-matrix-green" />
          </div>
        )}
      </div>

      {/* ── Footer help text ── */}
      <p className="mt-2 font-mono text-xs text-zinc-500">
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
 * FUTURE ml-peg INTEGRATION:
 *   Using the same WEAS viewer as ml-peg means structures will look identical
 *   in both tools. A future "Browse ml-peg structures" feature could load
 *   benchmark structures directly into this viewer.
 *   See: https://github.com/ddmms/ml-peg
 * ============================================================================
 */
