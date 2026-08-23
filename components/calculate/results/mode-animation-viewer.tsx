"use client";

/**
 * ModeAnimationViewer — animates one normal mode using the existing 3Dmol.js
 * pipeline.
 *
 * HOW: builds a synthetic multi-frame XYZ trajectory exactly the way
 * trajectory-viewer.tsx does for MD (`addModelsAsFrames`), but the frames are
 * generated client-side from the equilibrium geometry and one mode's
 * displacement vector rather than read off a real trajectory. This reuses a
 * pipeline already proven in this codebase instead of introducing a second
 * way to talk to 3Dmol.
 *
 * SCHEME (verbatim from docs/schemas/sample-vibrations-water.json,
 * vibrations.animation): `positions(t) = positions + sin(2*pi*t) *
 * displacementsAngstrom`. `displacementsAngstrom` is already rescaled so the
 * largest single-atom displacement equals `amplitudeAngstrom` — this
 * component does not re-scale it. Sampling t = i/frames for frames = 20
 * (`animation.suggestedFrames`) covers exactly one full oscillation.
 */

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipForward, SkipBack, RotateCcw } from "lucide-react";
import type { GLViewer } from "3dmol";
import type { VibrationMode, VibrationsAnimationSpec } from "@/types/mace-results-ext";

interface ModeAnimationViewerProps {
  symbols: string[];
  /** Equilibrium (relaxed) Cartesian positions, Å — one [x,y,z] per atom. */
  equilibriumPositions: number[][];
  mode: VibrationMode;
  animation?: VibrationsAnimationSpec;
}

const DEFAULT_FRAMES = 20;
const INTERVAL_MS = 60;

function buildModeFrames(
  symbols: string[],
  equilibrium: number[][],
  displacements: number[][],
  frames: number,
): string {
  let xyz = "";
  for (let f = 0; f < frames; f++) {
    const t = f / frames;
    const scale = Math.sin(2 * Math.PI * t);
    xyz += `${symbols.length}\n`;
    xyz += `Mode animation frame ${f} | phase=${t.toFixed(3)}\n`;
    for (let a = 0; a < symbols.length; a++) {
      const [ex, ey, ez] = equilibrium[a];
      const [dx, dy, dz] = displacements[a] ?? [0, 0, 0];
      xyz += `${symbols[a]} ${(ex + scale * dx).toFixed(6)} ${(ey + scale * dy).toFixed(6)} ${(ez + scale * dz).toFixed(6)}\n`;
    }
  }
  return xyz;
}

export function ModeAnimationViewer({
  symbols,
  equilibriumPositions,
  mode,
  animation,
}: ModeAnimationViewerProps) {
  const frames = animation?.suggestedFrames ?? DEFAULT_FRAMES;
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<GLViewer | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);

  const xyzData = buildModeFrames(symbols, equilibriumPositions, mode.displacementsAngstrom, frames);

  // Rebuild the viewer whenever the animated mode changes (new xyz data).
  useEffect(() => {
    if (!viewerRef.current) return;
    setViewerReady(false);
    setCurrentFrame(0);

    let cancelled = false;
    import("3dmol").then(($3Dmol) => {
      if (cancelled || !viewerRef.current) return;
      viewerRef.current.innerHTML = "";
      const viewer = $3Dmol.createViewer(viewerRef.current, {
        backgroundColor: "#FBFAF7",
      });
      viewerInstance.current = viewer;
      viewer.addModelsAsFrames(xyzData, "xyz");
      viewer.setStyle({}, { stick: { radius: 0.18 }, sphere: { scale: 0.28 } });
      viewer.enableFog(false);
      viewer.zoomTo();
      viewer.render();
      setViewerReady(true);
    });

    return () => {
      cancelled = true;
      viewerInstance.current?.clear?.();
    };
  }, [mode.index, xyzData]);

  // Sync 3Dmol frame.
  useEffect(() => {
    if (!viewerReady || !viewerInstance.current) return;
    viewerInstance.current.setFrame(currentFrame);
    viewerInstance.current.render();
  }, [currentFrame, viewerReady]);

  // Looping playback — a normal mode oscillates indefinitely, unlike an MD
  // trajectory that has a real endpoint, so this wraps rather than stopping.
  useEffect(() => {
    if (!playing) return;
    const tick = (timestamp: number) => {
      if (timestamp - lastTickRef.current >= INTERVAL_MS) {
        lastTickRef.current = timestamp;
        setCurrentFrame((prev) => (prev + 1) % frames);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    lastTickRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, frames]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] shadow-inner">
        <div ref={viewerRef} className="relative w-full" style={{ height: 300 }}>
          {!viewerReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-secondary)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent-primary)]" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <ControlButton onClick={() => { setPlaying(false); setCurrentFrame(0); }} title="Reset">
            <RotateCcw className="h-3.5 w-3.5" />
          </ControlButton>
          <ControlButton
            onClick={() => { setPlaying(false); setCurrentFrame((p) => (p - 1 + frames) % frames); }}
            title="Previous frame"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </ControlButton>
          <button
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause" : "Play"}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
              playing
                ? "border-amber-500 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                : "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/20"
            }`}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
          </button>
          <ControlButton
            onClick={() => { setPlaying(false); setCurrentFrame((p) => (p + 1) % frames); }}
            title="Next frame"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </ControlButton>
        </div>
        <input
          type="range"
          min={0}
          max={frames - 1}
          value={currentFrame}
          onChange={(e) => { setPlaying(false); setCurrentFrame(Number(e.target.value)); }}
          className="flex-1 accent-[var(--color-accent-primary)]"
        />
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {mode.imaginary ? "−" : ""}
          {Math.abs(mode.frequencyCm1).toFixed(1)} cm⁻¹
        </span>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        {animation?.note ??
          "Displacement is scaled for visibility. Direction and relative magnitude are physical; the overall scale is a display choice."}
      </p>
    </div>
  );
}

function ControlButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-accent-primary)]"
    >
      {children}
    </button>
  );
}
