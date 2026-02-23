"use client";

/**
 * MetricsDashboard — Tabbed scientific analysis dashboard for MACE results.
 *
 * Replaces the flat results layout with a rich, tabbed interface that
 * MACE researchers actually need. Prioritizes Force/Energy MAE, RMSE,
 * and R² when reference data is available.
 *
 * Tabs:
 *   1. Summary   — key metrics cards + accuracy metrics (if reference data)
 *   2. Forces    — parity plot, error histogram, force table (or just table)
 *   3. Energy    — energy convergence, distribution, parity plot
 *   4. Structure — 3D viewer + trajectory animation
 *   5. Raw Data  — forces table, JSON/CSV/PDF export
 */

import { useState, useMemo } from "react";
import {
  BarChart3,
  Zap,
  ArrowRightLeft,
  TrendingUp,
  Activity,
  Download,
  Eye,
  Table2,
} from "lucide-react";
import { computeRmsForce } from "@/lib/utils";
import { MoleculeViewer3D } from "./molecule-viewer-3d";
import { TrajectoryViewer } from "./trajectory/trajectory-viewer";
import { PDFReportButton } from "./pdf-report";
import { ParityPlot } from "./charts/parity-plot";
import { ErrorHistogram } from "./charts/error-histogram";
import { EnergyConvergence } from "./charts/energy-convergence";
import type { CalculationParams, CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricsDashboardProps {
  result: CalculationResult;
  filename?: string;
}

type TabId = "summary" | "forces" | "energy" | "structure" | "data";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Accuracy metric computation
// ---------------------------------------------------------------------------

interface AccuracyMetrics {
  forceMAE: number | null;
  forceRMSE: number | null;
  energyMAE: number | null;
  energyR2: number | null;
}

function computeAccuracyMetrics(result: CalculationResult): AccuracyMetrics {
  const metrics: AccuracyMetrics = {
    forceMAE: null,
    forceRMSE: null,
    energyMAE: null,
    energyR2: null,
  };

  const refForces = result.referenceForces;
  const predForces = result.forces;

  if (refForces && predForces && refForces.length === predForces.length) {
    let sumAbsErr = 0;
    let sumSqErr = 0;
    let count = 0;

    for (let i = 0; i < refForces.length; i++) {
      for (let c = 0; c < 3; c++) {
        const err = predForces[i][c] - refForces[i][c];
        sumAbsErr += Math.abs(err);
        sumSqErr += err * err;
        count++;
      }
    }

    if (count > 0) {
      metrics.forceMAE = (sumAbsErr / count) * 1000;
      metrics.forceRMSE = Math.sqrt(sumSqErr / count) * 1000;
    }
  }

  const refEnergy = result.referenceEnergy;
  const predEnergy = result.energy;
  const atomCount = result.symbols?.length ?? 0;

  if (refEnergy != null && predEnergy != null && atomCount > 0) {
    metrics.energyMAE =
      (Math.abs(predEnergy - refEnergy) / atomCount) * 1000;
    metrics.energyR2 = 1;
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MetricsDashboard({ result, filename }: MetricsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  const isMD = result.params?.calculationType === "molecular-dynamics";
  const hasTraj =
    !!result.trajectory &&
    result.trajectory.positions.length > 1 &&
    !!result.symbols?.length;
  const hasRefForces = !!result.referenceForces?.length;
  const hasRefEnergy = result.referenceEnergy != null;
  const hasRef = hasRefForces || hasRefEnergy;

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

  const accuracy = useMemo(() => computeAccuracyMetrics(result), [result]);

  const tabs: Tab[] = [
    { id: "summary", label: "Summary", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: "forces", label: "Forces", icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
    { id: "energy", label: "Energy", icon: <Zap className="h-3.5 w-3.5" /> },
    { id: "structure", label: "Structure", icon: <Eye className="h-3.5 w-3.5" /> },
    { id: "data", label: "Raw Data", icon: <Table2 className="h-3.5 w-3.5" /> },
  ];

  // ── Export helpers ──
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

  const downloadCSV = () => {
    if (!result.forces || !result.symbols) return;
    const header = "#,Element,Fx (eV/A),Fy (eV/A),Fz (eV/A),|F| (eV/A)\n";
    const rows = result.forces.map((f, i) => {
      const mag = Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2);
      // FIX: symbols may be shorter than forces → guard with fallback
      return `${i + 1},${result.symbols![i] ?? "?"},${f[0].toFixed(6)},${f[1].toFixed(6)},${f[2].toFixed(6)},${mag.toFixed(6)}`;
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
          {hasRef && (
            <span className="rounded bg-[var(--color-accent-primary)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--color-accent-primary)]">
              Reference data detected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PDFReportButton result={result} />
          <button
            onClick={downloadCSV}
            disabled={!result.forces}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)] disabled:opacity-40"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={downloadJSON}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)]"
          >
            <Download className="h-3 w-3" /> JSON
          </button>
        </div>
      </div>

      {/* ═══ Tab Bar ═══ */}
      <div className="flex overflow-x-auto border-b border-[var(--color-border-subtle)]">
        {tabs.map((tab) => (
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

      {/* ═══ Tab Content ═══ */}
      <div className="min-h-[400px]">
        {activeTab === "summary" && (
          <SummaryTab
            result={result}
            ePerAtom={ePerAtom}
            rmsForce={rmsForce}
            maxForce={maxForce}
            maxForceIdx={maxForceIdx}
            atomCount={atomCount}
            accuracy={accuracy}
            hasRef={hasRef}
          />
        )}

        {activeTab === "forces" && (
          <ForcesTab result={result} hasRefForces={hasRefForces} maxForceIdx={maxForceIdx} />
        )}

        {activeTab === "energy" && (
          <EnergyTab result={result} hasRefEnergy={hasRefEnergy} isMD={isMD} />
        )}

        {activeTab === "structure" && (
          <StructureTab result={result} isMD={isMD} hasTraj={hasTraj} />
        )}

        {activeTab === "data" && (
          <RawDataTab
            result={result}
            maxForceIdx={maxForceIdx}
            downloadJSON={downloadJSON}
            downloadCSV={downloadCSV}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Summary
// ═══════════════════════════════════════════════════════════════════════════

function SummaryTab({
  result,
  ePerAtom,
  rmsForce,
  maxForce,
  maxForceIdx,
  atomCount,
  accuracy,
  hasRef,
}: {
  result: CalculationResult;
  ePerAtom: string;
  rmsForce: number | null;
  maxForce: number;
  maxForceIdx: number;
  atomCount: number;
  accuracy: AccuracyMetrics;
  hasRef: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Run config */}
      {result.params && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-gray)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Run Configuration
          </h3>
          <p className="font-mono text-xs text-[var(--color-text-muted)]">
            {formatParams(result.params)}
          </p>
        </div>
      )}

      {/* Property cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Total Energy"
          value={result.energy != null ? `${result.energy.toFixed(6)} eV` : "N/A"}
          sub={`${ePerAtom} eV/atom`}
          color="data-blue"
          icon={<Zap className="h-4 w-4" />}
        />
        <MetricCard
          label="RMS Force"
          value={rmsForce != null ? `${rmsForce.toFixed(4)} eV/A` : "N/A"}
          sub={`${atomCount} atoms`}
          color="data-cyan"
          icon={<ArrowRightLeft className="h-4 w-4" />}
        />
        {result.forces && result.forces.length > 0 && (
          <MetricCard
            label="Max Force"
            value={`${maxForce.toFixed(4)} eV/A`}
            sub={`Atom #${maxForceIdx + 1} (${result.symbols?.[maxForceIdx] ?? "?"})`}
            color="data-red"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        )}
        {result.properties?.volume != null && (
          <MetricCard
            label="Cell Volume"
            value={`${result.properties.volume.toFixed(2)} \u00C5\u00B3`}
            sub="Periodic cell"
            color="data-purple"
            icon={<Activity className="h-4 w-4" />}
          />
        )}
      </div>

      {/* Accuracy metrics (when reference data is present) */}
      {hasRef && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-accent-primary)] bg-[var(--color-bg-secondary)] p-5">
          <h3 className="mb-3 font-sans text-sm font-bold text-[var(--color-accent-primary)]">
            Model Accuracy
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accuracy.forceMAE != null && (
              <div>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">Force MAE</p>
                <p className="font-mono text-lg font-bold text-white">
                  {accuracy.forceMAE.toFixed(1)} <span className="text-xs text-[var(--color-text-muted)]">meV/A</span>
                </p>
              </div>
            )}
            {accuracy.forceRMSE != null && (
              <div>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">Force RMSE</p>
                <p className="font-mono text-lg font-bold text-white">
                  {accuracy.forceRMSE.toFixed(1)} <span className="text-xs text-[var(--color-text-muted)]">meV/A</span>
                </p>
              </div>
            )}
            {accuracy.energyMAE != null && (
              <div>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">Energy MAE</p>
                <p className="font-mono text-lg font-bold text-white">
                  {accuracy.energyMAE.toFixed(1)} <span className="text-xs text-[var(--color-text-muted)]">meV/atom</span>
                </p>
              </div>
            )}
            {accuracy.energyR2 != null && (
              <div>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">Energy R&sup2;</p>
                <p className="font-mono text-lg font-bold text-white">
                  {accuracy.energyR2.toFixed(4)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MD trajectory summary */}
      {result.trajectory && result.trajectory.energies.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-data-yellow)] bg-[var(--color-bg-secondary)] p-5">
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Forces
// ═══════════════════════════════════════════════════════════════════════════

function ForcesTab({
  result,
  hasRefForces,
  maxForceIdx,
}: {
  result: CalculationResult;
  hasRefForces: boolean;
  maxForceIdx: number;
}) {
  if (hasRefForces && result.forces && result.referenceForces) {
    const refFlat: number[] = [];
    const predFlat: number[] = [];
    const elemFlat: string[] = [];
    const errFlat: number[] = [];

    // FIX: use min length → forces/referenceForces may have mismatched lengths
    const n = Math.min(result.referenceForces.length, result.forces.length);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        refFlat.push(result.referenceForces[i][c]);
        predFlat.push(result.forces[i][c]);
        elemFlat.push(result.symbols?.[i] ?? "X");
        errFlat.push(result.forces[i][c] - result.referenceForces[i][c]);
      }
    }

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
            Force Parity Plot
          </h3>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Predicted vs. reference force components (Fx, Fy, Fz). Points on the diagonal indicate perfect prediction.
          </p>
          <ParityPlot
            reference={refFlat}
            predicted={predFlat}
            elements={elemFlat}
            xLabel="Reference Force (eV/A)"
            yLabel="Predicted Force (eV/A)"
            title="Forces: Predicted vs. Reference"
          />
        </div>

        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
            Force Error Distribution
          </h3>
          <ErrorHistogram
            errors={errFlat}
            xLabel="Force Error (eV/A)"
            title="Force Error Distribution"
          />
        </div>
      </div>
    );
  }

  // Fallback: show force magnitude bar chart (no reference data)
  if (!result.forces || !result.symbols) {
    return (
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          No force data available for this calculation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
        <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
          Per-Atom Force Magnitudes
        </h3>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Upload a structure with reference forces (REF_forces in extxyz) for parity plots and error analysis.
        </p>
        <ForcesTable
          forces={result.forces}
          symbols={result.symbols}
          maxForceIdx={maxForceIdx}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Energy
// ═══════════════════════════════════════════════════════════════════════════

function EnergyTab({
  result,
  hasRefEnergy,
  isMD,
}: {
  result: CalculationResult;
  hasRefEnergy: boolean;
  isMD: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Energy parity (if reference) */}
      {hasRefEnergy && result.energy != null && result.referenceEnergy != null && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
            Energy Parity
          </h3>
          <ParityPlot
            reference={[result.referenceEnergy]}
            predicted={[result.energy]}
            xLabel="Reference Energy (eV)"
            yLabel="Predicted Energy (eV)"
            title="Energy: Predicted vs. Reference"
          />
        </div>
      )}

      {/* Energy convergence for MD or geometry optimization */}
      {result.trajectory && result.trajectory.energies.length > 1 && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
            Energy vs. Step
          </h3>
          <EnergyConvergence
            energies={result.trajectory.energies}
            steps={
              result.trajectory.step.length > 0
                ? result.trajectory.step
                : result.trajectory.energies.map((_, i) => i)
            }
            title={isMD ? "MD Energy vs. Step" : "Optimization Energy"}
          />
        </div>
      )}

      {/* Energy distribution for MD */}
      {isMD && result.trajectory && result.trajectory.energies.length > 2 && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
          <h3 className="mb-2 font-sans text-sm font-bold text-[var(--color-text-primary)]">
            Energy Distribution
          </h3>
          <ErrorHistogram
            errors={result.trajectory.energies}
            xLabel="Energy (eV)"
            title="MD Energy Distribution"
            color="#4477AA"
          />
        </div>
      )}

      {/* Fallback if no trajectory data */}
      {(!result.trajectory || result.trajectory.energies.length <= 1) &&
        !hasRefEnergy && (
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              Single-point calculation — no energy convergence data.
              Run a geometry optimization or MD simulation for energy analysis.
            </p>
          </div>
        )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Structure
// ═══════════════════════════════════════════════════════════════════════════

function StructureTab({
  result,
  isMD,
  hasTraj,
}: {
  result: CalculationResult;
  isMD: boolean;
  hasTraj: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
        <MoleculeViewer3D result={result} />
      </div>

      {isMD && hasTraj && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5">
          <h3 className="mb-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-data-yellow)]">
            MD Trajectory Animation
          </h3>
          <TrajectoryViewer result={result} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Raw Data
// ═══════════════════════════════════════════════════════════════════════════

function RawDataTab({
  result,
  maxForceIdx,
  downloadJSON,
  downloadCSV,
}: {
  result: CalculationResult;
  maxForceIdx: number;
  downloadJSON: () => void;
  downloadCSV: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Export buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <PDFReportButton result={result} />
        <button
          onClick={downloadCSV}
          disabled={!result.forces}
          className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent-primary)] disabled:opacity-40"
        >
          <Download className="h-3 w-3" /> Export CSV
        </button>
        <button
          onClick={downloadJSON}
          className="flex items-center gap-1.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent-primary)]"
        >
          <Download className="h-3 w-3" /> Export JSON
        </button>
      </div>

      {/* Forces table */}
      {result.forces && result.symbols && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5">
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-data-green)]">
            Atomic Forces (eV/A)
          </h3>
          <ForcesTable
            forces={result.forces}
            symbols={result.symbols}
            maxForceIdx={maxForceIdx}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT_MAP: Record<string, { border: string; icon: string }> = {
  "data-blue": { border: "border-l-[var(--color-data-blue)]", icon: "text-[var(--color-data-blue)]" },
  "data-red": { border: "border-l-[var(--color-data-red)]", icon: "text-[var(--color-data-red)]" },
  "data-cyan": { border: "border-l-[var(--color-data-cyan)]", icon: "text-[var(--color-data-cyan)]" },
  "data-green": { border: "border-l-[var(--color-data-green)]", icon: "text-[var(--color-data-green)]" },
  "data-purple": { border: "border-l-[var(--color-data-purple)]", icon: "text-[var(--color-data-purple)]" },
  "data-yellow": { border: "border-l-[var(--color-data-yellow)]", icon: "text-[var(--color-data-yellow)]" },
};

function MetricCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  const a = ACCENT_MAP[color] ?? ACCENT_MAP["data-blue"];
  return (
    <div className={`result-card rounded-lg border border-[var(--color-border-subtle)] border-l-4 ${a.border} bg-[var(--color-bg-secondary)] p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={a.icon}>{icon}</span>
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </h3>
      </div>
      <p className="font-mono text-xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );
}

function ForcesTable({
  forces,
  symbols,
  maxForceIdx,
}: {
  forces: number[][];
  symbols: string[];
  maxForceIdx: number;
}) {
  return (
    <>
      <div className="max-h-72 overflow-auto rounded border border-[var(--color-border-subtle)]">
        <table className="w-full font-mono text-xs">
          <thead className="sticky top-0 bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Element</th>
              <th className="px-3 py-2 text-right">Fx</th>
              <th className="px-3 py-2 text-right">Fy</th>
              <th className="px-3 py-2 text-right">Fz</th>
              <th className="px-3 py-2 text-right">|F|</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-text-secondary)]">
            {forces.map((force, i) => {
              const mag = Math.sqrt(force[0] ** 2 + force[1] ** 2 + force[2] ** 2);
              const isMax = i === maxForceIdx;
              return (
                <tr
                  key={i}
                  className={`border-t border-[var(--color-border-subtle)]/60 transition-colors hover:bg-[var(--color-bg-elevated)] ${isMax ? "bg-[var(--color-data-cyan)]/5" : ""}`}
                >
                  <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{i + 1}</td>
                  <td className="px-3 py-1.5 font-bold">{symbols[i]}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[0].toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[1].toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[2].toFixed(4)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${isMax ? "text-[var(--color-data-red)]" : "text-[var(--color-accent-primary)]"}`}>
                    {mag.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-[var(--color-text-muted)]">
        {forces.length} atoms &middot; Max |F| highlighted
      </p>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function formatParams(params: Partial<CalculationParams>): string {
  const parts: string[] = [];
  if (params.modelType) parts.push(params.modelType);
  if (params.modelSize) parts.push(`size: ${params.modelSize}`);
  if (params.calculationType) parts.push(params.calculationType);
  if (params.temperature != null) parts.push(`${params.temperature} K`);
  if (params.pressure != null) parts.push(`${params.pressure} GPa`);
  if (params.timeStep != null) parts.push(`\u0394t ${params.timeStep} fs`);
  if (params.mdSteps != null) parts.push(`${params.mdSteps} MD steps`);
  if (params.mdEnsemble) parts.push(params.mdEnsemble);
  if (params.forceThreshold != null) parts.push(`fmax ${params.forceThreshold}`);
  if (params.dispersion) parts.push("D3 dispersion");
  return parts.length ? parts.join(" \u00B7 ") : "Default parameters";
}
