"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  AlertCircle,
  Zap,
  X,
} from "lucide-react";
import { FileUploadSection } from "@/components/calculate/file-upload-section";
import { ParameterPanel } from "@/components/calculate/parameter-panel";
import { MetricsDashboard } from "@/components/calculate/metrics-dashboard";
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
  return (
    <Suspense>
      <CalculatePageInner />
    </Suspense>
  );
}

function CalculatePageInner() {
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
  const [customModelFile, setCustomModelFile] = useState<File | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Demo mode — guided overlay steps
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const searchParams = useSearchParams();

  const loadDemoStructure = useCallback(async () => {
    try {
      const res = await fetch("/demo/ethanol.xyz");
      const text = await res.text();
      const file = new File([text], "ethanol.xyz", { type: "text/plain" });
      setUploadedFiles([file]);
      setDemoStep(0);
    } catch {
      // silently fail if demo file not available
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("demo") === "true" && uploadedFiles.length === 0) {
      loadDemoStructure();
    }
  }, [searchParams, loadDemoStructure, uploadedFiles.length]);

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
      if (customModelFile && params.modelType === "custom") {
        formData.append("model", customModelFile);
      }

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
    <div className="relative min-h-screen bg-[var(--color-bg-primary)]">
      {/* Ambient glow */}
      <div className="ambient-glow pointer-events-none fixed inset-0 z-0" aria-hidden />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
            >
              &larr; Home
            </Link>
            <div className="h-4 w-px bg-[var(--color-border-subtle)]" />
            <h1 className="font-sans text-lg font-bold text-white">
              MACE <span className="text-[var(--color-accent-primary)]">Calculator</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`h-2 w-2 rounded-full ${
                isCalculating
                  ? "bg-[var(--color-warning)] animate-glow-pulse"
                  : result
                    ? "bg-[var(--color-success)]"
                    : "bg-[var(--color-text-muted)]"
              }`}
            />
          </div>
        </div>
      </header>

      {/* Main Content — Two-Panel Layout */}
      <main className="relative z-10 mx-auto max-w-screen-2xl p-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Panel — Input Controls */}
          <aside className="space-y-6 lg:col-span-4">
            <FileUploadSection
              files={uploadedFiles}
              onFilesChange={setUploadedFiles}
            />
            <ParameterPanel
              params={params}
              onChange={setParams}
              customModelFile={customModelFile}
              onCustomModelChange={setCustomModelFile}
            />
          </aside>

          {/* Right Panel — Execution + Results */}
          <section className="space-y-6 lg:col-span-8">
            {/* Run Card */}
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5">
              <button
                onClick={handleCalculate}
                disabled={isCalculating || uploadedFiles.length === 0}
                className="group relative w-full overflow-hidden rounded-md border-2 border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 px-8 py-4 font-sans text-lg font-bold text-[var(--color-accent-primary)] transition-all hover:bg-[var(--color-accent-primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--color-accent-primary)]/10 disabled:hover:text-[var(--color-accent-primary)]"
              >
                {isCalculating ? (
                  <span className="flex items-center justify-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Computing...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="h-5 w-5" />
                    RUN MACE CALCULATION
                  </span>
                )}
              </button>

              {/* Smart Progress Feedback */}
              {isCalculating && (
                <div className="mt-5 space-y-4">
                  {elapsedSeconds >= 3 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {phases.map((phase, i) => (
                        <div key={phase} className="flex items-center gap-1.5">
                          {i < currentPhase ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)]" />
                          ) : i === currentPhase ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent-primary)]" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                          )}
                          <span
                            className={`font-mono text-xs ${
                              i < currentPhase
                                ? "text-[var(--color-success)]/60 line-through"
                                : i === currentPhase
                                  ? "text-[var(--color-accent-primary)] font-bold"
                                  : "text-[var(--color-text-muted)]"
                            }`}
                          >
                            {phase}
                          </span>
                          {i < phases.length - 1 && (
                            <span className="text-[var(--color-text-muted)]">&rarr;</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface)]">
                      {elapsedSeconds >= 10 ? (
                        <div
                          className="h-full rounded-full bg-[var(--color-accent-primary)] transition-all duration-700"
                          style={{ width: `${progressPct}%` }}
                        />
                      ) : (
                        <div
                          className="h-full w-1/3 rounded-full bg-[var(--color-accent-primary)]"
                          style={{
                            animation: "shimmer 1.5s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between font-mono text-xs text-[var(--color-text-muted)]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Elapsed: {elapsedSeconds}s
                      </div>
                      {elapsedSeconds >= 10 && (
                        <span>
                          ~{estRemaining}s remaining &middot; {progressPct}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-error)]" />
                <div>
                  <p className="font-sans text-sm font-bold text-[var(--color-error)]">
                    Calculation Error
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--color-error)]/80">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Skeleton Loading */}
            {isCalculating && elapsedSeconds >= 1 && <ResultsSkeleton />}

            {/* Results — tabbed scientific dashboard */}
            {result && !isCalculating && (
              <div className="animate-fade-in-up">
                <MetricsDashboard result={result} filename={uploadedFiles[0]?.name} />
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ── Demo Mode Guided Overlay ── */}
      {demoStep != null && demoStep < DEMO_STEPS.length && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-6 pointer-events-none">
          <div className="pointer-events-auto max-w-lg rounded-lg border border-[var(--color-accent-primary)]/30 bg-[var(--color-bg-elevated)] p-5 shadow-xl backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-[var(--color-accent-primary)]">
                Quick Demo &middot; Step {demoStep + 1}/{DEMO_STEPS.length}
              </span>
              <button
                onClick={() => setDemoStep(null)}
                className="text-[var(--color-text-muted)] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--color-text-primary)]">
              {DEMO_STEPS[demoStep]}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              {demoStep > 0 && (
                <button
                  onClick={() => setDemoStep(demoStep - 1)}
                  className="rounded px-3 py-1 font-sans text-xs text-[var(--color-text-muted)] hover:text-white"
                >
                  Back
                </button>
              )}
              <button
                onClick={() =>
                  setDemoStep(demoStep + 1 < DEMO_STEPS.length ? demoStep + 1 : null)
                }
                className="rounded bg-[var(--color-accent-primary)] px-3 py-1 font-sans text-xs text-white hover:bg-[var(--color-accent-primary)]/90"
              >
                {demoStep + 1 < DEMO_STEPS.length ? "Next" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Demo guided tour steps
const DEMO_STEPS = [
  "Your structure is loaded (ethanol molecule). You can also upload your own .xyz, .cif, .poscar, or .pdb file, or browse the ml-peg catalog.",
  "Choose your model and calculation type in the left panel. Try Molecular Dynamics for trajectory animations, or Geometry Optimization to relax the structure.",
  "Click \"Run MACE Calculation\" to compute energies and forces. Results will appear in a tabbed dashboard with scientific visualizations.",
];

// ═══════════════════════════════════════════════════════════════════════════
// Skeleton placeholder — matches MetricsDashboard card layout
// ═══════════════════════════════════════════════════════════════════════════

function ResultsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-14 rounded-lg bg-[var(--color-bg-elevated)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-lg border-l-4 border-l-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]" />
        <div className="h-28 rounded-lg border-l-4 border-l-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]" />
      </div>
      <div className="h-[420px] rounded-lg bg-[var(--color-bg-elevated)]" />
      <div className="h-52 rounded-lg bg-[var(--color-bg-elevated)]" />
    </div>
  );
}
