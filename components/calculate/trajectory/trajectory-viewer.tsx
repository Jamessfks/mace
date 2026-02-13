"use client";

/**
 * TrajectoryViewer — Animated MD trajectory player with energy chart.
 *
 * PURPOSE:
 *   Let materials scientists "watch" atoms move during a molecular dynamics
 *   simulation. This is the single most requested visualization for MD —
 *   without it, trajectory data is just numbers.
 *
 * FEATURES:
 *   - 3Dmol.js viewer with frame-by-frame trajectory animation
 *   - Play / pause / step-forward / step-backward controls
 *   - Frame slider for scrubbing through the trajectory
 *   - Adjustable playback speed (0.5×, 1×, 2×, 4×)
 *   - Energy-vs-step chart synced with the current frame
 *   - Click on chart to jump to a specific frame
 *   - Current energy + frame counter display
 *
 * HOW IT WORKS:
 *   1. On mount, all trajectory frames are concatenated into a single
 *      multi-frame XYZ string.
 *   2. 3Dmol.js `addModelsAsFrames()` loads them as animation frames.
 *   3. A requestAnimationFrame loop drives playback at the chosen speed.
 *   4. Manual controls use `getModel().setFrame(n)` for instant seeking.
 *
 * DATA SOURCE:
 *   - result.trajectory.positions[frame][atom][xyz] — coordinates per frame
 *   - result.trajectory.energies[frame] — total energy per frame
 *   - result.trajectory.step[frame] — step indices
 *   - result.symbols — element symbols (same for all frames)
 *
 * SHOWN ONLY WHEN:
 *   The parent (results-display.tsx) renders this component only when
 *   calculationType === "molecular-dynamics" AND trajectory data exists.
 *
 * DEPENDENCIES:
 *   - 3dmol (npm) — dynamically imported
 *   - ./energy-chart.tsx — SVG energy-vs-step chart
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Gauge,
} from "lucide-react";
import type { CalculationResult } from "@/types/mace";
import { EnergyChart } from "@/components/calculate/trajectory/energy-chart";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TrajectoryViewerProps {
  /** Full calculation result containing trajectory + symbols. */
  result: CalculationResult;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available playback speed multipliers. */
const SPEEDS = [0.5, 1, 2, 4] as const;

/** Base interval between frames in ms (at 1× speed). */
const BASE_INTERVAL_MS = 150;

// ---------------------------------------------------------------------------
// Helper: build multi-frame XYZ string for 3Dmol.js addModelsAsFrames
// ---------------------------------------------------------------------------

/**
 * Concatenate all trajectory frames into a single multi-frame XYZ string.
 * 3Dmol.js `addModelsAsFrames` expects this format: each frame is a
 * complete XYZ block (atom count + comment + atom lines) back-to-back.
 */
