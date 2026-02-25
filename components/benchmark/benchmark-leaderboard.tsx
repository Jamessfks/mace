"use client";

/**
 * BenchmarkLeaderboard — Sortable table comparing model results.
 *
 * Rows = structures, columns = models (energy/atom). Sortable by any
 * column. Cells are color-coded: green for lowest energy per row,
 * yellow/red for high ΔE_max (>5 / >10 meV). Rows expand to show
 * per-atom force magnitudes.
 *
 * Aggregate footer shows average energy/atom and total time per model.
 */

import { useState, useMemo, Fragment } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, ChevronRight } from "lucide-react";
import { DATA_COLORS } from "@/components/calculate/charts/chart-config";
import type { BenchmarkResult, BenchmarkStructureResult } from "@/types/mace";

const MODEL_COLORS = [DATA_COLORS.blue, DATA_COLORS.red, DATA_COLORS.green];

type SortKey = "structure" | "category" | "atoms" | "deltaE" | `model-${number}`;
type SortDir = "asc" | "desc";

interface LeaderboardProps {
  result: BenchmarkResult;
}

export function BenchmarkLeaderboard({ result }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("structure");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const modelLabels = useMemo(() => {
    if (result.results.length === 0) return [];
    return result.results[0].models.map((m) => m.modelLabel);
  }, [result]);

  const deltaE = (row: BenchmarkStructureResult): number => {
    const energies = row.models
      .filter((m) => m.status === "success" && m.energyPerAtom != null)
      .map((m) => m.energyPerAtom!);
    if (energies.length < 2) return 0;
    return (Math.max(...energies) - Math.min(...energies)) * 1000;
  };

  const sorted = useMemo(() => {
    const rows = [...result.results];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "structure":
          cmp = a.structureName.localeCompare(b.structureName);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "atoms":
          cmp = a.atomCount - b.atomCount;
          break;
        case "deltaE":
          cmp = deltaE(a) - deltaE(b);
          break;
        default:
          if (sortKey.startsWith("model-")) {
            const idx = parseInt(sortKey.split("-")[1]);
            const aE = a.models[idx]?.energyPerAtom ?? Infinity;
            const bE = b.models[idx]?.energyPerAtom ?? Infinity;
            cmp = aE - bE;
          }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [result, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  };

  const lowestEnergyPerRow = (row: BenchmarkStructureResult): number | null => {
    const energies = row.models
      .filter((m) => m.status === "success" && m.energyPerAtom != null)
      .map((m) => m.energyPerAtom!);
    return energies.length > 0 ? Math.min(...energies) : null;
  };

  const aggregates = useMemo(() => {
    return modelLabels.map((_, mi) => {
      const energies: number[] = [];
      let totalTime = 0;
      result.results.forEach((r) => {
        const m = r.models[mi];
        if (m?.status === "success") {
          if (m.energyPerAtom != null) energies.push(m.energyPerAtom);
          totalTime += m.timeTaken ?? 0;
        }
      });
      const avgE = energies.length > 0
        ? energies.reduce((a, b) => a + b, 0) / energies.length
        : null;
      return { avgE, totalTime };
    });
  }, [result, modelLabels]);

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border-subtle)]">
      <table className="w-full font-mono text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
          <tr>
            <th className="w-5 px-2 py-2.5" />
            <th
              className="cursor-pointer px-3 py-2.5 text-left hover:text-[var(--color-text-secondary)]"
              onClick={() => handleSort("structure")}
            >
              Structure <SortIcon k="structure" />
            </th>
            <th
              className="cursor-pointer px-3 py-2.5 text-left hover:text-[var(--color-text-secondary)]"
              onClick={() => handleSort("category")}
            >
              Category <SortIcon k="category" />
            </th>
            <th
              className="cursor-pointer px-3 py-2.5 text-right hover:text-[var(--color-text-secondary)]"
              onClick={() => handleSort("atoms")}
            >
              Atoms <SortIcon k="atoms" />
            </th>
            <th className="px-3 py-2.5 text-right" style={{ color: DATA_COLORS.yellow }}>
              Ref (eV/atom)
            </th>
            {modelLabels.map((label, i) => (
              <th
                key={label}
                className="cursor-pointer px-3 py-2.5 text-right hover:text-[var(--color-text-secondary)]"
                onClick={() => handleSort(`model-${i}`)}
              >
                <span style={{ color: MODEL_COLORS[i] }}>{label}</span>{" "}
                <span className="text-[var(--color-text-muted)]">(E/atom)</span>{" "}
                <SortIcon k={`model-${i}`} />
              </th>
            ))}
            <th
              className="cursor-pointer px-3 py-2.5 text-right hover:text-[var(--color-text-secondary)]"
              onClick={() => handleSort("deltaE")}
            >
              ΔE<sub>max</sub> <SortIcon k="deltaE" />
            </th>
          </tr>
        </thead>
        <tbody className="text-[var(--color-text-secondary)]">
          {sorted.map((row) => {
            const de = deltaE(row);
            const highDisagreement = de > 10;
            const lowest = lowestEnergyPerRow(row);
            const isExpanded = expandedRow === row.structureId;

            return (
              <Fragment key={row.structureId}>
                <tr
                  className={`cursor-pointer border-t border-[var(--color-border-subtle)]/60 transition-colors hover:bg-[var(--color-bg-elevated)] ${
                    highDisagreement ? "bg-[var(--color-error)]/3" : ""
                  }`}
                  onClick={() =>
                    setExpandedRow(isExpanded ? null : row.structureId)
                  }
                >
                  <td className="px-2 py-2 text-center text-[var(--color-text-muted)]">
                    <ChevronRight
                      className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold text-[var(--color-text-primary)]">
                    {row.structureName}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">
                    {formatCategoryName(row.category)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.atomCount}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    style={{ color: DATA_COLORS.yellow }}
                    title={row.reference?.cohesiveEnergy?.source ?? "No reference data"}
                  >
                    {row.reference?.cohesiveEnergy
                      ? `${row.reference.cohesiveEnergy.value.toFixed(2)}`
                      : "—"}
                  </td>
                  {row.models.map((m, mi) => {
                    if (m.status === "error") {
                      return (
                        <td key={mi} className="px-3 py-2 text-right">
                          <span className="inline-flex items-center gap-1 text-[var(--color-error)]" title={m.error}>
                            <AlertTriangle className="h-3 w-3" /> Error
                          </span>
                        </td>
                      );
                    }
                    const isLowest = m.energyPerAtom != null && lowest != null && m.energyPerAtom === lowest;
                    return (
                      <td
                        key={mi}
                        className={`px-3 py-2 text-right tabular-nums ${isLowest ? "bg-[var(--color-success)]/8 text-[var(--color-success)]" : ""}`}
                        title={m.energy?.toFixed(8) ?? ""}
                      >
                        {m.energyPerAtom?.toFixed(4) ?? "N/A"} eV
                      </td>
                    );
                  })}
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-bold ${
                      highDisagreement
                        ? "text-[var(--color-error)]"
                        : de > 5
                          ? "text-[var(--color-warning)]"
                          : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {de.toFixed(1)} meV
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td
                      colSpan={5 + modelLabels.length + 1}
                      className="border-t border-[var(--color-border-subtle)]/30 bg-[var(--color-bg-primary)] px-4 py-3"
                    >
                      {row.reference?.cohesiveEnergy && (
                        <p className="mb-2 font-mono text-[10px] text-[var(--color-data-yellow)]">
                          Ref. cohesive energy: {row.reference.cohesiveEnergy.value.toFixed(2)} eV/atom
                          ({row.reference.cohesiveEnergy.source})
                          {row.reference.latticeConstant && (
                            <> · Lattice: {row.reference.latticeConstant.value.toFixed(3)} Å
                            ({row.reference.latticeConstant.source})</>
                          )}
                        </p>
                      )}
                      <ExpandedForceDetails row={row} modelColors={MODEL_COLORS} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>

        {/* Aggregate footer */}
        <tfoot className="border-t-2 border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)]">
          <tr>
            <td className="px-2 py-2.5" />
            <td className="px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Aggregate
            </td>
            <td />
            <td />
            <td />
            {aggregates.map((agg, i) => (
              <td key={i} className="px-3 py-2.5 text-right">
                <div className="font-mono text-xs tabular-nums text-[var(--color-text-secondary)]">
                  {agg.avgE != null ? `Avg: ${agg.avgE.toFixed(4)} eV` : "N/A"}
                </div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  Time: {agg.totalTime.toFixed(1)}s
                </div>
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ExpandedForceDetails({
  row,
  modelColors,
}: {
  row: BenchmarkStructureResult;
  modelColors: string[];
}) {
  const maxAtoms = Math.min(
    20,
    Math.max(...row.models.map((m) => m.forces?.length ?? 0))
  );

  if (maxAtoms === 0) {
    return (
      <p className="font-mono text-xs text-[var(--color-text-muted)]">
        No force data available for this structure.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        Per-Atom Force Magnitudes (eV/Å)
      </p>
      <div className="max-h-48 overflow-auto rounded border border-[var(--color-border-subtle)]">
        <table className="w-full font-mono text-[11px]">
          <thead className="sticky top-0 bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-2 py-1 text-left">#</th>
              <th className="px-2 py-1 text-left">Elem</th>
              {row.models.map((m, i) => (
                <th key={i} className="px-2 py-1 text-right" style={{ color: modelColors[i] }}>
                  |F| {m.modelLabel.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[var(--color-text-secondary)]">
            {Array.from({ length: maxAtoms }).map((_, ai) => {
              const sym = row.models.find((m) => m.symbols?.[ai])?.symbols?.[ai] ?? "—";
              return (
              <tr key={ai} className="border-t border-[var(--color-border-subtle)]/40">
                <td className="px-2 py-0.5 text-[var(--color-text-muted)]">{ai + 1}</td>
                <td className="px-2 py-0.5 font-semibold">{sym}</td>
                {row.models.map((m, mi) => {
                  const f = m.forces?.[ai];
                  const mag = f
                    ? Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2)
                    : null;
                  return (
                    <td key={mi} className="px-2 py-0.5 text-right tabular-nums">
                      {mag != null ? mag.toFixed(4) : "—"}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {maxAtoms < Math.max(...row.models.map((m) => m.forces?.length ?? 0)) && (
        <p className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
          Showing first {maxAtoms} atoms
        </p>
      )}
    </div>
  );
}

function formatCategoryName(id: string): string {
  const MAP: Record<string, string> = {
    "bulk-crystals": "Crystal",
    molecular: "Molecule",
    "non-covalent": "Non-Cov.",
    surfaces: "Surface",
    uploaded: "Uploaded",
  };
  return MAP[id] ?? id;
}
