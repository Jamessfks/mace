"use client";

/**
 * Semiconductor Materials Discovery — Main Page
 *
 * Layout mirrors app/calculate/page.tsx: sticky header, two-panel grid.
 * Left: structure library + defect generator + confidence indicator.
 * Right: property calculator + results + comparison view.
 */

import { useState } from "react";
import Link from "next/link";
import { Cpu } from "lucide-react";
import { StructureLibrary } from "@/components/semiconductor/structure-library";
import { DefectGenerator } from "@/components/semiconductor/defect-generator";
import { ConfidenceIndicator } from "@/components/semiconductor/confidence-indicator";
import { PropertyCalculator } from "@/components/semiconductor/property-calculator";
import { SemiconductorResults } from "@/components/semiconductor/semiconductor-results";
import { ComparisonView } from "@/components/semiconductor/comparison-view";
import type { SemiconductorMaterial, PropertyResult } from "@/types/semiconductor";
import type { CalculationResult } from "@/types/mace";

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function SemiconductorPage() {
  // ── Structure state ──
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [activeMaterial, setActiveMaterial] = useState<SemiconductorMaterial | null>(null);

  // ── Defect state ──
  const [vacancyFile, setVacancyFile] = useState<File | null>(null);
  const [vacancyDesc, setVacancyDesc] = useState<string | null>(null);

  // ── Results state ──
  const [results, setResults] = useState<PropertyResult[]>([]);
  const [bulkResult, setBulkResult] = useState<CalculationResult | null>(null);
  const [vacancyResult, setVacancyResult] = useState<CalculationResult | null>(null);

  // ── Handlers ──
  const handleSelectMaterial = (file: File, material: SemiconductorMaterial) => {
    setActiveFile(file);
    setActiveMaterial(material);
    // Reset dependent state
    setVacancyFile(null);
    setVacancyDesc(null);
    setResults([]);
    setBulkResult(null);
    setVacancyResult(null);
  };

  const handleVacancyGenerated = (file: File, desc: string) => {
    setVacancyFile(file);
    setVacancyDesc(desc);
  };

  const handleSurfaceGenerated = (file: File, desc: string) => {
    // Surface slabs replace the active structure
    setActiveFile(file);
    // Keep material reference but note it's now a surface
    setResults([]);
    setBulkResult(null);
    setVacancyResult(null);
  };

  const handleResults = (newResults: PropertyResult[]) => {
    setResults(newResults);
  };

  // Determine comparison
  const vacancyProp = results.find((r) => r.workflow === "vacancy-formation");
  const showComparison = bulkResult != null && vacancyResult != null;

  return (
    <div className="relative min-h-screen bg-black">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-sm text-zinc-500 transition-colors hover:text-matrix-green"
            >
              ← Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="font-mono text-lg font-bold text-white">
              MACE{" "}
              <span className="text-matrix-green">Semiconductor Discovery</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/calculate"
              className="font-mono text-xs text-zinc-600 transition-colors hover:text-matrix-green"
            >
              Calculator →
            </Link>
            <Cpu className="h-4 w-4 text-matrix-green" />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="relative z-10 mx-auto max-w-screen-2xl p-6">
        {/* Hero / intro */}
        <div className="mb-6 rounded-lg border border-matrix-green/20 bg-matrix-green/5 px-6 py-4">
          <p className="font-mono text-sm text-matrix-green">
            <strong>Semiconductor Materials Discovery</strong> — Explore
            microchip-relevant materials with MACE-MP-0. Load a structure,
            generate defects, compute bulk modulus & vacancy energies, and
            compare results side-by-side.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* ━━ Left Panel — Library + Defects ━━ */}
          <aside className="space-y-6 lg:col-span-5">
            {/* Structure Library */}
            <StructureLibrary
              selectedId={activeMaterial?.id ?? null}
              onSelect={handleSelectMaterial}
            />

            {/* Defect Generator */}
            <DefectGenerator
              structureFile={activeFile}
              material={activeMaterial}
              onVacancyGenerated={handleVacancyGenerated}
              onSurfaceGenerated={handleSurfaceGenerated}
            />

            {/* Confidence Indicator */}
            {activeMaterial && (
              <ConfidenceIndicator
                elements={activeMaterial.elements}
                structureType="bulk"
              />
            )}

            {/* Active structure info */}
            {activeMaterial && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="mb-2 font-mono text-xs font-bold text-zinc-400">
                  ACTIVE STRUCTURE
                </h3>
                <p className="font-mono text-sm font-bold text-white">
                  {activeMaterial.name}
                </p>
                <p className="font-mono text-xs text-zinc-500">
                  {activeMaterial.formula} · {activeMaterial.atomCount} atoms · a
                  = {activeMaterial.latticeA} Å
                </p>
                {vacancyDesc && (
                  <p className="mt-2 font-mono text-[10px] text-red-400">
                    + {vacancyDesc}
                  </p>
                )}
              </div>
            )}
          </aside>

          {/* ━━ Right Panel — Calculator + Results ━━ */}
          <section className="space-y-6 lg:col-span-7">
            {/* Property Calculator */}
            <PropertyCalculator
              structureFile={activeFile}
              material={activeMaterial}
              vacancyFile={vacancyFile}
              onResults={handleResults}
              onBulkResult={setBulkResult}
              onVacancyResult={setVacancyResult}
            />

            {/* Results */}
            {results.length > 0 && (
              <SemiconductorResults
                results={results}
                viewerResult={bulkResult}
              />
            )}

            {/* Comparison View (bulk vs vacancy) */}
            {showComparison && (
              <ComparisonView
                labelA={`${activeMaterial?.name ?? "Bulk"} (perfect)`}
                labelB={`${activeMaterial?.name ?? "Bulk"} (vacancy)`}
                resultA={bulkResult}
                resultB={vacancyResult}
                vacancyFormationEv={vacancyProp?.vacancyFormationEv}
              />
            )}

            {/* Empty state */}
            {results.length === 0 && !activeFile && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/30 p-12">
                <Cpu className="mb-4 h-12 w-12 text-zinc-700" />
                <p className="font-mono text-sm text-zinc-500">
                  Select a material from the library to get started
                </p>
                <p className="mt-1 font-mono text-xs text-zinc-600">
                  Si, GaAs, HfO₂, Cu, W, and more
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