function buildTrajectoryXYZ(
  symbols: string[],
  positions: number[][][],
  energies: number[]
): string {
  const atomCount = symbols.length;
  let xyz = "";

  for (let f = 0; f < positions.length; f++) {
    xyz += `${atomCount}\n`;
    xyz += `Frame ${f} | E = ${energies[f]?.toFixed(6) ?? "N/A"} eV\n`;
    for (let a = 0; a < atomCount; a++) {
      const [x, y, z] = positions[f][a];
      xyz += `${symbols[a]} ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
    }
  }

  return xyz;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrajectoryViewer({ result }: TrajectoryViewerProps) {
  const traj = result.trajectory!;
  const symbols = result.symbols!;
  const totalFrames = traj.positions.length;

  // ── State ──
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // index into SPEEDS (default 1×)
  const [viewerReady, setViewerReady] = useState(false);

  // ── Refs ──
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Pre-build the multi-frame XYZ string (memoized via ref to avoid recompute)
  const xyzDataRef = useRef<string>("");
  if (!xyzDataRef.current) {
    xyzDataRef.current = buildTrajectoryXYZ(
      symbols,
      traj.positions,
      traj.energies
    );
  }

  // ── Initialize 3Dmol.js viewer with trajectory frames ──
  useEffect(() => {
    if (!viewerRef.current) return;

    const resize = () => {
      viewerInstance.current?.resize?.();
      viewerInstance.current?.render?.();
    };

    import("3dmol").then(($3Dmol) => {
      if (!viewerRef.current) return;

      viewerRef.current.innerHTML = "";
      const viewer = $3Dmol.createViewer(viewerRef.current, {
        backgroundColor: "black",
      });
      viewerInstance.current = viewer;

      // Load all frames at once — 3Dmol manages frame switching internally
      const model = viewer.addModelsAsFrames(xyzDataRef.current, "xyz");
      modelRef.current = model;

      viewer.setStyle(
        {},
        { stick: { radius: 0.2 }, sphere: { scale: 0.25 } }
      );
      viewer.enableFog(false);
      viewer.zoomTo();
      viewer.render();

      // Responsive resize
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(viewerRef.current);

      setViewerReady(true);
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      viewerInstance.current?.clear?.();
    };
  }, []);

  // ── Sync 3Dmol frame when currentFrame changes ──
  useEffect(() => {
    if (!viewerReady || !viewerInstance.current) return;
    viewerInstance.current.setFrame(currentFrame);
    viewerInstance.current.render();
  }, [currentFrame, viewerReady]);

  // ── Animation loop (driven by requestAnimationFrame for smooth playback) ──
  useEffect(() => {
    if (!playing) return;

    const speed = SPEEDS[speedIdx];
    const interval = BASE_INTERVAL_MS / speed;

    const tick = (timestamp: number) => {
      if (timestamp - lastTickRef.current >= interval) {
        lastTickRef.current = timestamp;
        setCurrentFrame((prev) => {
          const next = prev + 1;
          // Stop at last frame
          if (next >= totalFrames) {
            setPlaying(false);
            return totalFrames - 1;
          }
          return next;
        });
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, speedIdx, totalFrames]);

  // ── Playback controls ──
  const togglePlay = useCallback(() => {
    // If at end, restart from beginning
    if (currentFrame >= totalFrames - 1 && !playing) {
      setCurrentFrame(0);
    }
    setPlaying((p) => !p);
  }, [currentFrame, totalFrames, playing]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    setCurrentFrame((p) => Math.min(p + 1, totalFrames - 1));
  }, [totalFrames]);

  const stepBackward = useCallback(() => {
    setPlaying(false);
    setCurrentFrame((p) => Math.max(p - 1, 0));
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    setCurrentFrame(0);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((i) => (i + 1) % SPEEDS.length);
  }, []);

  // ── Derived display values ──
  const currentEnergy = traj.energies[currentFrame];
  const speed = SPEEDS[speedIdx];

  return (
    <div className="space-y-4">
      {/* ── 3D Viewer ── */}
      <div className="relative overflow-hidden rounded-lg border border-matrix-green/20 bg-black shadow-inner">
        <div
          ref={viewerRef}
          className="w-full"
          style={{ position: "relative", height: 380, minHeight: 380 }}
        />
        {/* Loading overlay */}
        {!viewerReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-matrix-green/30 border-t-matrix-green" />
          </div>
        )}
        {/* Frame badge overlay (top-right) */}
        {viewerReady && (
          <div className="absolute right-3 top-3 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-matrix-green backdrop-blur-sm">
            Frame {currentFrame + 1}/{totalFrames}
          </div>
        )}
      </div>

      {/* ── Transport Controls ── */}
      <div className="flex items-center gap-3">
        {/* Playback buttons */}
        <div className="flex items-center gap-1">
          <ControlButton onClick={reset} title="Reset to first frame">
            <RotateCcw className="h-3.5 w-3.5" />
          </ControlButton>
          <ControlButton onClick={stepBackward} title="Previous frame">
            <SkipBack className="h-3.5 w-3.5" />
          </ControlButton>
          <button
            onClick={togglePlay}
            title={playing ? "Pause" : "Play"}
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
              playing
                ? "border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-matrix-green bg-matrix-green/10 text-matrix-green hover:bg-matrix-green/20"
            }`}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </button>
          <ControlButton onClick={stepForward} title="Next frame">
            <SkipForward className="h-3.5 w-3.5" />
          </ControlButton>
          <ControlButton onClick={cycleSpeed} title={`Speed: ${speed}×`}>
            <Gauge className="h-3.5 w-3.5" />
          </ControlButton>
        </div>

        {/* Speed badge */}
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          {speed}×
        </span>

        {/* Frame slider */}
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={(e) => {
            setPlaying(false);
            setCurrentFrame(Number(e.target.value));
          }}
          className="flex-1 accent-[#00ff41]"
          title={`Frame ${currentFrame + 1}`}
        />

        {/* Current energy readout */}
        <div className="shrink-0 text-right font-mono text-xs">
          <span className="text-zinc-500">E = </span>
          <span className="text-white">{currentEnergy?.toFixed(4)}</span>
          <span className="text-zinc-500"> eV</span>
        </div>
      </div>

      {/* ── Energy vs Step Chart ── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <h4 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
          Energy vs. MD Step
        </h4>
        <EnergyChart
          energies={traj.energies}
          steps={traj.step.length > 0 ? traj.step : traj.energies.map((_, i) => i)}
          currentFrame={currentFrame}
          onFrameSelect={(i) => {
            setPlaying(false);
            setCurrentFrame(i);
          }}
        />
      </div>

      {/* ── Footer ── */}
      <p className="font-mono text-[10px] text-zinc-600">
        Drag to rotate · Scroll to zoom · Click chart to jump to frame ·
        Keyboard: Space = play/pause
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control Button — small square toolbar button
// ---------------------------------------------------------------------------

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
      className="flex h-7 w-7 items-center justify-center rounded border border-matrix-green/30 bg-black/60 text-zinc-400 transition-colors hover:border-matrix-green/60 hover:text-matrix-green"
    >
      {children}
    </button>
  );
}
