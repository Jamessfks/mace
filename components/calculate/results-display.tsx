"use client";

/**
 * ResultsDisplay — Card-based results layout for MACE calculations.
 *
 * Design: Premium scientific aesthetic with left-border accent cards.
 * Each property category gets its own elevated card with an accent
 * color from the Paul Tol colorblind-safe palette.
 *
 * Accent palette:
 *   data-blue   -> energy (primary computed quantity)
 *   data-cyan   -> forces summary
 *   data-purple -> 3D structure viewer
 *   data-green  -> per-atom forces table
 *   data-yellow -> trajectory / MD data
 *   data-gray   -> run configuration / metadata
 */

import { Download, Zap, ArrowRightLeft, TrendingUp, Activity } from "lucide-react";
import { computeRmsForce } from "@/lib/utils";
import { MoleculeViewer3D } from "./molecule-viewer-3d";
import { TrajectoryViewer } from "./trajectory/trajectory-viewer";
import { PDFReportButton } from "./pdf-report";
import type { CalculationParams, CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResultsDisplayProps {
  result: CalculationResult;
  /** Original uploaded filename */
  filename?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResultsDisplay({ result, filename }: ResultsDisplayProps) {
  const isMD = result.params?.calculationType === "molecular-dynamics";
  const hasTraj =
    !!result.trajectory &&
    result.trajectory.positions.length > 1 &&
    !!result.symbols?.length;
  const atomCount = result.symbols?.length ?? 0;
  const ePerAtom =
    result.energy != null && atomCount > 0
      ? (result.energy / atomCount).toFixed(4)
      : "N/A";

  const rmsForce = computeRmsForce(result.forces);

  let maxForce = 0;
  let maxForceIdx = 0;
  if (result.forces) {
    result.forces.forEach((f, i) => {
      const mag = Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2);
      if (mag > maxForce) {
        maxForce = mag;
        maxForceIdx = i;
      }
    });
  }

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mace-results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Export forces table as CSV. */
  const downloadCSV = () => {
    if (!result.forces || !result.symbols) return;
    const header = "#,Element,Fx (eV/A),Fy (eV/A),Fz (eV/A),|F| (eV/A)\n";
    const rows = result.forces.map((f, i) => {
      const mag = Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2);
      return `${i + 1},${result.symbols![i]},${f[0].toFixed(6)},${f[1].toFixed(6)},${f[2].toFixed(6)},${mag.toFixed(6)}`;
    });
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mace-forces.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* ═══ Status Banner ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-success)]/20 bg-[var(--color-success)]/5 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)] animate-glow-pulse" />
          <span className="font-sans text-sm font-bold text-[var(--color-success)]">
            Calculation Complete
          </span>
          {result.timeTaken != null && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {result.timeTaken}s
            </span>
          )}
          {result.message && (
            <>
              <span className="text-[var(--color-text-muted)]">&middot;</span>
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {result.message}
              </span>
            </>
          )}
        </div>

        {/* Export toolbar */}
        <div className="flex items-center gap-2">
          <PDFReportButton result={result} />
          <button
            onClick={downloadCSV}
            disabled={!result.forces}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)] disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
          <button
            onClick={downloadJSON}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)]"
          >
            <Download className="h-3 w-3" />
            JSON
          </button>
        </div>
      </div>

      {/* ═══ Run Configuration Card ═══ */}
      {result.params && (
        <div
          className="result-card animate-stagger rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-gray)] bg-[var(--color-bg-secondary)] p-4"
          style={{ animationDelay: "0ms" }}
        >
          <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Run Configuration
          </h3>
          <p className="font-mono text-xs leading-relaxed text-[var(--color-text-muted)]">
            {formatParamsInline(result.params)}
          </p>
        </div>
      )}

      {/* ═══ Property Cards ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PropertyCard
          title="Total Energy"
          value={
            result.energy != null ? `${result.energy.toFixed(6)} eV` : "N/A"
          }
          subtitle={`${ePerAtom} eV/atom`}
          accentColor="data-blue"
          icon={<Zap className="h-4 w-4" />}
          delay={50}
        />

        <PropertyCard
          title="RMS Force"
          value={rmsForce != null ? `${rmsForce.toFixed(4)} eV/A` : "N/A"}
          subtitle={`${atomCount} atoms`}
          accentColor="data-cyan"
          icon={<ArrowRightLeft className="h-4 w-4" />}
          delay={100}
        />

        {result.forces && result.forces.length > 0 && (
          <PropertyCard
            title="Max Force"
            value={`${maxForce.toFixed(4)} eV/A`}
            subtitle={`Atom #${maxForceIdx + 1} (${result.symbols?.[maxForceIdx] ?? "?"})`}
            accentColor="data-red"
            icon={<TrendingUp className="h-4 w-4" />}
            delay={150}
          />
        )}

        {result.properties?.volume != null && (
          <PropertyCard
            title="Cell Volume"
            value={`${result.properties.volume.toFixed(2)} A\u00B3`}
            subtitle="Periodic cell"
            accentColor="data-purple"
            icon={<Activity className="h-4 w-4" />}
            delay={200}
          />
        )}
      </div>

      {/* ═══ Trajectory Card (MD only) ═══ */}
      {result.trajectory && result.trajectory.energies.length > 0 && (
        <div
          className="result-card animate-stagger rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-yellow)] bg-[var(--color-bg-secondary)] p-5"
          style={{ animationDelay: "200ms" }}
        >
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-data-yellow)]">
            MD Trajectory
          </h3>
          <div className="grid gap-4 sm:grid-cols-3 font-mono text-xs">
            <div>
              <span className="text-[var(--color-text-muted)]">Steps</span>
              <p className="text-lg font-bold text-white">
                {result.trajectory.energies.length}
              </p>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">E range</span>
              <p className="text-lg font-bold text-white">
                {Math.min(...result.trajectory.energies).toFixed(3)} &rarr;{" "}
                {Math.max(...result.trajectory.energies).toFixed(3)} eV
              </p>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">&Delta;E</span>
              <p className="text-lg font-bold text-white">
                {(
                  Math.max(...result.trajectory.energies) -
                  Math.min(...result.trajectory.energies)
                ).toFixed(4)}{" "}
                eV
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 3D Structure Viewer Card ═══ */}
      <div
        className="result-card animate-stagger overflow-hidden rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-purple)] bg-[var(--color-bg-secondary)]"
        style={{ animationDelay: "250ms" }}
      >
        <MoleculeViewer3D result={result} />
      </div>

      {/* ═══ MD Trajectory Animation ═══ */}
      {isMD && hasTraj && (
        <div
          className="result-card animate-stagger rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-yellow)] bg-[var(--color-bg-secondary)] p-5"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-data-yellow)]">
            MD Trajectory Animation
          </h3>
          <TrajectoryViewer result={result} />
        </div>
      )}

      {/* ═══ Atomic Forces Table Card ═══ */}
      {result.forces && result.symbols && (
        <div
          className="result-card animate-stagger rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-green)] bg-[var(--color-bg-secondary)] p-5"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-data-green)]">
            Atomic Forces (eV/A)
          </h3>
          <div className="max-h-72 overflow-auto rounded border border-[var(--color-border-subtle)]">
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Element</th>
                  <th className="px-3 py-2 text-right">F<sub>x</sub></th>
                  <th className="px-3 py-2 text-right">F<sub>y</sub></th>
                  <th className="px-3 py-2 text-right">F<sub>z</sub></th>
                  <th className="px-3 py-2 text-right">|F|</th>
                </tr>
              </thead>
              <tbody className="text-[var(--color-text-secondary)]">
                {result.forces.map((force, i) => {
                  const mag = Math.sqrt(
                    force[0] ** 2 + force[1] ** 2 + force[2] ** 2
                  );
                  const isMax = i === maxForceIdx;
                  return (
                    <tr
                      key={i}
                      className={`border-t border-[var(--color-border-subtle)]/60 transition-colors hover:bg-[var(--color-bg-elevated)] ${
                        isMax ? "bg-[var(--color-data-cyan)]/5" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{i + 1}</td>
                      <td className="px-3 py-1.5 font-bold">
                        {result.symbols![i]}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {force[0].toFixed(4)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {force[1].toFixed(4)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {force[2].toFixed(4)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                          isMax ? "text-[var(--color-data-red)]" : "text-[var(--color-accent-primary)]"
                        }`}
                      >
                        {mag.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10px] text-[var(--color-text-muted)]">
            {result.forces.length} atoms &middot; Max |F| highlighted
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Property Card — Elevated card with left-border accent
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT_COLORS: Record<string, { border: string; icon: string }> = {
  "data-blue": {
    border: "border-l-[var(--color-data-blue)]",
    icon: "text-[var(--color-data-blue)]",
  },
  "data-red": {
    border: "border-l-[var(--color-data-red)]",
    icon: "text-[var(--color-data-red)]",
  },
  "data-cyan": {
    border: "border-l-[var(--color-data-cyan)]",
    icon: "text-[var(--color-data-cyan)]",
  },
  "data-green": {
    border: "border-l-[var(--color-data-green)]",
    icon: "text-[var(--color-data-green)]",
  },
  "data-purple": {
    border: "border-l-[var(--color-data-purple)]",
    icon: "text-[var(--color-data-purple)]",
  },
  "data-yellow": {
    border: "border-l-[var(--color-data-yellow)]",
    icon: "text-[var(--color-data-yellow)]",
  },
  "data-gray": {
    border: "border-l-[var(--color-data-gray)]",
    icon: "text-[var(--color-data-gray)]",
  },
};

function PropertyCard({
  title,
  value,
  subtitle,
  accentColor,
  icon,
  delay = 0,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accentColor: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  const accent = ACCENT_COLORS[accentColor] ?? ACCENT_COLORS["data-blue"];

  return (
    <div
      className={`result-card animate-stagger rounded-lg border border-[var(--color-border-subtle)] border-l-4 ${accent.border} bg-[var(--color-bg-secondary)] p-4`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={accent.icon}>{icon}</span>
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </h3>
      </div>
      <p className="font-mono text-xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{subtitle}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function formatParamsInline(params: Partial<CalculationParams>): string {
  const parts: string[] = [];
  if (params.modelType) parts.push(params.modelType);
  if (params.modelSize) parts.push(`size: ${params.modelSize}`);
  if (params.calculationType) parts.push(params.calculationType);
  if (params.temperature != null) parts.push(`${params.temperature} K`);
  if (params.pressure != null) parts.push(`${params.pressure} GPa`);
  if (params.timeStep != null) parts.push(`\u0394t ${params.timeStep} fs`);
  if (params.friction != null) parts.push(`friction ${params.friction}`);
  if (params.mdSteps != null) parts.push(`${params.mdSteps} MD steps`);
  if (params.mdEnsemble) parts.push(params.mdEnsemble);
  if (params.forceThreshold != null)
    parts.push(`fmax ${params.forceThreshold}`);
  if (params.dispersion) parts.push("D3 dispersion");
  return parts.length ? parts.join(" \u00B7 ") : "Default parameters";
}
