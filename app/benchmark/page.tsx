"use client";

/**
 * BenchmarkPage — Multi-model comparison against ml-peg structures.
 *
 * Three-phase UI: configuration → running → results.
 * The calculation is a single batch POST to /api/benchmark — the server
 * runs all (model × structure) pairs and returns everything at once.
 * Progress is shown as an indeterminate shimmer because individual
 * calculation status is not streamed.
 */

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { BenchmarkConfig, type SelectedModel } from "@/components/benchmark/benchmark-config";
import { BenchmarkProgress } from "@/components/benchmark/benchmark-progress";
import { BenchmarkDashboard } from "@/components/benchmark/benchmark-dashboard";
import { MLPEG_CATALOG } from "@/lib/mlpeg-catalog";
import type { BenchmarkResult } from "@/types/mace";

type Phase = "config" | "running" | "results";

const structureNameMap: Record<string, string> = {};
for (const cat of MLPEG_CATALOG) {
  for (const e of cat.entries) {
    structureNameMap[e.id] = e.name;
  }
}

export default function BenchmarkPage() {
  const [phase, setPhase] = useState<Phase>("config");
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  const [models, setModels] = useState<SelectedModel[]>([]);
  const [structureIds, setStructureIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const startTimeRef = useRef(Date.now());

  const handleRun = useCallback(
    async (
      selectedModels: SelectedModel[],
      selectedIds: string[],
      customModelFile?: File,
      userStructureFiles?: File[]
    ) => {
      setModels(selectedModels);
      setStructureIds(selectedIds);
      const structureCount = selectedIds.length + (userStructureFiles?.length ?? 0);
      setTotal(selectedModels.length * structureCount);
      setPhase("running");
      startTimeRef.current = Date.now();

      try {
        const payload = {
          models: selectedModels.map((m) => ({ type: m.type, size: m.size })),
          structureIds: selectedIds,
          calculationType: "single-point",
        };

        const hasFiles = !!customModelFile || (userStructureFiles && userStructureFiles.length > 0);

        let response: Response;
        if (hasFiles) {
          const formData = new FormData();
          formData.append("json", JSON.stringify(payload));
          if (customModelFile) {
            formData.append("model", customModelFile);
          }
          if (userStructureFiles) {
            for (const f of userStructureFiles) {
              formData.append("structures", f);
            }
          }
          response = await fetch("/api/benchmark", {
            method: "POST",
            body: formData,
          });
        } else {
          response = await fetch("/api/benchmark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Benchmark request failed");
        }

        const data: BenchmarkResult = await response.json();
        setResult(data);
        setPhase("results");
      } catch (err) {
        console.error("Benchmark failed:", err);
        setResult({
          status: "error",
          results: [],
          summary: {
            totalStructures: selectedIds.length,
            totalModels: selectedModels.length,
            totalCalculations: selectedModels.length * selectedIds.length,
            successCount: 0,
            errorCount: selectedModels.length * selectedIds.length,
            totalTime: (Date.now() - startTimeRef.current) / 1000,
          },
        });
        setPhase("results");
      }
    },
    []
  );

  const handleReset = () => {
    setPhase("config");
    setResult(null);
  };

  return (
    <div className="relative min-h-screen scientific-bg">
      <div className="ambient-glow pointer-events-none fixed inset-0 z-0" />
      <div className="dot-grid pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
            >
              <ArrowLeft className="h-3 w-3" />
              Home
            </Link>
            <span className="text-[var(--color-text-muted)]">/</span>
            <Link
              href="/calculate"
              className="font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
            >
              Calculator
            </Link>
            <span className="text-[var(--color-text-muted)]">/</span>
            <span className="font-mono text-xs text-[var(--color-text-secondary)]">Benchmark</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/30">
              <FlaskConical className="h-6 w-6 text-[var(--color-accent-primary)]" />
            </div>
            <div>
              <h1 className="font-sans text-2xl font-bold text-white sm:text-3xl">
                Multi-Model <span className="text-[var(--color-accent-primary)] text-shadow-accent">Benchmark</span>
              </h1>
              <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">
                Compare MACE models across ml-peg benchmark structures
              </p>
            </div>
          </div>

          {phase === "results" && (
            <button
              onClick={handleReset}
              className="mt-4 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-4 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)]"
            >
              ← New Benchmark
            </button>
          )}
        </header>

        {/* Content */}
        <main className="space-y-6">
          {phase === "config" && (
            <BenchmarkConfig onRun={handleRun} isRunning={false} />
          )}

          {phase === "running" && (
            <BenchmarkProgress
              models={models}
              structureIds={structureIds}
              structureNames={structureNameMap}
              total={total}
              startTime={startTimeRef.current}
            />
          )}

          {phase === "results" && result && (
            <>
              {result.status === "error" && result.results.length === 0 ? (
                <div className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-8 text-center">
                  <p className="font-sans text-lg font-bold text-[var(--color-error)]">
                    Benchmark Failed
                  </p>
                  <p className="mt-2 font-mono text-sm text-[var(--color-text-muted)]">
                    All calculations returned errors. Check that the Python backend is running.
                  </p>
                  <button
                    onClick={handleReset}
                    className="mt-4 rounded bg-[var(--color-accent-primary)] px-5 py-2 font-sans text-sm text-white hover:bg-[var(--color-accent-primary)]/90"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <BenchmarkDashboard result={result} />
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-12 border-t border-[var(--color-border-subtle)] pt-6 text-center">
          <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
            Inspired by{" "}
            <a
              href="https://ml-peg.stfc.ac.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent-primary)] hover:underline"
            >
              ml-peg
            </a>{" "}
            and{" "}
            <a
              href="https://mlip-testing.stfc.ac.uk:8050"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent-primary)] hover:underline"
            >
              STFC MLIP Testing
            </a>{" "}
            — MACE Benchmark Suite
          </p>
        </footer>
      </div>
    </div>
  );
}
