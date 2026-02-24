"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { BASE_LAYOUT, BASE_CONFIG, DATA_COLORS } from "@/components/calculate/charts/chart-config";
import type { BenchmarkResult } from "@/types/mace";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const MODEL_COLORS = [DATA_COLORS.blue, DATA_COLORS.red, DATA_COLORS.green];

interface TimingProps {
  result: BenchmarkResult;
}

export function BenchmarkTiming({ result }: TimingProps) {
  const modelLabels = useMemo(() => {
    if (result.results.length === 0) return [];
    return result.results[0].models.map((m) => m.modelLabel);
  }, [result]);

  const structureNames = result.results.map((r) => r.structureName);

  const traces = modelLabels.map((label, mi) => ({
    name: label,
    type: "bar" as const,
    y: structureNames,
    x: result.results.map((r) => r.models[mi]?.timeTaken ?? 0),
    orientation: "h" as const,
    marker: { color: MODEL_COLORS[mi] },
    hovertemplate: "%{y}<br>Time: %{x:.1f}s<extra>" + label + "</extra>",
  }));

  const stats = useMemo(() => {
    return modelLabels.map((label, mi) => {
      const times = result.results
        .map((r) => r.models[mi]?.timeTaken ?? 0)
        .filter((t) => t > 0);
      const total = times.reduce((a, b) => a + b, 0);
      const avg = times.length > 0 ? total / times.length : 0;
      return { label, total, avg, color: MODEL_COLORS[mi] };
    });
  }, [result, modelLabels]);

  const fastest = stats.reduce((a, b) => (a.total < b.total ? a : b), stats[0]);
  const speedups = stats
    .filter((s) => s !== fastest && s.total > 0)
    .map((s) => ({
      label: s.label,
      ratio: s.total / fastest.total,
    }));

  return (
    <div className="space-y-6">
      {/* Horizontal bar chart */}
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
        <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
          Computation Time by Structure
        </h3>
        <Plot
          data={traces}
          layout={{
            ...BASE_LAYOUT,
            barmode: "group",
            xaxis: {
              ...BASE_LAYOUT.xaxis,
              title: { text: "Time (seconds)", standoff: 10 },
            },
            yaxis: {
              ...BASE_LAYOUT.yaxis,
              autorange: "reversed" as const,
            },
            height: Math.max(350, result.results.length * 60 + 100),
            margin: { l: 140, r: 20, t: 30, b: 60 },
          }}
          config={BASE_CONFIG}
          className="w-full"
        />
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5">
        <h3 className="mb-4 font-sans text-sm font-bold text-[var(--color-text-primary)]">
          Timing Summary
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4"
              style={{ borderLeftWidth: 3, borderLeftColor: s.color }}
            >
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: s.color }}>
                {s.label}
              </p>
              <p className="font-mono text-xl font-bold text-white">
                {s.total.toFixed(1)}s
              </p>
              <p className="font-mono text-xs text-[var(--color-text-muted)]">
                Avg: {s.avg.toFixed(1)}s per structure
              </p>
            </div>
          ))}
        </div>

        {speedups.length > 0 && fastest && (
          <div className="mt-4 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-4 py-3">
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              {speedups.map((s) => (
                <span key={s.label}>
                  <span className="text-[var(--color-text-secondary)]">{fastest.label}</span> is{" "}
                  <span className="font-bold text-[var(--color-accent-primary)]">
                    {s.ratio.toFixed(1)}×
                  </span>{" "}
                  faster than{" "}
                  <span className="text-[var(--color-text-secondary)]">{s.label}</span>
                  {". "}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
