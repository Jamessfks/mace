"use client";

/**
 * ComparisonView — Side-by-side comparison of two MACE results.
 *
 * Each column: 3D viewer + energy/forces summary.
 * Between columns: ΔE, vacancy formation energy, structural diff.
 * Stacks on mobile, side-by-side on lg.
 */

import { MoleculeViewer3D } from "@/components/calculate/molecule-viewer-3d";
import { Zap, ArrowRightLeft, ArrowLeftRight } from "lucide-react";
import type { CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ComparisonViewProps {
  /** Label for the left result */
  labelA: string;
  /** Label for the right result */
  labelB: string;
  /** Left result (e.g. bulk) */
  resultA: CalculationResult | null;
  /** Right result (e.g. vacancy) */
  resultB: CalculationResult | null;
  /** Optional vacancy formation energy to display */
  vacancyFormationEv?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComparisonView({
  labelA,
  labelB,
  resultA,
  resultB,
  vacancyFormationEv,
}: ComparisonViewProps) {
  if (!resultA && !resultB) return null;

  const deltaE =
    resultA?.energy != null && resultB?.energy != null
      ? resultB.energy - resultA.energy
      : null;

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-4 sm:p-6 overflow-hidden">
      <div className="mb-4 flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-matrix-green" />
        <h2 className="font-mono text-sm font-bold text-matrix-green">
          COMPARISON VIEW
        </h2>
      </div>

      {/* Difference summary card — always on top for clarity */}
      <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Difference
          </h3>
          {deltaE != null && (
            <div className="text-center">
              <span className="font-mono text-[10px] text-zinc-500">ΔE</span>
              <p className="font-mono text-lg font-bold text-white">
                {deltaE > 0 ? "+" : ""}
                {deltaE.toFixed(4)}{" "}
                <span className="text-xs font-normal text-zinc-500">eV</span>
              </p>
            </div>
          )}
          {vacancyFormationEv != null && (
            <div className="text-center">
              <span className="font-mono text-[10px] text-zinc-500">
                E_vac
              </span>
              <p className="font-mono text-lg font-bold text-amber-400">
                {vacancyFormationEv.toFixed(3)}{" "}
                <span className="text-xs font-normal text-zinc-500">eV</span>
              </p>
            </div>
          )}
          {resultA?.symbols && resultB?.symbols && (
            <div className="text-center">
              <span className="font-mono text-[10px] text-zinc-500">
                Atoms
              </span>
              <p className="font-mono text-sm font-bold text-zinc-300">
                {resultA.symbols.length} → {resultB.symbols.length}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Side-by-side columns — stacks on mobile */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* ── Column A ── */}
        <div className="min-w-0 overflow-hidden">
          <ResultColumn label={labelA} result={resultA} />
        </div>

        {/* ── Column B ── */}
        <div className="min-w-0 overflow-hidden">
          <ResultColumn label={labelB} result={resultB} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result Column
// ---------------------------------------------------------------------------

function ResultColumn({
  label,
  result,
}: {
  label: string;
  result: CalculationResult | null;
}) {
  if (!result) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/30 p-8">
        <p className="font-mono text-xs text-zinc-600">
          No result for &quot;{label}&quot;
        </p>
      </div>
    );
  }

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

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs font-bold text-zinc-300">{label}</h3>

      {/* Summary cards */}
      <div className="grid gap-2 grid-cols-2">
        <MiniCard
          label="Energy"
          value={
            result.energy != null ? `${result.energy.toFixed(4)} eV` : "N/A"
          }
          sub={`${ePerAtom} eV/atom`}
          icon={<Zap className="h-3 w-3 text-emerald-400" />}
        />
        <MiniCard
          label="RMS Force"
          value={rmsForce != null ? `${rmsForce.toFixed(4)} eV/Å` : "N/A"}
          sub={`${atomCount} atoms`}
          icon={<ArrowRightLeft className="h-3 w-3 text-blue-400" />}
        />
      </div>

      {/* 3D Viewer — constrained height to fit within comparison layout */}
      {result.symbols && result.positions && (
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black/80 max-h-[320px]">
          <MoleculeViewer3D result={result} />
        </div>
      )}
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
      <div className="mb-1 flex items-center gap-1">
        {icon}
        <span className="font-mono text-[9px] text-zinc-500">{label}</span>
      </div>
      <p className="font-mono text-xs font-bold text-white">{value}</p>
      <p className="font-mono text-[9px] text-zinc-600">{sub}</p>
    </div>
  );
}
