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
 *
 * UNITS & PRECISION (see "Display precision" below):
 *   Every rendered number carries its unit inline (eV, eV/Å, eV/atom, Å³,
 *   meV/Å, meV/atom — never a bare number), at a fixed, sane precision per
 *   quantity. MACE's own accuracy floor is roughly 10-30 meV/atom for
 *   MACE-MP-0 and a few meV/atom for MACE-OFF, so float64's full digit
 *   string is never meaningful on screen. Raw JSON/CSV exports keep full
 *   precision for downstream reuse; only the rendered UI is rounded.
 *   Total Energy is always shown next to the model that produced it, because
 *   MACE-MP-0 and MACE-OFF use different, non-comparable reference
 *   conventions (CLAUDE.md, "Energy Reference Conventions").
 */

import { useState, useMemo } from "react";
import {
  BarChart3,
  Zap,
  ArrowRightLeft,
  AlertTriangle,
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
// Display precision & model reference conventions
// ---------------------------------------------------------------------------

/**
 * Decimal places shown per physical quantity — chosen once here and used
 * everywhere that quantity is rendered, per CLAUDE.md's "Precision honesty"
 * rule. MACE's own accuracy is roughly 10-30 meV/atom for MACE-MP-0 and a
 * few meV/atom for MACE-OFF, so float64's ~15 significant digits are never
 * meaningful on screen. Raw JSON/CSV exports intentionally keep full
 * precision for downstream reuse — only the rendered UI is rounded.
 */
const EV_DECIMALS = 4; // eV — total energy, energy differences/errors
const EV_PER_ATOM_DECIMALS = 4; // eV/atom
const FORCE_DECIMALS = 4; // eV/Å — per-atom, RMS, and max force
const VOLUME_DECIMALS = 2; // Å³
const MEV_DECIMALS = 1; // meV, meV/Å, meV/atom — accuracy metrics

/**
 * MACE foundation models are fit to different DFT/DFT-like references, so a
 * raw total energy is meaningless without knowing which model produced it
 * (CLAUDE.md, "Energy Reference Conventions"). Ranges are typical orders of
 * magnitude, not hard bounds — flag, don't block.
 */
const ENERGY_CONVENTIONS: Record<string, { method: string; range: [number, number] }> = {
  "MACE-MP-0": { method: "PBE(+U) DFT reference", range: [-15, -1] },
  "MACE-OFF": { method: "ωB97M-D3BJ reference", range: [-600, -100] },
};

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
      ? (result.energy / atomCount).toFixed(EV_PER_ATOM_DECIMALS)
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
              {result.timeTaken.toFixed(1)} s
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
  const modelType = result.params?.modelType;
  const modelSize = result.params?.modelSize;
  const convention = modelType ? ENERGY_CONVENTIONS[modelType] : undefined;
  const ePerAtomNum = result.energy != null && atomCount > 0 ? result.energy / atomCount : null;
  const energyInRange =
    convention && ePerAtomNum != null
      ? ePerAtomNum >= convention.range[0] && ePerAtomNum <= convention.range[1]
      : null;

  // Dense "Properties" table — computed (output) quantities only, MP-style
  // rows. Run-time inputs (model, thresholds, ensemble) stay in Run
  // Configuration above; this table is strictly what MACE actually produced.
  const propertyRows: { label: string; value: React.ReactNode }[] = [];
  if (rmsForce != null) {
    propertyRows.push({ label: "RMS Force", value: `${rmsForce.toFixed(FORCE_DECIMALS)} eV/Å` });
  }
  if (result.forces && result.forces.length > 0) {
    propertyRows.push({
      label: "Max Force",
      value: (
        <>
          {maxForce.toFixed(FORCE_DECIMALS)} eV/Å{" "}
          <span className="text-muted-foreground">
            (#{maxForceIdx + 1} {result.symbols?.[maxForceIdx] ?? "?"})
          </span>
        </>
      ),
    });
  }
  if (result.properties?.volume != null) {
    propertyRows.push({
      label: "Cell Volume",
      value: `${result.properties.volume.toFixed(VOLUME_DECIMALS)} Å³`,
    });
  }
  if (atomCount > 0) {
    const uniqueElements = result.symbols ? Array.from(new Set(result.symbols)).sort() : [];
    propertyRows.push({ label: "Atoms", value: `${atomCount} (${uniqueElements.join(", ")})` });
  }

  // Model Accuracy table rows — only meaningful when reference data exists.
  const accuracyRows: { label: string; value: React.ReactNode }[] = [];
  if (accuracy.forceMAE != null) {
    accuracyRows.push({ label: "Force MAE", value: `${accuracy.forceMAE.toFixed(MEV_DECIMALS)} meV/Å` });
  }
  if (accuracy.forceRMSE != null) {
    accuracyRows.push({ label: "Force RMSE", value: `${accuracy.forceRMSE.toFixed(MEV_DECIMALS)} meV/Å` });
  }
  if (accuracy.energyMAE != null) {
    accuracyRows.push({ label: "Energy MAE", value: `${accuracy.energyMAE.toFixed(MEV_DECIMALS)} meV/atom` });
  }
  if (accuracy.energyR2 != null) {
    accuracyRows.push({ label: "Energy R²", value: accuracy.energyR2.toFixed(4) });
  } else if (accuracy.energyError != null) {
    accuracyRows.push({
      label: "Energy error vs. reference",
      value: (
        <>
          {accuracy.energyError >= 0 ? "+" : ""}
          {accuracy.energyError.toFixed(EV_DECIMALS)} eV
          {accuracy.energyErrorPerAtom != null && (
            <span className="text-muted-foreground">
              {" "}
              ({accuracy.energyErrorPerAtom >= 0 ? "+" : ""}
              {accuracy.energyErrorPerAtom.toFixed(EV_PER_ATOM_DECIMALS)} eV/atom)
            </span>
          )}
        </>
      ),
    });
  }

  // MD Trajectory table rows.
  const trajEnergies = result.trajectory?.energies ?? [];
  const trajRows: { label: string; value: React.ReactNode }[] =
    trajEnergies.length > 0
      ? [
          { label: "Steps", value: `${trajEnergies.length}` },
          {
            label: "Energy range",
            value: `${Math.min(...trajEnergies).toFixed(EV_DECIMALS)} → ${Math.max(...trajEnergies).toFixed(EV_DECIMALS)} eV`,
          },
          {
            label: "ΔE",
            value: `${(Math.max(...trajEnergies) - Math.min(...trajEnergies)).toFixed(EV_DECIMALS)} eV`,
          },
        ]
      : [];

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

      {/* D3 dispersion + MACE-OFF double-counts dispersion — flag it (CLAUDE.md pitfall #4) */}
      {result.params?.dispersion && result.params?.modelType === "MACE-OFF" && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" strokeWidth={1.75} />
          <p className="text-xs leading-relaxed text-[var(--color-warning)]">
            <span className="font-bold">D3 dispersion enabled with MACE-OFF.</span>{" "}
            MACE-OFF is trained on ωB97M-D3BJ, which already includes D3 dispersion —
            enabling it again here likely double-counts the dispersion contribution.
          </p>
        </div>
      )}

      {/* Energy (headline, model-aware) + Properties (dense key/value table) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MetricCard
          label="Total Energy"
          value={result.energy != null ? `${result.energy.toFixed(EV_DECIMALS)} eV` : "N/A"}
          sub={
            <>
              <div>{ePerAtom} eV/atom</div>
              {modelType && (
                <div className={energyInRange === false ? "text-[var(--color-warning)]" : undefined}>
                  {modelType === "custom" ? "Custom model" : modelType}
                  {modelSize ? ` (${modelSize})` : ""} &middot;{" "}
                  {convention?.method ?? "reference convention unknown"}
                  {energyInRange === false &&
                    convention &&
                    ` — outside typical ${convention.range[0]} to ${convention.range[1]} eV/atom`}
                </div>
              )}
            </>
          }
          color="data-blue"
          icon={<Zap className="h-4 w-4" strokeWidth={1.75} />}
        />

        {propertyRows.length > 0 && (
          <Card className="gap-2 border-l-4 border-l-[var(--color-data-gray)] py-4">
            <CardHeader className="px-4">
              <CardTitle className="font-serif text-sm font-semibold text-foreground">
                Properties
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <PropertyRows rows={propertyRows} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Energy context note — model-aware */}
      <EnergyReferenceNote result={result} />

      {/* Accuracy metrics (when reference data is present) */}
      {hasRef && accuracyRows.length > 0 && (
        <Card className="gap-2 border-l-4 border-l-[var(--color-accent-primary)] py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-sm font-semibold text-[var(--color-accent-strong)]">
              Model Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <PropertyRows rows={accuracyRows} />
          </CardContent>
        </Card>
      )}

      {/* MD trajectory summary */}
      {trajRows.length > 0 && (
        <Card className="gap-2 border-l-4 border-l-[var(--color-data-yellow)] py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-sm font-semibold text-foreground">
              MD Trajectory
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <PropertyRows rows={trajRows} />
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
              xLabel="Reference Force (eV/Å)"
              yLabel="Predicted Force (eV/Å)"
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
              xLabel="Force Error (eV/Å)"
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
            Per-Atom Force Magnitudes (eV/Å)
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
              Atomic Forces (eV/Å)
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
  sub?: React.ReactNode;
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
        {sub && (
          <div className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Tight Materials-Project-style key/value row: bold label left, value right,
 * hairline rule between rows, minimal vertical padding.
 */
function PropertyRows({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between gap-4 border-t border-border py-2 first:border-t-0 first:pt-0 last:pb-0"
        >
          <span className="font-sans text-sm font-semibold text-foreground">{row.label}</span>
          <span className="font-mono text-sm tabular-nums text-right text-[var(--color-accent-strong)]">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Model-aware energy footnote: names the model that produced the number and
 * its DFT/reference convention, and explains why raw totals aren't portable
 * across models (CLAUDE.md, "Energy Reference Conventions").
 */
function EnergyReferenceNote({ result }: { result: CalculationResult }) {
  const modelType = result.params?.modelType;
  const modelSize = result.params?.modelSize;
  const conv = modelType ? ENERGY_CONVENTIONS[modelType] : undefined;

  return (
    <div className="rounded-lg border border-border bg-muted px-4 py-3">
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-bold text-[var(--color-text-secondary)]">
          Note{modelType ? ` (${modelType}${modelSize ? `, ${modelSize}` : ""})` : ""}:
        </span>{" "}
        Energy is the total electronic energy from the MACE model (including all-electron
        atomic contributions) &mdash; not a directly measurable quantity.{" "}
        {conv ? (
          <>
            This model is referenced to{" "}
            <span className="text-[var(--color-text-secondary)]">{conv.method}</span>; typical
            values fall between {conv.range[0]} and {conv.range[1]} eV/atom for {modelType}.
          </>
        ) : modelType === "custom" ? (
          <>
            This is a custom checkpoint &mdash; its reference convention depends on how it was
            trained and is not necessarily comparable to MACE-MP-0 or MACE-OFF energies.
          </>
        ) : (
          <>Absolute values depend on the reference used to train the model that produced them.</>
        )}{" "}
        Totals from a different model or reference state are never directly comparable &mdash;
        only compare energies produced by the same model.{" "}
        {modelType === "MACE-MP-0" && (
          <>
            For solids, cohesive energy = E(bulk)/N &minus; E(isolated atom); subtract
            isolated-atom energies for your elements to get a physically comparable number.
          </>
        )}
        {modelType === "MACE-OFF" && (
          <>
            For molecules, relative energies between conformers of the same composition are
            physically meaningful; absolute totals are not.
          </>
        )}
      </p>
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
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[0].toFixed(FORCE_DECIMALS)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[1].toFixed(FORCE_DECIMALS)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{force[2].toFixed(FORCE_DECIMALS)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${isMax ? "text-[var(--color-data-red)]" : "text-[var(--color-accent-strong)]"}`}>
                    {mag.toFixed(FORCE_DECIMALS)}
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
  if (params.friction != null) parts.push(`friction ${params.friction} /fs`);
  if (params.mdSteps != null) parts.push(`${params.mdSteps} MD steps`);
  if (params.mdEnsemble) parts.push(params.mdEnsemble);
  if (params.forceThreshold != null) parts.push(`fmax ${params.forceThreshold} eV/Å`);
  if (params.dispersion) parts.push("D3 dispersion");
  return parts.length ? parts.join(" · ") : "Default parameters";
}
