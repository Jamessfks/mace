"use client";

/**
 * PropertyCalculator — Orchestrates semiconductor property workflows.
 *
 * Checkboxes for: single-point, EOS (bulk modulus), vacancy formation,
 * geometry optimization. Calls the existing /api/calculate endpoint
 * multiple times (e.g. 7 for EOS, 2 for vacancy) with progress feedback.
 */

import { useState, useCallback } from "react";
import {
  Zap,
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { CalculationResult } from "@/types/mace";
import type { WorkflowType, PropertyResult, SemiconductorMaterial } from "@/types/semiconductor";
import {
  fitEOS,
  vacancyFormationEnergy,
  generateEOSStructures,
} from "@/lib/semiconductor-properties";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PropertyCalculatorProps {
  /** Current loaded structure file */
  structureFile: File | null;
  /** Current loaded material metadata */
  material: SemiconductorMaterial | null;
  /** Optional vacancy file for vacancy formation energy */
  vacancyFile: File | null;
  /** Callback when results are ready */
  onResults: (results: PropertyResult[]) => void;
  /** Callback when a bulk result is available (for comparison view) */
  onBulkResult?: (result: CalculationResult) => void;
  /** Callback when a vacancy result is available (for comparison view) */
  onVacancyResult?: (result: CalculationResult) => void;
}

// ---------------------------------------------------------------------------
// Helper: call existing /api/calculate
// ---------------------------------------------------------------------------

async function runMACE(
  file: File,
  calcType: "single-point" | "geometry-opt" = "single-point"
): Promise<CalculationResult> {
  const formData = new FormData();
  formData.append("files", file);
  formData.append(
    "params",
    JSON.stringify({
      modelSize: "small",
      modelType: "MACE-MP-0",
      precision: "float32",
      device: "cpu",
      calculationType: calcType,
      dispersion: false,
    })
  );

  const response = await fetch("/api/calculate", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Calculation failed");
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropertyCalculator({
  structureFile,
  material,
  vacancyFile,
  onResults,
  onBulkResult,
  onVacancyResult,
}: PropertyCalculatorProps) {
  // Workflow selection
  const [doSinglePoint, setDoSinglePoint] = useState(true);
  const [doEOS, setDoEOS] = useState(false);
  const [doVacancy, setDoVacancy] = useState(false);
  const [doGeomOpt, setDoGeomOpt] = useState(false);

  // Progress
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [stepProgress, setStepProgress] = useState<[number, number]>([0, 0]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totalSteps =
    (doSinglePoint ? 1 : 0) +
    (doEOS ? 7 : 0) +
    (doVacancy ? 2 : 0) +
    (doGeomOpt ? 1 : 0);

  const handleRun = useCallback(async () => {
    if (!structureFile || !material) return;

    setIsRunning(true);
    setError(null);
    setElapsedSeconds(0);
    const startTime = Date.now();
    const timer = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000)),
      1000
    );

    const results: PropertyResult[] = [];
    let completedSteps = 0;

    try {
      // ── Single-point ──
      if (doSinglePoint) {
        setCurrentStep("Single-point energy & forces");
        setStepProgress([++completedSteps, totalSteps]);
        const result = await runMACE(structureFile, "single-point");
        onBulkResult?.(result);
        results.push({
          result,
          workflow: "single-point",
          materialId: material.id,
        });
      }

      // ── Geometry optimization ──
      if (doGeomOpt) {
        setCurrentStep("Geometry optimization");
        setStepProgress([++completedSteps, totalSteps]);
        const result = await runMACE(structureFile, "geometry-opt");
        results.push({
          result,
          workflow: "geometry-opt",
          materialId: material.id,
        });
      }

      // ── EOS → bulk modulus ──
      if (doEOS) {
        const eosStructures = generateEOSStructures(material.xyzData);
        if (!eosStructures) throw new Error("Could not generate EOS structures");

        const volumes: number[] = [];
        const energies: number[] = [];

        for (let i = 0; i < eosStructures.length; i++) {
          const s = eosStructures[i];
          setCurrentStep(
            `EOS step ${i + 1}/${eosStructures.length}: V = ${s.ratio.toFixed(2)}×V₀`
          );
          setStepProgress([++completedSteps, totalSteps]);

          const blob = new Blob([s.xyzData], { type: "chemical/x-xyz" });
          const file = new File([blob], `${material.id}-eos-${i}.xyz`, {
            type: "chemical/x-xyz",
          });
          const result = await runMACE(file, "single-point");

          if (result.energy != null && result.properties?.volume != null) {
            volumes.push(result.properties.volume);
            energies.push(result.energy);
          } else if (result.energy != null) {
            // Estimate volume from lattice if not returned
            const ratio = s.ratio;
            const baseVol = material.latticeA ** 3; // cubic approx
            volumes.push(baseVol * ratio);
            energies.push(result.energy);
          }
        }

        const eosResult = fitEOS(volumes, energies);
        results.push({
          result: { status: "success", energy: eosResult?.E0 },
          workflow: "eos",
          materialId: material.id,
          bulkModulusGPa: eosResult?.B0,
          eosData: { volumes, energies },
        });
      }

      // ── Vacancy formation energy ──
      if (doVacancy) {
        if (!vacancyFile) {
          throw new Error(
            "Generate a vacancy structure first (use the Defect Generator)."
          );
        }

        // Bulk run (if not already done)
        setCurrentStep("Vacancy: computing bulk energy");
        setStepProgress([++completedSteps, totalSteps]);
        const bulkResult = await runMACE(structureFile, "single-point");
        onBulkResult?.(bulkResult);

        setCurrentStep("Vacancy: computing defect energy");
        setStepProgress([++completedSteps, totalSteps]);
        const vacResult = await runMACE(vacancyFile, "single-point");
        onVacancyResult?.(vacResult);

        const nAtoms = bulkResult.symbols?.length ?? material.atomCount;
        const eVac =
          bulkResult.energy != null && vacResult.energy != null
            ? vacancyFormationEnergy(bulkResult.energy, vacResult.energy, nAtoms)
            : undefined;

        results.push({
          result: vacResult,
          workflow: "vacancy-formation",
          materialId: material.id,
          vacancyFormationEv: eVac,
        });
      }

      onResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      clearInterval(timer);
      setIsRunning(false);
    }
  }, [
    structureFile,
    material,
    vacancyFile,
    doSinglePoint,
    doEOS,
    doVacancy,
    doGeomOpt,
    totalSteps,
    onResults,
    onBulkResult,
    onVacancyResult,
  ]);

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
      <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
        PROPERTY CALCULATOR
      </h2>

      {/* Workflow checkboxes */}
      <div className="mb-4 space-y-2">
        {[
          {
            checked: doSinglePoint,
            onChange: setDoSinglePoint,
            label: "Single-point energy & forces",
            always: true,
          },
          {
            checked: doGeomOpt,
            onChange: setDoGeomOpt,
            label: "Geometry optimization",
          },
          {
            checked: doEOS,
            onChange: setDoEOS,
            label: "Equation of State → bulk modulus (7 volumes)",
          },
          {
            checked: doVacancy,
            onChange: setDoVacancy,
            label: "Vacancy formation energy (bulk + defect)",
            disabled: !vacancyFile,
            hint: !vacancyFile
              ? "Generate a vacancy first"
              : undefined,
          },
        ].map((item) => (
          <label
            key={item.label}
            className="flex items-center gap-3 rounded p-2 transition-colors hover:bg-matrix-green/5 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => item.onChange(e.target.checked)}
              disabled={item.always || item.disabled}
              className="accent-matrix-green"
            />
            <span className="font-mono text-xs text-zinc-300">
              {item.label}
            </span>
            {item.hint && (
              <span className="font-mono text-[10px] text-zinc-600">
                ({item.hint})
              </span>
            )}
          </label>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={isRunning || !structureFile || totalSteps === 0}
        className="group relative w-full overflow-hidden rounded-md border-2 border-matrix-green bg-matrix-green/10 px-6 py-3 font-mono text-sm font-bold text-matrix-green transition-all hover:bg-matrix-green hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-matrix-green/10 disabled:hover:text-matrix-green"
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Computing…
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Zap className="h-4 w-4" />
            RUN CALCULATIONS ({totalSteps} step{totalSteps !== 1 ? "s" : ""})
          </span>
        )}
      </button>

      {/* Progress */}
      {isRunning && (
        <div className="mt-4 space-y-3">
          {/* Step label */}
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-matrix-green" />
            <span className="font-mono text-xs text-matrix-green font-bold">
              {currentStep}
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-matrix-green transition-all duration-500"
                style={{
                  width: `${Math.round(
                    (stepProgress[0] / Math.max(stepProgress[1], 1)) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {elapsedSeconds}s elapsed
              </div>
              <span>
                Step {stepProgress[0]}/{stepProgress[1]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
