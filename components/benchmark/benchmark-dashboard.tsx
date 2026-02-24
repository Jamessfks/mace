"use client";

/**
 * BenchmarkDashboard — Tabbed results container for benchmark output.
 *
 * Five sub-tabs: Leaderboard, Forces, Timing, Energy Landscape, Agreement.
 * Detects cross-family comparisons (MP-0 vs OFF) and warns that absolute
 * energy differences are not physically meaningful due to different
 * training DFT functionals (PBE vs ωB97M-D3BJ).
 */

import { useState, useMemo } from "react";
import {
  Trophy,
  ArrowRightLeft,
  Timer,
  TrendingUp,
  Grid3X3,
  AlertTriangle,
} from "lucide-react";
import { BenchmarkLeaderboard } from "./benchmark-leaderboard";
import { BenchmarkForceBars } from "./benchmark-force-bars";
import { BenchmarkTiming } from "./benchmark-timing";
import { BenchmarkEnergyLandscape } from "./benchmark-energy-landscape";
import { BenchmarkHeatmap } from "./benchmark-heatmap";
import { BenchmarkExport } from "./benchmark-export";
import type { BenchmarkResult } from "@/types/mace";

type TabId = "leaderboard" | "forces" | "timing" | "energy" | "heatmap";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: "leaderboard", label: "Leaderboard", icon: <Trophy className="h-3.5 w-3.5" /> },
  { id: "forces", label: "Forces", icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
  { id: "timing", label: "Timing", icon: <Timer className="h-3.5 w-3.5" /> },
  { id: "energy", label: "Energy Landscape", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "heatmap", label: "Agreement", icon: <Grid3X3 className="h-3.5 w-3.5" /> },
];

interface DashboardProps {
  result: BenchmarkResult;
}

export function BenchmarkDashboard({ result }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("leaderboard");

  const modelLabels = useMemo(() => {
    if (result.results.length === 0) return [];
    return result.results[0].models.map((m) => m.modelLabel);
  }, [result]);

  const isCrossFamily = useMemo(() => {
    const families = new Set(
      result.results[0]?.models.map((m) => m.modelType) ?? []
    );
    return families.has("MACE-MP-0") && families.has("MACE-OFF");
  }, [result]);

  return (
    <div className="space-y-5">
      {/* Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-success)]/20 bg-[var(--color-success)]/5 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)] animate-glow-pulse" />
          <span className="font-sans text-sm font-bold text-[var(--color-success)]">
            Benchmark Complete
          </span>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {modelLabels.join(" vs ")} — {result.summary.totalCalculations} calculations in{" "}
            {result.summary.totalTime.toFixed(1)}s
          </span>
          {result.summary.errorCount > 0 && (
            <span className="rounded bg-[var(--color-error)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--color-error)]">
              {result.summary.errorCount} error{result.summary.errorCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <BenchmarkExport result={result} />
      </div>

      {/* Cross-family warning */}
      {isCrossFamily && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-5 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-warning)]" />
          <div className="font-mono text-xs text-[var(--color-warning)]">
            <p className="font-semibold">Cross-family comparison</p>
            <p className="mt-0.5 text-[var(--color-warning)]/80">
              MACE-MP-0 and MACE-OFF are trained on different levels of theory (PBE vs
              ωB97M-D3BJ). Absolute energy differences between them are not physically meaningful.
              Compare forces and relative energies within each family instead.
            </p>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex overflow-x-auto border-b border-[var(--color-border-subtle)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-sans text-sm transition-colors ${
              activeTab === tab.id
                ? "border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "leaderboard" && <BenchmarkLeaderboard result={result} />}
        {activeTab === "forces" && <BenchmarkForceBars result={result} />}
        {activeTab === "timing" && <BenchmarkTiming result={result} />}
        {activeTab === "energy" && <BenchmarkEnergyLandscape result={result} />}
        {activeTab === "heatmap" && <BenchmarkHeatmap result={result} />}
      </div>
    </div>
  );
}
