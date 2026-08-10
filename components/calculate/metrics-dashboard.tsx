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
  Check,
  Copy,
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
import type {
  CalculationParams,
  CalculationProvenance,
  CalculationResult,
  CalculationValidation,
} from "@/types/mace";

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
          {/* Name the structure the numbers came from — this banner is also
              the header of a shared result, where the file is not otherwise
              visible. */}
          {filename && (
            <span className="font-mono text-xs text-muted-foreground">
              {filename}
            </span>
          )}
          {/* Compute time and round-trip time are different measurements and
              are labelled as such. Neither is ever rendered with more digits
              than the value it came from — see formatDuration(). */}
          {result.timeTaken != null && (
            <span
              className="font-mono text-xs text-muted-foreground"
              title="Backend-measured calculation time, timed around the calculation itself — structure parsing and model load happen before the clock starts."
            >
              {formatDuration(result.timeTaken)} compute
            </span>
          )}
          {result.clientRoundTrip != null && (
            <span
              className="font-mono text-xs text-muted-foreground"
              title="Wall-clock time measured in the browser: request, HTTP both ways, any model download, and the compute."
            >
              {formatDuration(result.clientRoundTrip)} round trip
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

      {/* ═══ Backend warnings ═══ */}
      <ResultWarnings warnings={result.warnings} />

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

  // Trajectory table rows — energy budget, honestly labelled.
  const isMD = result.params?.calculationType === "molecular-dynamics";
  const trajRows = buildTrajectoryRows(result, isMD);

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

      {/* Trajectory summary — MD energy budget, or optimization progress */}
      {trajRows.length > 0 && (
        <Card className="gap-2 border-l-4 border-l-[var(--color-data-yellow)] py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-sm font-semibold text-foreground">
              {isMD ? "MD Trajectory" : "Optimization Trajectory"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <PropertyRows rows={trajRows} />
          </CardContent>
        </Card>
      )}

      {/* Advisory validation findings — a peer section, not a footnote.
          Renders nothing when the backend attached none. */}
      <ValidationFindings
        validation={result.validation}
        backendWarnings={result.warnings}
      />

      {/* Provenance — Materials Project treats "Property Origins" as a peer of
          the data, and so does this. Renders nothing on results that predate
          the manifest (older MACE Links). */}
      <ProvenanceSection provenance={result.provenance} />

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
  const traj = result.trajectory;
  // `energies` is the potential energy and always has been; `potentialEnergies`
  // is its explicit alias on newer results. Prefer the explicit key, fall back
  // to `energies` so results shared before the key existed still plot.
  const potentialEnergies = traj?.potentialEnergies ?? traj?.energies ?? [];
  const totalEnergies = traj?.totalEnergies ?? [];
  const trajSteps =
    traj?.step && traj.step.length > 0
      ? traj.step
      : potentialEnergies.map((_, i) => i);

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

      {/*
        Total energy vs. step — the quantity NVE conserves, and the only one
        the docs' conservation claim can be checked against. Only rendered
        when the backend supplied `totalEnergies`; older shared results
        (MACE Link) carry potential energy alone and fall through to the
        chart below, correctly labelled.
      */}
      {isMD && totalEnergies.length > 1 && (
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Total Energy vs. Step
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Potential + kinetic energy. This is the conserved quantity in NVE;
              under NVT the Langevin thermostat exchanges energy with the bath, so
              it is expected to drift.
            </p>
          </CardHeader>
          <CardContent className="px-4">
            <EnergyConvergence
              energies={totalEnergies}
              steps={trajSteps}
              title="MD Total Energy (potential + kinetic) vs. Step"
            />
          </CardContent>
        </Card>
      )}

      {/* Potential energy vs. step — MD and geometry optimization alike */}
      {potentialEnergies.length > 1 && (
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Potential Energy vs. Step
            </CardTitle>
            {isMD && (
              <p className="text-xs text-muted-foreground">
                Potential energy alone is not conserved under any ensemble — it
                trades against kinetic energy every step. Judge NVE conservation on
                the total-energy chart{totalEnergies.length > 1 ? " above" : ""}.
              </p>
            )}
          </CardHeader>
          <CardContent className="px-4">
            <EnergyConvergence
              energies={potentialEnergies}
              steps={trajSteps}
              title={
                isMD
                  ? "MD Potential Energy vs. Step"
                  : "Optimization Potential Energy vs. Step"
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Energy distribution for MD */}
      {isMD && potentialEnergies.length > 2 && (
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="font-serif text-base font-semibold text-foreground">
              Potential Energy Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ErrorHistogram
              errors={potentialEnergies}
              xLabel="Potential Energy (eV)"
              title="MD Potential Energy Distribution"
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

/**
 * Backend warnings, rendered verbatim.
 *
 * These come from `result.warnings` — the backend is the only party that
 * knows what actually ran, so it is the only party that can say what was
 * requested but not applied. It reports D3 that was dropped (MACE-OFF
 * already includes dispersion; upstream's `mace_off()` has no such
 * parameter), a precision below upstream's recommendation, an optimization
 * that hit its step ceiling, and any dtype conversion MACE performed on the
 * checkpoint.
 *
 * Deliberately NOT a set of re-derived conditions in the UI. The previous
 * D3 banner tested `params.dispersion && modelType === "MACE-OFF"`, which
 * stopped rendering the moment the backend started reporting `dispersion`
 * honestly — for MACE-OFF it is now always false, because no D3 calculator
 * is ever built. A UI copy of backend logic goes stale silently; displaying
 * what the backend said cannot.
 *
 * Absent on results produced before this field existed, and on runs with
 * nothing to report — both render nothing.
 */
function ResultWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-[var(--color-warning)]"
          strokeWidth={1.75}
        />
        <h3 className="font-sans text-sm font-bold text-[var(--color-warning)]">
          {warnings.length === 1
            ? "1 warning from the calculation"
            : `${warnings.length} warnings from the calculation`}
        </h3>
      </div>
      <ul className="mt-2 space-y-1.5 pl-6">
        {warnings.map((warning, i) => (
          <li
            key={i}
            className="list-disc text-xs leading-relaxed text-[var(--color-warning)]"
          >
            {warning}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation findings (result.validation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Advisory findings from `test_scripts/validate_calculation.py`, attached to
 * every result by `attach_validation()` in mace-api/calculate.py.
 *
 * Its own block, deliberately, and NOT folded into <ResultWarnings/>. Those
 * two lists have different authors and different meanings: `result.warnings`
 * is the calculation reporting on itself ("D3 was requested but not applied",
 * "the optimization hit its step ceiling"), while this is a separate validator
 * re-reading the finished numbers and saying whether they look physical. A
 * reader needs to know which one is speaking. The backend never copies one
 * into the other, but any finding whose text is byte-identical to a warning
 * already rendered above is dropped here rather than printed twice.
 *
 * Advisory means advisory: findings are never used to reject a calculation
 * that completed, and the policy line from the backend says so on screen.
 * Renders nothing on results produced before this field existed.
 */
function ValidationFindings({
  validation,
  backendWarnings,
}: {
  validation?: CalculationValidation;
  backendWarnings?: string[];
}) {
  if (!validation) return null;

  // The validator could not be loaded (it lives outside the Docker build
  // context, for one). Say that, rather than implying silence means a pass.
  if (validation.status !== "ran") {
    return (
      <Card className="gap-2 border-l-4 border-l-[var(--color-data-gray)] py-4">
        <CardHeader className="px-4">
          <CardTitle className="font-serif text-sm font-semibold text-foreground">
            Validation
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            The validator did not run
            {validation.unavailableReason ? ` — ${validation.unavailableReason}` : "."}{" "}
            The calculation is unaffected; it simply has no second opinion attached.
          </p>
        </CardContent>
      </Card>
    );
  }

  const alreadyShown = new Set(backendWarnings ?? []);
  const collect = (items?: string[], prefix = "") =>
    (items ?? [])
      .filter((text) => !alreadyShown.has(text))
      .map((text) => `${prefix}${text}`);

  const issues = [
    ...collect(validation.issues),
    ...collect(validation.params?.issues, "Parameters — "),
  ];
  const warnings = [
    ...collect(validation.warnings),
    ...collect(validation.params?.warnings, "Parameters — "),
  ];
  const info = collect(validation.info);

  // `valid` is the validator's own verdict; trust it over a count of the lists,
  // so a "not valid" result never gets summarised as a clean pass because its
  // findings happened to be de-duplicated away.
  const failed = validation.valid === false || issues.length > 0;
  const clean = !failed && warnings.length === 0;
  const counts = [
    issues.length > 0
      ? `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`
      : null,
    warnings.length > 0
      ? `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`
      : null,
  ].filter(Boolean);
  const summary = clean
    ? "All automated checks passed."
    : counts.length > 0
      ? counts.join(" · ")
      : "Reported as not valid, with no findings listed.";

  // Static class strings, not interpolated ones: Tailwind generates utilities
  // by scanning the source text, so a class assembled at runtime never exists.
  const severity = failed ? "issue" : warnings.length > 0 ? "warning" : "ok";
  const accent = FINDING_STYLES[severity];

  return (
    <Card className={`gap-2 border-l-4 py-4 ${accent.border}`}>
      <CardHeader className="px-4">
        <CardTitle className={`font-serif text-sm font-semibold ${accent.text}`}>
          Validation
        </CardTitle>
        <p className="font-mono text-xs text-muted-foreground">{summary}</p>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {issues.length > 0 && (
          <FindingList items={issues} severity="issue" heading="Issues" />
        )}
        {warnings.length > 0 && (
          <FindingList items={warnings} severity="warning" heading="Warnings" />
        )}
        {info.length > 0 && (
          <FindingList items={info} severity="info" heading="Checks performed" />
        )}
        <p className="border-t border-border pt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {validation.source ?? "validator"}
          {validation.policy ? ` · ${validation.policy}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Severity → static Tailwind classes. Written out in full so the class strings
 * exist literally in the source for Tailwind to find.
 */
const FINDING_STYLES = {
  issue: {
    text: "text-[var(--color-error)]",
    border: "border-l-[var(--color-error)]",
  },
  warning: {
    text: "text-[var(--color-warning)]",
    border: "border-l-[var(--color-warning)]",
  },
  ok: {
    text: "text-[var(--color-success)]",
    border: "border-l-[var(--color-success)]",
  },
  info: {
    text: "text-muted-foreground",
    border: "border-l-[var(--color-data-gray)]",
  },
} as const;

function FindingList({
  items,
  severity,
  heading,
}: {
  items: string[];
  severity: keyof typeof FINDING_STYLES;
  heading: string;
}) {
  return (
    <div>
      <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {heading}
      </h4>
      <ul className="mt-1 space-y-1 pl-4">
        {items.map((item, i) => (
          <li
            key={i}
            className={`list-disc font-mono text-xs leading-relaxed ${FINDING_STYLES[severity].text}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Provenance (result.provenance)
// ═══════════════════════════════════════════════════════════════════════════

/** Characters of a digest shown before the ellipsis. */
const HASH_PREFIX_CHARS = 16;
const BYTES_PER_MIB = 1024 * 1024;

/**
 * A digest: truncated so it can be read, copyable so it stays evidence.
 *
 * The full value is on the element's `title` as well as behind the button, so
 * it is recoverable even where the clipboard API is unavailable (an insecure
 * origin, a denied permission).
 */
function HashValue({
  value,
  label,
  prefixChars = HASH_PREFIX_CHARS,
}: {
  value: string;
  label: string;
  prefixChars?: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the full value is still on the title attribute.
    }
  };

  const shown =
    value.length > prefixChars ? `${value.slice(0, prefixChars)}…` : value;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="break-all" title={value}>
        {shown}
      </span>
      <button
        type="button"
        onClick={copy}
        title={`Copy full ${label}: ${value}`}
        aria-label={`Copy full ${label}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--color-accent-strong)]"
      >
        {copied ? (
          <Check className="h-3 w-3 text-[var(--color-success)]" strokeWidth={2} />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={1.75} />
        )}
      </button>
    </span>
  );
}

/**
 * The reproducibility manifest, as a peer section of the data.
 *
 * Materials Project makes "Property Origins" a section in its own right rather
 * than a footnote (docs/v2/bars/materials-project.md), and provenance earns
 * the same treatment here for a specific reason: "MACE-OFF small" is not a
 * reproducible identifier. It names a download URL whose contents can change,
 * resolved through a cache with opaque filenames, and says nothing about which
 * mace-torch/torch/ASE turned those weights into a number. The SHA256 of the
 * checkpoint that `torch.load()` actually opened is the identifier — so it is
 * shown, truncated for reading and copyable in full.
 *
 * Fields the backend could not measure come back null with a line in `notes`
 * explaining why; those notes are rendered rather than swallowed. Renders
 * nothing at all when there is no manifest (older results, older MACE Links).
 */
function ProvenanceSection({ provenance }: { provenance?: CalculationProvenance }) {
  if (!provenance) return null;

  const checkpoint = provenance.model?.checkpoint;
  const input = provenance.input;
  const runtime = provenance.runtime;
  const code = provenance.code;
  const notes = provenance.notes ?? [];
  const packageEntries = Object.entries(provenance.packages ?? {});
  const knownPackages = packageEntries.filter(([, version]) => version);

  const rows: { label: string; value: React.ReactNode }[] = [];

  if (checkpoint?.filename) {
    const qualifiers = [
      checkpoint.sizeBytes != null
        ? `${(checkpoint.sizeBytes / BYTES_PER_MIB).toFixed(1)} MiB`
        : null,
      checkpoint.resolvedBy ?? null,
    ].filter(Boolean);
    rows.push({
      label: "Checkpoint file",
      value: (
        <>
          {checkpoint.filename}
          {qualifiers.length > 0 && (
            <span className="text-muted-foreground"> ({qualifiers.join(" · ")})</span>
          )}
        </>
      ),
    });
  }

  // Always shown: a missing checkpoint hash is the single most important thing
  // this section can tell a reader, because without it the result cannot be
  // reproduced exactly no matter what else is recorded.
  rows.push({
    label: "Checkpoint SHA-256",
    value: checkpoint?.sha256 ? (
      <HashValue value={checkpoint.sha256} label="checkpoint SHA-256" />
    ) : (
      <span className="text-[var(--color-warning)]">
        not identified
        {checkpoint?.resolvedBy ? ` (${checkpoint.resolvedBy})` : ""}
      </span>
    ),
  });

  if (input?.filename) {
    rows.push({
      label: "Input file",
      value: (
        <>
          {input.filename}
          {input.format && <span className="text-muted-foreground"> ({input.format})</span>}
        </>
      ),
    });
  }
  if (input?.formula || input?.nAtoms != null) {
    rows.push({
      label: "Structure",
      value: [input?.formula, input?.nAtoms != null ? `${input.nAtoms} atoms` : null]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (input?.structureSha256) {
    rows.push({
      label: "Structure SHA-256",
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          <HashValue value={input.structureSha256} label="structure SHA-256" />
          {input.structureHashSpec && (
            <span className="text-muted-foreground">({input.structureHashSpec})</span>
          )}
        </span>
      ),
    });
  }
  if (input?.fileSha256) {
    rows.push({
      label: "Input file SHA-256",
      value: <HashValue value={input.fileSha256} label="input file SHA-256" />,
    });
  }

  if (knownPackages.length > 0) {
    rows.push({
      label: "Libraries",
      value: (
        <span className="inline-block text-right">
          {knownPackages.map(([name, version]) => (
            <span key={name} className="block">
              {name} {version}
            </span>
          ))}
        </span>
      ),
    });
  }

  // Random seed is reported for every calculation type, not just MD: "this run
  // drew no random numbers" is a reproducibility statement too.
  rows.push({
    label: "Random seed",
    value:
      runtime?.seed != null ? (
        `${runtime.seed}`
      ) : (
        <span className="text-muted-foreground">none — no stochastic step</span>
      ),
  });

  if (runtime?.python || runtime?.platform) {
    rows.push({
      label: "Interpreter",
      value: [
        runtime?.python ? `Python ${runtime.python}` : null,
        runtime?.platform ?? null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (code?.gitCommit) {
    rows.push({
      label: "Source commit",
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          <HashValue value={code.gitCommit} label="git commit" prefixChars={7} />
          {code.gitDirty === true ? (
            <span className="text-[var(--color-warning)]">uncommitted changes</span>
          ) : code.gitDirty === false ? (
            <span className="text-muted-foreground">clean</span>
          ) : (
            <span className="text-muted-foreground">dirty state unknown</span>
          )}
        </span>
      ),
    });
  }

  if (provenance.timestampUtc) {
    // Rendered as the backend wrote it (ISO-8601 UTC): unambiguous, and free of
    // the server/browser locale mismatch a reformat would introduce.
    rows.push({ label: "Recorded", value: provenance.timestampUtc });
  }

  return (
    <Card className="gap-2 border-l-4 border-l-[var(--color-data-purple)] py-4">
      <CardHeader className="px-4">
        <CardTitle className="font-serif text-sm font-semibold text-foreground">
          Provenance
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          What produced these numbers. A model name is not a reproducible
          identifier — the hash of the checkpoint that was actually loaded is.
        </p>
      </CardHeader>
      <CardContent className="px-4">
        <PropertyRows rows={rows} />
        {notes.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Manifest notes
            </h4>
            <ul className="mt-1 space-y-1 pl-4">
              {notes.map((note, i) => (
                <li
                  key={i}
                  className="list-disc font-mono text-[11px] leading-relaxed text-muted-foreground"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  // Precision and device come back resolved: the dtype read off the loaded
  // model (which may differ from the request — a custom checkpoint keeps its
  // own, and MACE converts on a mismatch) and the device after the CUDA→CPU
  // fallback. Showing them is the point of the backend echoing them.
  if (params.precision) parts.push(params.precision);
  if (params.device) parts.push(params.device);
  if (params.temperature != null) parts.push(`${params.temperature} K`);
  if (params.pressure != null) parts.push(`${params.pressure} GPa`);
  if (params.timeStep != null) parts.push(`Δt ${params.timeStep} fs`);
  if (params.friction != null) parts.push(`friction ${params.friction} /fs`);
  if (params.mdSteps != null) parts.push(`${params.mdSteps} MD steps`);
  if (params.mdEnsemble) parts.push(params.mdEnsemble);
  if (params.seed != null) parts.push(`seed ${params.seed}`);
  if (params.forceThreshold != null) parts.push(`fmax ${params.forceThreshold} eV/Å`);
  if (params.maxOptSteps != null) parts.push(`max ${params.maxOptSteps} steps`);
  if (params.dispersion) parts.push("D3 dispersion");
  return parts.length ? parts.join(" · ") : "Default parameters";
}

/**
 * A duration in seconds, rendered at a precision the source actually has.
 *
 * The backend reports `timeTaken` as `round(t, 3)` seconds and the browser
 * measures `clientRoundTrip` to the millisecond, so two decimals is the most
 * either can support — and an integer input is printed as an integer, because
 * a value that arrived rounded to whole seconds (which is what older shared
 * results carry) must not grow a decimal on the way to the screen. Rendering
 * FEWER digits than the source is always fine; more is fabrication.
 */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "N/A";
  const magnitude = Math.abs(seconds);
  // Digits the value itself actually carries. A whole-second value (what older
  // shared results hold, from when the client's rounded round-trip was written
  // into this field) therefore prints as a whole second.
  const sourceDecimals = (String(seconds).split(".")[1] ?? "").length;
  const readableDecimals =
    magnitude < 1 ? 3 : magnitude < 10 ? 2 : magnitude < 100 ? 1 : 0;
  const text = seconds.toFixed(Math.min(sourceDecimals, readableDecimals));
  // A small non-zero duration must not be reported as a flat zero.
  if (seconds > 0 && Number(text) === 0) return "< 0.001 s";
  return `${text} s`;
}

/** Mean of a non-empty numeric array. */
function meanOf(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Min/max by reduction, not by `Math.min(...values)`. MD steps go up to
 * 100 000 in the UI, and spreading an array that large into a call throws
 * a RangeError.
 */
function minOf(values: number[]): number {
  return values.reduce((m, v) => (v < m ? v : m), Infinity);
}

function maxOf(values: number[]): number {
  return values.reduce((m, v) => (v > m ? v : m), -Infinity);
}

/**
 * Energy differences are shown in meV once they are small enough for eV to
 * round them into invisibility — an NVE drift of 2.7 meV reads as "0.0027 eV"
 * otherwise, which is exactly the number a reader needs to see clearly.
 */
function formatEnergyDelta(deltaEv: number, signed = false): string {
  const sign = signed && deltaEv >= 0 ? "+" : "";
  return Math.abs(deltaEv) < 1
    ? `${sign}${(deltaEv * 1000).toFixed(MEV_DECIMALS)} meV`
    : `${sign}${deltaEv.toFixed(EV_DECIMALS)} eV`;
}

/**
 * Trajectory summary rows.
 *
 * Potential and total energy are reported as separate quantities because
 * they are separate quantities: `trajectory.energies` is, and always was,
 * the potential energy. Only `totalEnergies` (potential + kinetic) is the
 * conserved quantity in NVE, and it only exists on results produced by a
 * backend that records it — older shared results degrade to the potential
 * energy rows alone rather than to a mislabelled "total".
 */
function buildTrajectoryRows(
  result: CalculationResult,
  isMD: boolean,
): { label: string; value: React.ReactNode }[] {
  const traj = result.trajectory;
  if (!traj) return [];

  const potential = traj.potentialEnergies ?? traj.energies ?? [];
  if (potential.length === 0) return [];

  const total = traj.totalEnergies ?? [];
  const kinetic = traj.kineticEnergies ?? [];
  const temperatures = traj.temperatures ?? [];

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: isMD ? "Frames" : "Steps", value: `${potential.length}` },
  ];

  if (total.length > 1) {
    const first = total[0];
    const last = total[total.length - 1];
    rows.push({
      label: "Total energy (potential + kinetic)",
      value: `${first.toFixed(EV_DECIMALS)} → ${last.toFixed(EV_DECIMALS)} eV`,
    });
    rows.push({
      label: "Total energy drift",
      value: (
        <>
          {formatEnergyDelta(last - first, true)}
          <span className="text-muted-foreground">
            {" "}
            (spread {formatEnergyDelta(maxOf(total) - minOf(total))})
          </span>
        </>
      ),
    });
  }

  const pMin = minOf(potential);
  const pMax = maxOf(potential);
  rows.push({
    label: isMD ? "Potential energy range" : "Energy range",
    value: `${pMin.toFixed(EV_DECIMALS)} → ${pMax.toFixed(EV_DECIMALS)} eV`,
  });
  rows.push({
    label: isMD ? "Potential energy swing" : "ΔE",
    value: formatEnergyDelta(pMax - pMin),
  });

  if (kinetic.length > 0) {
    rows.push({
      label: "Kinetic energy (mean)",
      value: `${meanOf(kinetic).toFixed(EV_DECIMALS)} eV`,
    });
  }

  if (temperatures.length > 0) {
    const target = result.params?.temperature;
    rows.push({
      label: "Temperature (mean)",
      value: (
        <>
          {meanOf(temperatures).toFixed(1)} K
          <span className="text-muted-foreground">
            {" "}
            ({minOf(temperatures).toFixed(0)}–
            {maxOf(temperatures).toFixed(0)} K
            {target != null ? `, target ${target} K` : ""})
          </span>
        </>
      ),
    });
  }

  if (!isMD && result.converged != null) {
    rows.push({
      label: "Converged",
      value: result.converged
        ? "Yes — reached fmax"
        : "No — stopped at the step limit",
    });
    if (result.params?.finalFmax != null) {
      rows.push({
        label: "Final max force",
        value: `${result.params.finalFmax.toFixed(FORCE_DECIMALS)} eV/Å`,
      });
    }
  }

  return rows;
}
