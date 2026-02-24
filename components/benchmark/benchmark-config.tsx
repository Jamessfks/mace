"use client";

import { useState, useMemo } from "react";
import { Play, AlertTriangle, Upload, X } from "lucide-react";
import { MLPEG_CATALOG, type CatalogCategory } from "@/lib/mlpeg-catalog";
import type { ModelType, ModelSize } from "@/types/mace";

export interface SelectedModel {
  type: ModelType;
  size: ModelSize;
  label: string;
}

interface BenchmarkConfigProps {
  onRun: (models: SelectedModel[], structureIds: string[]) => void;
  isRunning: boolean;
}

interface ModelOption {
  type: ModelType;
  size: ModelSize;
  label: string;
  family: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { type: "MACE-MP-0", size: "small", label: "MACE-MP-0 (small)", family: "MACE-MP-0" },
  { type: "MACE-MP-0", size: "medium", label: "MACE-MP-0 (medium)", family: "MACE-MP-0" },
  { type: "MACE-MP-0", size: "large", label: "MACE-MP-0 (large)", family: "MACE-MP-0" },
  { type: "MACE-OFF", size: "small", label: "MACE-OFF (small)", family: "MACE-OFF" },
  { type: "MACE-OFF", size: "medium", label: "MACE-OFF (medium)", family: "MACE-OFF" },
  { type: "MACE-OFF", size: "large", label: "MACE-OFF (large)", family: "MACE-OFF" },
];

function modelKey(m: ModelOption | SelectedModel): string {
  return `${m.type}-${m.size}`;
}

