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
import { DATA_COLORS } from "./charts/chart-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  /** R² of predicted vs. reference energy. Only meaningful with ≥2 pairs. */
  energyR2: number | null;
  /**
   * Signed energy error (predicted − reference), eV. This is what's shown
   * instead of R² when only a single reference energy is available.
   */
  energyError: number | null;
  /** Signed energy error per atom, eV/atom. */
  energyErrorPerAtom: number | null;
}

function computeAccuracyMetrics(result: CalculationResult): AccuracyMetrics {
  const metrics: AccuracyMetrics = {
    forceMAE: null,
    forceRMSE: null,
    energyMAE: null,
    energyR2: null,
    energyError: null,
    energyErrorPerAtom: null,
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

  // CalculationResult only ever carries a single (predicted, reference)
  // energy pair per run — never an array of points — so R² (variance
  // explained across ≥2 points) is not statistically defined here.
  // Report the signed error instead of a fabricated R² = 1.0.
  if (refEnergy != null && predEnergy != null) {
    const energyError = predEnergy - refEnergy;
    metrics.energyError = energyError;
    if (atomCount > 0) {
      metrics.energyMAE = (Math.abs(energyError) / atomCount) * 1000;
      metrics.energyErrorPerAtom = energyError / atomCount;
    }
    // energyR2 intentionally stays null: fewer than 2 energy pairs are
    // available. If a future result shape supplies multiple predicted/
    // reference energy pairs, compute R² from those here instead.
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
    { id: "summary", label: "Summary", icon: <BarChart3 className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "forces", label: "Forces", icon: <ArrowRightLeft className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "energy", label: "Energy", icon: <Zap className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "structure", label: "Structure", icon: <Eye className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "data", label: "Raw Data", icon: <Table2 className="h-4 w-4" strokeWidth={1.75} /> },
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
      // symbols may be shorter than forces — guard with a fallback label
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)] motion-safe:animate-pulse" />
          <span className="font-sans text-sm font-bold text-[var(--color-success)]">
            Calculation Complete
          </span>
          {result.timeTaken != null && (
            <span className="font-mono text-xs text-muted-foreground">
              {result.timeTaken}s
            </span>
          )}
          {hasRef && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/10 font-mono text-[10px] text-[var(--color-accent-strong)]"
            >
              Reference data detected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PDFReportButton result={result} />
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <Button
            onClick={downloadCSV}
            disabled={!result.forces}
            variant="outline"
            size="sm"
            className="font-mono text-xs"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} /> CSV
          </Button>
          <Button
            onClick={downloadJSON}
            variant="outline"
            size="sm"
            className="font-mono text-xs"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} /> JSON
          </Button>
        </div>
      </div>

      {/* ═══ Tabs ═══ */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="gap-2 rounded-none border-transparent px-1 py-2.5 font-sans text-sm text-muted-foreground shadow-none after:bg-[var(--color-accent-strong)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--color-accent-strong)] data-[state=active]:shadow-none"
            >
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ═══ Tab Content ═══ */}
        <div className="min-h-[400px] pt-5">
          <TabsContent value="summary">
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
          </TabsContent>

          <TabsContent value="forces">
            <ForcesTab result={result} hasRefForces={hasRefForces} maxForceIdx={maxForceIdx} />
          </TabsContent>

          <TabsContent value="energy">
            <EnergyTab result={result} hasRefEnergy={hasRefEnergy} isMD={isMD} />
          </TabsContent>

          <TabsContent value="structure">
            <StructureTab result={result} isMD={isMD} hasTraj={hasTraj} />
          </TabsContent>

          <TabsContent value="data">
            <RawDataTab
              result={result}
              maxForceIdx={maxForceIdx}
              downloadJSON={downloadJSON}
              downloadCSV={downloadCSV}
            />
          </TabsContent>
        </div>
      </Tabs>
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
        <Card className="gap-2 border-l-4 border-l-[var(--color-data-gray)] bg-muted py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-sm font-semibold text-foreground">
              Run Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="font-mono text-xs text-muted-foreground">
              {formatParams(result.params)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Property cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Total Energy"
          value={result.energy != null ? `${result.energy.toFixed(6)} eV` : "N/A"}
          sub={`${ePerAtom} eV/atom`}
          color="data-blue"
          icon={<Zap className="h-4 w-4" strokeWidth={1.75} />}
        />
        <MetricCard
          label="RMS Force"
          value={rmsForce != null ? `${rmsForce.toFixed(4)} eV/A` : "N/A"}
          sub={`${atomCount} atoms`}
          color="data-cyan"
          icon={<ArrowRightLeft className="h-4 w-4" strokeWidth={1.75} />}
        />
        {result.forces && result.forces.length > 0 && (
          <MetricCard
            label="Max Force"
            value={`${maxForce.toFixed(4)} eV/A`}
            sub={`Atom #${maxForceIdx + 1} (${result.symbols?.[maxForceIdx] ?? "?"})`}
            color="data-red"
            icon={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
          />
        )}
        {result.properties?.volume != null && (
          <MetricCard
            label="Cell Volume"
            value={`${result.properties.volume.toFixed(2)} Å³`}
            sub="Periodic cell"
            color="data-purple"
            icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
          />
        )}
      </div>

      {/* Energy context note */}
      <div className="rounded-lg border border-border bg-muted px-4 py-3">
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-bold text-[var(--color-text-secondary)]">Note:</span>{" "}
          Energy shown is the <span className="text-[var(--color-text-secondary)]">total electronic energy</span> (including all-electron atomic contributions)
          from the MACE model. For solids, cohesive energy = E(bulk)/N &minus; E(isolated atom);
          subtract isolated atom energies for your elements. For molecules, relative energies
          between conformers are physically meaningful; absolute values depend on the DFT reference
          (ωB97M-D3BJ for MACE-OFF, PBE for MACE-MP-0).
        </p>
      </div>

      {/* Accuracy metrics (when reference data is present) */}
      {hasRef && (
        <Card className="gap-3 border-l-4 border-l-[var(--color-accent-primary)] py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-serif text-base font-semibold text-[var(--color-accent-strong)]">
              Model Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {accuracy.forceMAE != null && (
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Force MAE</p>
                  <p className="font-mono text-lg font-bold text-foreground">
                    {accuracy.forceMAE.toFixed(1)} <span className="text-xs text-muted-foreground">meV/A</span>
                  </p>
                </div>
              )}
              {accuracy.forceRMSE != null && (
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Force RMSE</p>
                  <p className="font-mono text-lg font-bold text-foreground">
                    {accuracy.forceRMSE.toFixed(1)} <span className="text-xs text-muted-foreground">meV/A</span>
                  </p>
                </div>
              )}
              {accuracy.energyMAE != null && (
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Energy MAE</p>
                  <p className="font-mono text-lg font-bold text-foreground">
                    {accuracy.energyMAE.toFixed(1)} <span className="text-xs text-muted-foreground">meV/atom</span>
                  </p>
                </div>
              )}
              {accuracy.energyR2 != null ? (
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Energy R&sup2;</p>
                  <p className="font-mono text-lg font-bold text-foreground">
                    {accuracy.energyR2.toFixed(4)}
                  </p>
                </div>
              ) : (
                accuracy.energyError != null && (
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">Energy error vs. reference</p>
                    <p className="font-mono text-lg font-bold text-foreground">
                      {accuracy.energyError >= 0 ? "+" : ""}
                      {accuracy.energyError.toFixed(4)}{" "}
                      <span className="text-xs text-muted-foreground">eV</span>
                    </p>
                    {accuracy.energyErrorPerAtom != null && (
                      <p className="font-mono text-xs text-muted-foreground">
                        {accuracy.energyErrorPerAtom >= 0 ? "+" : ""}
                        {accuracy.energyErrorPerAtom.toFixed(4)} eV/atom
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MD trajectory summary */}
      {result.trajectory && result.trajectory.energies.length > 0 && (
        <Card className="gap-3 border-l-4 border-l-[var(--color-data-yellow)] py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              MD Trajectory
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="grid gap-4 sm:grid-cols-3 font-mono text-xs">
              <div>
                <span className="text-muted-foreground">Steps</span>
                <p className="text-lg font-bold text-foreground">
                  {result.trajectory.energies.length}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">E range</span>
                <p className="text-lg font-bold text-foreground">
                  {Math.min(...result.trajectory.energies).toFixed(3)} &rarr;{" "}
                  {Math.max(...result.trajectory.energies).toFixed(3)} eV
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">&Delta;E</span>
                <p className="text-lg font-bold text-foreground">
                  {(
                    Math.max(...result.trajectory.energies) -
                    Math.min(...result.trajectory.energies)
                  ).toFixed(4)}{" "}
                  eV
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Limitations & uncertainty */}
      <div className="rounded-lg border border-border bg-muted px-4 py-3">
        <h4 className="mb-1.5 font-serif text-sm font-semibold text-foreground">
          Limitations &amp; Uncertainty
        </h4>
        <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-[var(--color-text-secondary)]">ML potential, not QM:</span>{" "}
            MACE is a machine-learned surrogate for DFT, not a first-principles calculation.
            Accuracy depends on the training data distribution.
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-secondary)]">Out-of-distribution risk:</span>{" "}
            Structures or chemistries far from the training set (exotic bonding, extreme pressures,
            charged species) may produce unreliable results with no built-in warning.
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-secondary)]">No uncertainty estimates:</span>{" "}
            These models do not provide prediction confidence intervals. Consider running
            multiple model sizes (small/medium/large) and comparing results to gauge robustness.
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-secondary)]">MACE-OFF scope:</span>{" "}
            Trained on neutral, closed-shell organic molecules only (H, C, N, O, F, P, S, Cl, Br, I).
            Not suitable for metals, radicals, ions, or extended solid-state systems.
          </li>
        </ul>
      </div>
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

    // forces/referenceForces may have mismatched lengths — use the shorter
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
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Force Parity Plot
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Predicted vs. reference force components (Fx, Fy, Fz). Points on the diagonal indicate perfect prediction.
            </p>
          </CardHeader>
          <CardContent className="px-4">
            <ParityPlot
              reference={refFlat}
              predicted={predFlat}
              elements={elemFlat}
              xLabel="Reference Force (eV/A)"
              yLabel="Predicted Force (eV/A)"
              title="Forces: Predicted vs. Reference"
            />
          </CardContent>
        </Card>

        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Force Error Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ErrorHistogram
              errors={errFlat}
              xLabel="Force Error (eV/A)"
              title="Force Error Distribution"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback: show force magnitude bar chart (no reference data)
  if (!result.forces || !result.symbols) {
    return (
      <Card className="py-6">
        <CardContent className="px-6 text-center">
          <p className="text-sm text-muted-foreground">
            No force data available for this calculation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle className="font-serif text-base font-semibold text-foreground">
            Per-Atom Force Magnitudes
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Upload a structure with reference forces (REF_forces in extxyz) for parity plots and error analysis.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <ForcesTable
            forces={result.forces}
            symbols={result.symbols}
            maxForceIdx={maxForceIdx}
          />
        </CardContent>
      </Card>
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
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Energy Parity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ParityPlot
              reference={[result.referenceEnergy]}
              predicted={[result.energy]}
              xLabel="Reference Energy (eV)"
              yLabel="Predicted Energy (eV)"
              title="Energy: Predicted vs. Reference"
            />
          </CardContent>
        </Card>
      )}

      {/* Energy convergence for MD or geometry optimization */}
      {result.trajectory && result.trajectory.energies.length > 1 && (
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Energy vs. Step
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <EnergyConvergence
              energies={result.trajectory.energies}
              steps={
                result.trajectory.step.length > 0
                  ? result.trajectory.step
                  : result.trajectory.energies.map((_, i) => i)
              }
              title={isMD ? "MD Energy vs. Step" : "Optimization Energy"}
            />
          </CardContent>
        </Card>
      )}

      {/* Energy distribution for MD */}
      {isMD && result.trajectory && result.trajectory.energies.length > 2 && (
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Energy Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ErrorHistogram
              errors={result.trajectory.energies}
              xLabel="Energy (eV)"
              title="MD Energy Distribution"
              color={DATA_COLORS.blue}
            />
          </CardContent>
        </Card>
      )}

      {/* Fallback if no trajectory data */}
      {(!result.trajectory || result.trajectory.energies.length <= 1) &&
        !hasRefEnergy && (
          <Card className="py-6">
            <CardContent className="px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Single-point calculation — no energy convergence data.
                Run a geometry optimization or MD simulation for energy analysis.
              </p>
            </CardContent>
          </Card>
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
      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        <MoleculeViewer3D result={result} />
      </div>

      {isMD && hasTraj && (
        <Card className="gap-3 py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              MD Trajectory Animation
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <TrajectoryViewer result={result} />
          </CardContent>
        </Card>
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
        <Button
          onClick={downloadCSV}
          disabled={!result.forces}
          variant="outline"
          size="sm"
          className="font-mono text-xs"
        >
          <Download className="h-4 w-4" strokeWidth={1.75} /> Export CSV
        </Button>
        <Button
          onClick={downloadJSON}
          variant="outline"
          size="sm"
          className="font-mono text-xs"
        >
          <Download className="h-4 w-4" strokeWidth={1.75} /> Export JSON
        </Button>
      </div>

      <Separator />

      {/* Forces table */}
      {result.forces && result.symbols && (
        <Card className="gap-3 border-l-4 border-l-[var(--color-data-green)] py-5">
          <CardHeader className="px-5">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Atomic Forces (eV/A)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <ForcesTable
              forces={result.forces}
              symbols={result.symbols}
              maxForceIdx={maxForceIdx}
            />
          </CardContent>
        </Card>
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
    <Card className={`result-card gap-2 border-l-4 py-4 ${a.border}`}>
      <CardContent className="px-4">
        <div className="mb-2 flex items-center gap-2">
          <span className={a.icon}>{icon}</span>
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </h3>
        </div>
        <p className="font-mono text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="mt-1 font-mono text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
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
      <div className="max-h-72 overflow-auto rounded border border-border">
        <table className="w-full font-mono text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
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
                  className={`border-t border-border/60 transition-colors hover:bg-muted ${isMax ? "bg-[var(--color-data-cyan)]/10" : ""}`}
                >
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 font-bold">{symbols[i]}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[0].toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[1].toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[2].toFixed(4)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${isMax ? "text-[var(--color-data-red)]" : "text-[var(--color-accent-strong)]"}`}>
                    {mag.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
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
  if (params.timeStep != null) parts.push(`Δt ${params.timeStep} fs`);
  if (params.mdSteps != null) parts.push(`${params.mdSteps} MD steps`);
  if (params.mdEnsemble) parts.push(params.mdEnsemble);
  if (params.forceThreshold != null) parts.push(`fmax ${params.forceThreshold}`);
  if (params.dispersion) parts.push("D3 dispersion");
  return parts.length ? parts.join(" · ") : "Default parameters";
}
