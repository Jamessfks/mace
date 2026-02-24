"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SelectedModel } from "./benchmark-config";

interface ProgressEntry {
  structureId: string;
  structureName: string;
  models: { label: string; status: "pending" | "running" | "done" | "error" }[];
}

interface BenchmarkProgressProps {
  models: SelectedModel[];
  structureIds: string[];
  structureNames: Record<string, string>;
  completed: number;
  total: number;
  currentStructure?: string;
  currentModel?: string;
  errors: Set<string>;
  startTime: number;
}

export function BenchmarkProgress({
  models,
  structureIds,
  structureNames,
  completed,
  total,
  currentStructure,
  currentModel,
  errors,
  startTime,
}: BenchmarkProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgPerCalc = completed > 0 ? elapsed / completed : 0;
  const remaining = Math.max(0, Math.round(avgPerCalc * (total - completed)));

  const progressEntries: ProgressEntry[] = structureIds.map((sid) => {
    const completedForStructure = models.map((m) => {
      const key = `${sid}:${m.label}`;
      if (errors.has(key)) return { label: m.label, status: "error" as const };
      const structureIndex = structureIds.indexOf(sid);
      const modelIndex = models.indexOf(m);
      const calcIndex = structureIndex * models.length + modelIndex;
      if (calcIndex < completed) return { label: m.label, status: "done" as const };
      if (sid === currentStructure && m.label === currentModel) {
        return { label: m.label, status: "running" as const };
      }
      return { label: m.label, status: "pending" as const };
    });
    return {
      structureId: sid,
      structureName: structureNames[sid] || sid,
      models: completedForStructure,
    };
  });

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6">
      {/* Overall progress */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent-primary)]" />
            <span className="font-sans text-sm font-semibold text-[var(--color-text-primary)]">
              Running Benchmark
            </span>
          </div>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {completed}/{total} calculations
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-secondary)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--color-text-muted)]">
          <span>Elapsed: {formatTime(elapsed)}</span>
          <span>
            {remaining > 0 ? `~${formatTime(remaining)} remaining` : "Finishing up..."}
          </span>
        </div>
      </div>

      {/* Structure grid */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {progressEntries.map((entry) => (
          <div
            key={entry.structureId}
            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-2"
          >
            <p className="mb-1.5 truncate font-mono text-xs font-semibold text-[var(--color-text-secondary)]">
              {entry.structureName}
            </p>
            <div className="flex gap-1.5">
              {entry.models.map((m, i) => (
                <div key={i} className="flex items-center gap-1" title={m.label}>
                  <StatusDot status={m.status} />
                  <span className="font-mono text-[9px] text-[var(--color-text-muted)]">
                    {models[i]?.size?.[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "pending" | "running" | "done" | "error" }) {
  switch (status) {
    case "pending":
      return (
        <span className="h-2.5 w-2.5 rounded-full border border-[var(--color-border-emphasis)] bg-transparent" />
      );
    case "running":
      return (
        <span className="relative h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-accent-primary)]/50" />
          <span className="relative block h-2.5 w-2.5 rounded-full bg-[var(--color-accent-primary)]" />
        </span>
      );
    case "done":
      return (
        <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[var(--color-success)]">
          <span className="text-[6px] leading-none text-white">✓</span>
        </span>
      );
    case "error":
      return (
        <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[var(--color-error)]">
          <span className="text-[6px] leading-none text-white">✗</span>
        </span>
      );
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
