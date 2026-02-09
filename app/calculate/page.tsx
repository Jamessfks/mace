"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileUploadSection } from "@/components/calculate/file-upload-section";
import { ParameterPanel } from "@/components/calculate/parameter-panel";
import { ResultsDisplay } from "@/components/calculate/results-display";
import type { CalculationParams, CalculationResult } from "@/types/mace";

/**
 * MACE Calculator — Web interface for running MACE calculations
 * without coding knowledge
 */
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
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isCalculating]);

  const handleCalculate = async () => {
    if (uploadedFiles.length === 0) {
      setError("Please upload at least one structure file");
      return;
    }
    setIsCalculating(true);
    setError(null);

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

  return (
    <div className="relative min-h-screen bg-black">
      {/* Subtle Matrix glow */}
      <div className="neon-stable-glow" aria-hidden />
      <div className="scan-lines pointer-events-none fixed inset-0 z-50" />

      {/* Header */}
      <header className="relative z-10 border-b border-matrix-green/20 bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-mono text-sm text-zinc-400 transition-colors hover:text-matrix-green"
            >
              ← Home
            </Link>
            <h1 className="font-mono text-xl font-bold text-matrix-green">
              MACE Calculator
            </h1>
          </div>
          <span className="font-mono text-xs text-zinc-500">
            Web Interface • No Coding Required
          </span>
        </div>
      </header>

      {/* Main Content — Three Column Layout */}
      <main className="relative z-10 mx-auto max-w-screen-2xl p-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Sidebar — Parameter Controls */}
          <aside className="lg:col-span-3">
            <ParameterPanel params={params} onChange={setParams} />
          </aside>

          {/* Center — File Upload & Visualization */}
          <section className="lg:col-span-6">
            <FileUploadSection
              files={uploadedFiles}
              onFilesChange={setUploadedFiles}
            />

            {/* Calculate Button */}
            <div className="mt-6">
              <button
                onClick={handleCalculate}
                disabled={isCalculating || uploadedFiles.length === 0}
                className="group relative w-full overflow-hidden border-2 border-matrix-green bg-matrix-green/10 px-8 py-4 font-mono text-lg font-bold text-matrix-green transition-all hover:bg-matrix-green hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCalculating ? (
                  <span className="flex items-center justify-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Calculating...
                  </span>
                ) : (
                  "RUN MACE CALCULATION"
                )}
              </button>

              {/* Progress bar + elapsed time */}
              {isCalculating && (
                <div className="mt-3 space-y-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-matrix-green/20">
                    <div
                      className="h-full w-1/3 rounded-full bg-matrix-green"
                      style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
                    />
                  </div>
                  <p className="font-mono text-xs text-zinc-500">
                    Elapsed: {elapsedSeconds}s — MACE calculations may take 30s–2min
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded border border-red-500/50 bg-red-500/10 p-4 font-mono text-sm text-red-400">
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Results Display */}
            {result && (
              <div className="mt-6">
                <ResultsDisplay result={result} />
              </div>
            )}
          </section>

          {/* Right Sidebar — Results Summary */}
          <aside className="lg:col-span-3">
            <div className="sticky top-6 rounded-lg border border-matrix-green/20 bg-black/80 p-6">
              <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
                RESULTS SUMMARY
              </h2>
              {!result ? (
                <p className="font-mono text-xs text-zinc-500">
                  Upload a structure and run calculation to see results here.
                </p>
              ) : (
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-zinc-500">Status:</span>
                    <span className="ml-2 text-matrix-green">
                      {result.status}
                    </span>
                  </div>
                  {result.timeTaken != null && (
                    <div>
                      <span className="text-zinc-500">Time:</span>
                      <span className="ml-2 text-white">{result.timeTaken}s</span>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500">Energy:</span>
                    <span className="ml-2 text-white">
                      {result.energy?.toFixed(4)} eV
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Forces:</span>
                    <span className="ml-2 text-white">
                      {result.forces?.length || 0} atoms
                    </span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
