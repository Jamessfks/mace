"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  AlertCircle,
  Zap,
} from "lucide-react";
import { FileUploadSection } from "@/components/calculate/file-upload-section";
import { ParameterPanel } from "@/components/calculate/parameter-panel";
import { ResultsDisplay } from "@/components/calculate/results-display";
import type { CalculationParams, CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Progress phase definitions per calculation type
// ---------------------------------------------------------------------------

const PHASE_MAP: Record<string, string[]> = {
  "single-point": [
    "Parsing structure",
    "Loading MACE model",
    "Computing energy & forces",
    "Formatting results",
  ],
  "geometry-opt": [
    "Parsing structure",
    "Loading MACE model",
    "Optimizing geometry",
    "Formatting results",
  ],
  "molecular-dynamics": [
    "Parsing structure",
    "Loading MACE model",
    "Running MD simulation",
    "Collecting trajectory",
  ],
};

/** Rough estimated total time (seconds) by calculation type. */
function getEstimatedTime(calcType: string, mdSteps?: number): number {
  switch (calcType) {
    case "single-point":
      return 12;
    case "geometry-opt":
      return 50;
    case "molecular-dynamics":
      return Math.max(30, (mdSteps || 100) * 0.3);
    default:
      return 15;
  }
}

/** Estimate which phase (0-indexed) based on elapsed time ratio. */
function estimatePhase(elapsed: number, estimated: number): number {
  const ratio = elapsed / estimated;
  if (ratio < 0.08) return 0;
  if (ratio < 0.3) return 1;
  if (ratio < 0.85) return 2;
  return 3;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function CalculatePage() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [params, setParams] = useState<CalculationParams>({
    modelSize: "medium",
    modelType: "MACE-MP-0",
    precision: "float32",
    device: "cpu",
    calculationType: "single-point",
    dispersion: false,
    temperature: 300,
    pressure: 0,
    timeStep: 1.0,
    friction: 0.005,
    mdSteps: 100,
    mdEnsemble: "NVT",
    forceThreshold: 0.05,
  });
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Elapsed time while calculating
  useEffect(() => {
    if (!isCalculating) {
      setElapsedSeconds(0);
      return;
    }
    const start = Date.now();
    const tick = () =>
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isCalculating]);

  // ── Handle calculation (unchanged logic) ──
  const handleCalculate = async () => {
    if (uploadedFiles.length === 0) {
      setError("Please upload at least one structure file");
      return;
    }
    if (params.calculationType === "phonon") {
      setError("Phonon Spectrum is not yet supported. Please choose another calculation type.");
      return;
    }
    setIsCalculating(true);
    setError(null);
    setResult(null);

    const startTime = Date.now();

    try {
      const formData = new FormData();
      uploadedFiles.forEach((file) => formData.append("files", file));
      formData.append("params", JSON.stringify(params));

      const response = await fetch("/api/calculate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Calculation failed");
      }

      const data: CalculationResult = await response.json();
      const timeTaken = Math.round((Date.now() - startTime) / 1000);
      setResult({ ...data, params, timeTaken });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setIsCalculating(false);
    }
  };

  // ── Derived progress values ──
  const phases =
    PHASE_MAP[params.calculationType] || PHASE_MAP["single-point"];
  const estimatedTotal = getEstimatedTime(
    params.calculationType,
    params.mdSteps
  );
  const currentPhase = estimatePhase(elapsedSeconds, estimatedTotal);
  const progressPct = Math.min(
    95,
    Math.round((elapsedSeconds / estimatedTotal) * 100)
  );
  const estRemaining = Math.max(0, estimatedTotal - elapsedSeconds);

  return (
    <div className="relative min-h-screen bg-black">
      {/* Subtle ambient glow */}
      <div className="neon-stable-glow" aria-hidden />

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-sm text-zinc-500 transition-colors hover:text-matrix-green"
            >
              ← Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="font-mono text-lg font-bold text-white">
              MACE <span className="text-matrix-green">Calculator</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/community"
              className="hidden font-mono text-xs text-zinc-600 transition-colors hover:text-matrix-green sm:inline"
            >
              Community DB →
            </Link>
            <div
              className={`h-2 w-2 rounded-full ${
                isCalculating
                  ? "bg-amber-500 animate-glow-pulse"
                  : result
                    ? "bg-matrix-green"
                    : "bg-zinc-700"
              }`}
            />
          </div>
        </div>
      </header>

      {/* ── Main Content — Two‑Panel Layout ── */}
      <main className="relative z-10 mx-auto max-w-screen-2xl p-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* ━━ Left Panel — Input Controls ━━ */}
          <aside className="space-y-6 lg:col-span-4">
            <FileUploadSection
              files={uploadedFiles}
              onFilesChange={setUploadedFiles}
            />
            <ParameterPanel params={params} onChange={setParams} />
          </aside>

          {/* ━━ Right Panel — Execution + Results ━━ */}
          <section className="space-y-6 lg:col-span-8">
            {/* ── Run Card ── */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              {/* Calculate Button */}
              <button
                onClick={handleCalculate}
                disabled={isCalculating || uploadedFiles.length === 0}
                className="group relative w-full overflow-hidden rounded-md border-2 border-matrix-green bg-matrix-green/10 px-8 py-4 font-mono text-lg font-bold text-matrix-green transition-all hover:bg-matrix-green hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-matrix-green/10 disabled:hover:text-matrix-green"
              >
                {isCalculating ? (
                  <span className="flex items-center justify-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Computing…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="h-5 w-5" />
                    RUN MACE CALCULATION
                  </span>
                )}
              </button>

              {/* ── Smart Progress Feedback ── */}
              {isCalculating && (
                <div className="mt-5 space-y-4">
                  {/* Phase Stepper (shown after 3 s) */}
                  {elapsedSeconds >= 3 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {phases.map((phase, i) => (
                        <div key={phase} className="flex items-center gap-1.5">
                          {i < currentPhase ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-matrix-green" />
                          ) : i === currentPhase ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-matrix-green" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-zinc-700" />
                          )}
                          <span
                            className={`font-mono text-xs ${
                              i < currentPhase
                                ? "text-matrix-green/60 line-through"
                                : i === currentPhase
                                  ? "text-matrix-green font-bold"
                                  : "text-zinc-600"
                            }`}
                          >
                            {phase}
                          </span>
                          {i < phases.length - 1 && (
                            <span className="text-zinc-700">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                      {elapsedSeconds >= 10 ? (
                        /* Determinate bar after 10 s */
                        <div
                          className="h-full rounded-full bg-matrix-green transition-all duration-700"
                          style={{ width: `${progressPct}%` }}
                        />
                      ) : (
                        /* Indeterminate shimmer under 10 s */
                        <div
                          className="h-full w-1/3 rounded-full bg-matrix-green"
                          style={{
                            animation: "shimmer 1.5s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>

                    {/* Timing info */}
                    <div className="flex items-center justify-between font-mono text-xs text-zinc-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Elapsed: {elapsedSeconds}s
                      </div>
                      {elapsedSeconds >= 10 && (
                        <span>
                          ~{estRemaining}s remaining · {progressPct}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Error Display ── */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="font-mono text-sm font-bold text-red-400">
                    Calculation Error
                  </p>
                  <p className="mt-1 font-mono text-xs text-red-400/80">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* ── Skeleton Loading (appears after 1 s) ── */}
            {isCalculating && elapsedSeconds >= 1 && <ResultsSkeleton />}

            {/* ── Results ── */}
            {result && !isCalculating && (
              <div className="animate-fade-in-up">
                <ResultsDisplay result={result} filename={uploadedFiles[0]?.name} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Skeleton placeholder — matches ResultsDisplay card layout
// ═══════════════════════════════════════════════════════════════════════════

function ResultsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Status banner */}
      <div className="h-14 rounded-lg bg-zinc-800/40" />
      {/* Property cards (2 cols) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-lg border-l-4 border-l-zinc-700 bg-zinc-800/40" />
        <div className="h-28 rounded-lg border-l-4 border-l-zinc-700 bg-zinc-800/40" />
      </div>
      {/* Viewer placeholder */}
      <div className="h-[420px] rounded-lg bg-zinc-800/40" />
      {/* Table placeholder */}
      <div className="h-52 rounded-lg bg-zinc-800/40" />
    </div>
  );
}
