"use client";

/**
 * ResultsDisplay — Card‑based results layout inspired by Materials Project,
 * NOMAD, and WebMO.  Each property category gets its own elevated card with
 * a left‑border accent color indicating category.
 *
 * Accent palette:
 *   emerald  → energy (primary computed quantity)
 *   blue     → forces summary
 *   violet   → 3D structure viewer
 *   sky      → per‑atom forces table
 *   amber    → trajectory / MD data
 *   zinc     → run configuration / metadata
 */

import { Download, FileText, Zap, ArrowRightLeft, TrendingUp, Activity } from "lucide-react";
import { MoleculeViewer3D } from "./molecule-viewer-3d";
import { TrajectoryViewer } from "./trajectory/trajectory-viewer";
import { PDFReportButton } from "./pdf-report";
import type { CalculationParams, CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResultsDisplayProps {
  result: CalculationResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResultsDisplay({ result }: ResultsDisplayProps) {
  // ── Derived values ──
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

  const rmsForce =
    result.forces && result.forces.length > 0
      ? Math.sqrt(
          result.forces.flat().reduce((s, f) => s + f * f, 0) /
            result.forces.length
        )
      : null;

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

  return (
    <div className="space-y-5">
      {/* ═══ Status Banner ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-matrix-green/20 bg-matrix-green/5 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-matrix-green animate-glow-pulse" />
          <span className="font-mono text-sm font-bold text-matrix-green">
            Calculation Complete
          </span>
          {result.timeTaken != null && (
            <span className="font-mono text-xs text-zinc-500">
              {result.timeTaken}s
            </span>
          )}
          {result.message && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-xs text-zinc-500">
                {result.message}
              </span>
            </>
          )}
        </div>

        {/* Export toolbar */}
        <div className="flex items-center gap-2">
          <PDFReportButton result={result} />
          <button
            onClick={downloadJSON}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-matrix-green/50 hover:text-matrix-green"
          >
            <Download className="h-3 w-3" />
            JSON
          </button>
        </div>
      </div>

      {/* ═══ Run Configuration Card ═══ */}
      {result.params && (
        <div
          className="result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 border-l-zinc-500 bg-zinc-900/50 p-4"
          style={{ animationDelay: "0ms" }}
        >
          <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
            Run Configuration
          </h3>
          <p className="font-mono text-xs leading-relaxed text-zinc-500">
            {formatParamsInline(result.params)}
          </p>
        </div>
      )}

      {/* ═══ Property Cards (2 or 3 columns) ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Energy */}
        <PropertyCard
          title="Total Energy"
          value={
            result.energy != null ? `${result.energy.toFixed(6)} eV` : "N/A"
          }
          subtitle={`${ePerAtom} eV/atom`}
          accentColor="emerald"
          icon={<Zap className="h-4 w-4" />}
          delay={50}
        />

        {/* RMS Force */}
        <PropertyCard
          title="RMS Force"
          value={rmsForce != null ? `${rmsForce.toFixed(4)} eV/Å` : "N/A"}
          subtitle={`${atomCount} atoms`}
          accentColor="blue"
          icon={<ArrowRightLeft className="h-4 w-4" />}
          delay={100}
        />

        {/* Max Force */}
        {result.forces && result.forces.length > 0 && (
          <PropertyCard
            title="Max Force"
            value={`${maxForce.toFixed(4)} eV/Å`}
            subtitle={`Atom #${maxForceIdx + 1} (${result.symbols?.[maxForceIdx] ?? "?"})`}
            accentColor="cyan"
            icon={<TrendingUp className="h-4 w-4" />}
            delay={150}
          />
        )}

        {/* Volume (if periodic) */}
        {result.properties?.volume != null && (
          <PropertyCard
            title="Cell Volume"
            value={`${result.properties.volume.toFixed(2)} Å³`}
            subtitle="Periodic cell"
            accentColor="purple"
            icon={<Activity className="h-4 w-4" />}
            delay={200}
          />
        )}
      </div>

      {/* ═══ Trajectory Card (MD only) ═══ */}
      {result.trajectory && result.trajectory.energies.length > 0 && (
        <div
          className="result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 border-l-amber-500 bg-zinc-900/50 p-5"
          style={{ animationDelay: "200ms" }}
        >
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
            MD Trajectory
          </h3>
          <div className="grid gap-4 sm:grid-cols-3 font-mono text-xs">
            <div>
              <span className="text-zinc-500">Steps</span>
              <p className="text-lg font-bold text-white">
                {result.trajectory.energies.length}
              </p>
            </div>
            <div>
              <span className="text-zinc-500">E range</span>
              <p className="text-lg font-bold text-white">
                {Math.min(...result.trajectory.energies).toFixed(3)} →{" "}
                {Math.max(...result.trajectory.energies).toFixed(3)} eV
              </p>
            </div>
            <div>
              <span className="text-zinc-500">ΔE</span>
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
        className="result-card animate-stagger overflow-hidden rounded-lg border border-zinc-800 border-l-4 border-l-violet-500 bg-black/80"
        style={{ animationDelay: "250ms" }}
      >
        <MoleculeViewer3D result={result} />
      </div>

      {/* ═══ MD Trajectory Animation (only for molecular-dynamics with trajectory data) ═══ */}
      {isMD && hasTraj && (
        <div
          className="result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 border-l-amber-500 bg-black/80 p-5"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
            MD Trajectory Animation
          </h3>
          <TrajectoryViewer result={result} />
        </div>
      )}

      {/* ═══ Atomic Forces Table Card ═══ */}
      {result.forces && result.symbols && (
        <div
          className="result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 border-l-sky-500 bg-black/80 p-5"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-sky-400">
            Atomic Forces (eV/Å)
          </h3>
          <div className="max-h-72 overflow-auto rounded border border-zinc-800">
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Element</th>
                  <th className="px-3 py-2 text-right">F<sub>x</sub></th>
                  <th className="px-3 py-2 text-right">F<sub>y</sub></th>
                  <th className="px-3 py-2 text-right">F<sub>z</sub></th>
                  <th className="px-3 py-2 text-right">|F|</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {result.forces.map((force, i) => {
                  const mag = Math.sqrt(
                    force[0] ** 2 + force[1] ** 2 + force[2] ** 2
                  );
                  const isMax = i === maxForceIdx;
                  return (
                    <tr
                      key={i}
                      className={`border-t border-zinc-800/60 transition-colors hover:bg-zinc-800/40 ${
                        isMax ? "bg-sky-500/5" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-zinc-500">{i + 1}</td>
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
                          isMax ? "text-sky-400" : "text-matrix-green"
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
          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            {result.forces.length} atoms · Max |F| highlighted
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Property Card — Elevated card with left‑border accent
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT_COLORS: Record<string, { border: string; icon: string }> = {
  emerald: {
    border: "border-l-emerald-500",
    icon: "text-emerald-400",
  },
  blue: {
    border: "border-l-blue-500",
    icon: "text-blue-400",
  },
  cyan: {
    border: "border-l-cyan-500",
    icon: "text-cyan-400",
  },
  purple: {
    border: "border-l-purple-500",
    icon: "text-purple-400",
  },
  amber: {
    border: "border-l-amber-500",
    icon: "text-amber-400",
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
  const accent = ACCENT_COLORS[accentColor] ?? ACCENT_COLORS.emerald;

  return (
    <div
      className={`result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 ${accent.border} bg-zinc-900/50 p-4`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={accent.icon}>{icon}</span>
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
          {title}
        </h3>
      </div>
      <p className="font-mono text-xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="mt-1 font-mono text-xs text-zinc-500">{subtitle}</p>
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
  if (params.timeStep != null) parts.push(`Δt ${params.timeStep} fs`);
  if (params.friction != null) parts.push(`friction ${params.friction}`);
  if (params.mdSteps != null) parts.push(`${params.mdSteps} MD steps`);
  if (params.mdEnsemble) parts.push(params.mdEnsemble);
  if (params.forceThreshold != null)
    parts.push(`fmax ${params.forceThreshold}`);
  if (params.dispersion) parts.push("D3 dispersion");
  return parts.length ? parts.join(" · ") : "Default parameters";
}