export function BenchmarkConfig({ onRun, isRunning }: BenchmarkConfigProps) {
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(["MACE-MP-0-small", "MACE-MP-0-medium"])
  );
  const [selectedStructures, setSelectedStructures] = useState<Set<string>>(
    new Set(MLPEG_CATALOG.flatMap((c) => c.entries.map((e) => e.id)))
  );
  const [customModel, setCustomModel] = useState<File | null>(null);

  const toggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleStructure = (id: string) => {
    setSelectedStructures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (cat: CatalogCategory) => {
    setSelectedStructures((prev) => {
      const next = new Set(prev);
      const catIds = cat.entries.map((e) => e.id);
      const allSelected = catIds.every((id) => next.has(id));
      if (allSelected) {
        catIds.forEach((id) => next.delete(id));
      } else {
        catIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedStructures(
      new Set(MLPEG_CATALOG.flatMap((c) => c.entries.map((e) => e.id)))
    );
  };

  const clearAll = () => setSelectedStructures(new Set());

  const totalModels = selectedModels.size + (customModel ? 1 : 0);
  const totalStructures = selectedStructures.size;
  const totalCalcs = totalModels * totalStructures;
  const canRun = totalModels >= 2 && totalModels <= 3 && totalStructures >= 1;

  const resolvedModels = useMemo(() => {
    const models: SelectedModel[] = MODEL_OPTIONS
      .filter((m) => selectedModels.has(modelKey(m)))
      .map((m) => ({ type: m.type, size: m.size, label: m.label }));
    return models;
  }, [selectedModels]);

  const handleRun = () => {
    if (!canRun) return;
    onRun(resolvedModels, Array.from(selectedStructures));
  };

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Model Selection */}
        <div className="flex-1">
          <h3 className="mb-3 font-sans text-sm font-bold text-[var(--color-text-primary)]">
            Model Selection
            <span className="ml-2 font-mono text-xs font-normal text-[var(--color-text-muted)]">
              (pick 2–3)
            </span>
          </h3>

          {/* MACE-MP-0 */}
          <div className="mb-3">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              MACE-MP-0 — Materials
            </p>
            <div className="flex flex-wrap gap-2">
              {MODEL_OPTIONS.filter((m) => m.family === "MACE-MP-0").map((m) => {
                const key = modelKey(m);
                const checked = selectedModels.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleModel(key)}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-all ${
                      checked
                        ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-border-emphasis)] hover:text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {checked ? "✓ " : ""}{m.size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* MACE-OFF */}
          <div className="mb-3">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              MACE-OFF — Organic
            </p>
            <div className="flex flex-wrap gap-2">
              {MODEL_OPTIONS.filter((m) => m.family === "MACE-OFF").map((m) => {
                const key = modelKey(m);
                const checked = selectedModels.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleModel(key)}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-all ${
                      checked
                        ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-border-emphasis)] hover:text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {checked ? "✓ " : ""}{m.size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom model upload */}
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Custom Model
            </p>
            {customModel ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-accent-secondary)]/50 bg-[var(--color-accent-secondary)]/10 px-3 py-1.5">
                <Upload className="h-3 w-3 text-[var(--color-accent-secondary)]" />
                <span className="font-mono text-xs text-[var(--color-accent-secondary)]">
                  {customModel.name}
                </span>
                <button onClick={() => setCustomModel(null)} className="ml-auto">
                  <X className="h-3 w-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-border-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-emphasis)] hover:text-[var(--color-text-secondary)]">
                <Upload className="h-3 w-3" />
                Upload .model file
                <input
                  type="file"
                  accept=".model"
                  className="hidden"
                  onChange={(e) => setCustomModel(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {totalModels > 3 && (
            <div className="mt-3 flex items-center gap-2 rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-3 py-2 font-mono text-xs text-[var(--color-warning)]">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Max 3 models. Deselect one to proceed.
            </div>
          )}
        </div>

        {/* Structure Selection */}
        <div className="flex-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-sans text-sm font-bold text-[var(--color-text-primary)]">
              Structures
              <span className="ml-2 font-mono text-xs font-normal text-[var(--color-text-muted)]">
                ({totalStructures} selected)
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="font-mono text-[10px] text-[var(--color-accent-primary)] hover:underline"
              >
                Select All
              </button>
              <button
                onClick={clearAll}
                className="font-mono text-[10px] text-[var(--color-text-muted)] hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            {MLPEG_CATALOG.map((cat) => {
              const catIds = cat.entries.map((e) => e.id);
              const allChecked = catIds.every((id) => selectedStructures.has(id));
              const someChecked = catIds.some((id) => selectedStructures.has(id));

              return (
                <div key={cat.id}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="mb-1 flex w-full items-center gap-2 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                        allChecked
                          ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)] text-white"
                          : someChecked
                            ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/30 text-[var(--color-accent-primary)]"
                            : "border-[var(--color-border-emphasis)] bg-transparent"
                      }`}
                    >
                      {allChecked ? "✓" : someChecked ? "–" : ""}
                    </span>
                    <span className="font-sans text-xs font-semibold text-[var(--color-text-secondary)]">
                      {cat.name}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      ({cat.entries.length})
                    </span>
                  </button>

                  <div className="ml-6 space-y-0.5">
                    {cat.entries.map((entry) => {
                      const checked = selectedStructures.has(entry.id);
                      return (
                        <button
                          key={entry.id}
                          onClick={() => toggleStructure(entry.id)}
                          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
                        >
                          <span
                            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] ${
                              checked
                                ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)] text-white"
                                : "border-[var(--color-border-subtle)] bg-transparent"
                            }`}
                          >
                            {checked ? "✓" : ""}
                          </span>
                          <span className="font-mono text-xs text-[var(--color-text-muted)]">
                            {entry.name}
                          </span>
                          <span className="ml-auto font-mono text-[10px] text-[var(--color-text-muted)]/60">
                            {entry.formula}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Run button */}
      <div className="mt-6 flex items-center gap-4 border-t border-[var(--color-border-subtle)] pt-5">
        <button
          onClick={handleRun}
          disabled={!canRun || isRunning}
          className="flex items-center gap-2.5 rounded-lg bg-[var(--color-accent-primary)] px-6 py-2.5 font-sans text-sm font-semibold text-white transition-all hover:bg-[var(--color-accent-primary)]/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="h-4 w-4" />
          Run Benchmark
        </button>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {totalModels} model{totalModels !== 1 ? "s" : ""} × {totalStructures} structure{totalStructures !== 1 ? "s" : ""} ={" "}
          <span className="text-[var(--color-text-secondary)]">{totalCalcs}</span> calculations
        </span>
      </div>
    </div>
  );
}
