"use client";

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
import type { CalculationResult } from "@/types/mace";

type Representation = "ball-and-stick" | "stick" | "spacefill";

interface MoleculeViewer3DProps {
  result: CalculationResult;
}

const REP_STYLES: Record<Representation, object> = {
  "ball-and-stick": { stick: { radius: 0.25 }, sphere: { scale: 0.3 } },
  stick: { stick: { radius: 0.3 } },
  spacefill: { sphere: { scale: 0.6 } },
};

/**
 * 3D Molecular Viewer using 3Dmol.js
 * Professional viewer with representation controls, force vectors, spin, fullscreen
 */
export function MoleculeViewer3D({ result }: MoleculeViewer3DProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [representation, setRepresentation] = useState<Representation>("ball-and-stick");
  const [showForces, setShowForces] = useState(true);
  const [spin, setSpin] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Build and apply structure + style + forces
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

  useEffect(() => {
    if (!viewerRef.current || !result.positions || !result.symbols) return;

    setLoading(true);
    const resize = () => {
      if (viewerInstance.current && viewerRef.current) {
        viewerInstance.current.resize?.();
        viewerInstance.current.render?.();
      }
    };

    import("3dmol").then(($3Dmol) => {
      if (!viewerRef.current || !result.symbols || !result.positions) return;

      viewerRef.current.innerHTML = "";
      const config = { backgroundColor: "black" };
      viewerInstance.current = $3Dmol.createViewer(viewerRef.current, config);
      const viewer = viewerInstance.current;

      const atomCount = result.symbols.length;
      let xyzData = `${atomCount}\n`;
      xyzData += `Energy: ${result.energy} eV\n`;
      result.symbols.forEach((symbol, i) => {
        const pos = result.positions![i];
        xyzData += `${symbol} ${pos[0].toFixed(6)} ${pos[1].toFixed(6)} ${pos[2].toFixed(6)}\n`;
      });

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
  }, [result]);

  // Update representation / forces when toggled
  useEffect(() => {
    const v = viewerInstance.current;
    if (!v || !result.symbols) return;
    applyView(v, representation, showForces);
  }, [representation, showForces]);

  // Spin toggle
  useEffect(() => {
    const v = viewerInstance.current;
    if (!v) return;
    v.spin?.(spin);
  }, [spin]);

  const handleReset = () => {
    viewerInstance.current?.zoomTo?.();
    viewerInstance.current?.render?.();
  };

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
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const hasForces = !!result.forces?.length;

  const Button = ({
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
      {/* Header & toolbar */}
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
          {/* Representation */}
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
                className={`flex h-8 w-8 items-center justify-center rounded-l last:rounded-l-none transition-colors ${
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
            <Button
              onClick={() => setShowForces(!showForces)}
              title={showForces ? "Hide force vectors" : "Show force vectors"}
              active={showForces}
              disabled={!hasForces}
            >
              {showForces ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button
              onClick={() => setSpin(!spin)}
              title={spin ? "Stop rotation" : "Auto-rotate"}
              active={spin}
            >
              <CircleDot className="h-4 w-4" />
            </Button>
            <Button onClick={handleReset} title="Reset view">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              onClick={toggleFullscreen}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              active={fullscreen}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Viewer canvas */}
      <div
        className={`relative overflow-hidden rounded-lg border border-matrix-green/20 bg-black shadow-inner ${
          fullscreen ? "min-h-0 flex-1" : ""
        }`}
      >
        <div
          ref={viewerRef}
          className="h-full w-full"
          style={{
            position: "relative",
            height: fullscreen ? "100%" : 420,
            minHeight: 420,
          }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-matrix-green/30 border-t-matrix-green" />
          </div>
        )}
      </div>

      <p className="mt-2 font-mono text-xs text-zinc-500">
        Drag to rotate • Scroll to zoom • Right-drag to pan
        {hasForces && " • Green arrows = force vectors"}
      </p>
    </div>
  );
}
