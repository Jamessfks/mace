"use client";

/**
 * DefectGenerator — Tabs for creating vacancy or surface slab from loaded structure.
 *
 * Vacancy: Parses current structure, shows atom table, lets user click to
 * select an atom for removal, builds new XYZ with that atom removed.
 *
 * Surface slab: Inputs for Miller indices + thicknesses, calls
 * /api/generate-surface backend to build slab with ASE.
 */

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Scissors, Layers } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { parseStructureFile, type ParsedStructure } from "@/lib/parse-structure";
import { buildVacancyXYZ } from "@/lib/semiconductor-properties";
import type { SemiconductorMaterial } from "@/types/semiconductor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DefectGeneratorProps {
  /** Currently loaded structure file */
  structureFile: File | null;
  /** Currently loaded material (for reading xyzData directly) */
  material: SemiconductorMaterial | null;
  /** Callback when a vacancy structure is generated */
  onVacancyGenerated: (file: File, description: string) => void;
  /** Callback when a surface slab is generated */
  onSurfaceGenerated: (file: File, description: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DefectGenerator({
  structureFile,
  material,
  onVacancyGenerated,
  onSurfaceGenerated,
}: DefectGeneratorProps) {
  const [parsed, setParsed] = useState<ParsedStructure | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedAtom, setSelectedAtom] = useState<number | null>(null);
  const [vacancyMessage, setVacancyMessage] = useState<string | null>(null);

  // Surface slab state
  const [millerH, setMillerH] = useState(1);
  const [millerK, setMillerK] = useState(0);
  const [millerL, setMillerL] = useState(0);
  const [slabThickness, setSlabThickness] = useState(12);
  const [vacuumThickness, setVacuumThickness] = useState(15);
  const [surfaceLoading, setSurfaceLoading] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);

  // Parse structure when file changes
  useEffect(() => {
    if (!structureFile) {
      setParsed(null);
      setParseError(null);
      setSelectedAtom(null);
      setVacancyMessage(null);
      return;
    }

    parseStructureFile(structureFile)
      .then((result) => {
        if (result.atomCount === 0) {
          setParseError("No atoms found in the structure.");
        } else {
          setParsed(result);
          setParseError(null);
        }
      })
      .catch(() => setParseError("Failed to parse structure file."));
  }, [structureFile]);

  // Generate vacancy structure
  const handleGenerateVacancy = useCallback(() => {
    if (selectedAtom === null || !material) return;

    const vacancyXYZ = buildVacancyXYZ(material.xyzData, selectedAtom);
    if (!vacancyXYZ) {
      setVacancyMessage("Error: Could not generate vacancy structure.");
      return;
    }

    const element = parsed?.symbols[selectedAtom] ?? "?";
    const desc = `Vacancy in ${material.name}: removed ${element} at site ${selectedAtom}`;
    const blob = new Blob([vacancyXYZ], { type: "chemical/x-xyz" });
    const file = new File([blob], `${material.id}-vacancy.xyz`, {
      type: "chemical/x-xyz",
    });

    setVacancyMessage(desc);
    onVacancyGenerated(file, desc);
  }, [selectedAtom, material, parsed, onVacancyGenerated]);

  // Generate surface slab
  const handleGenerateSurface = useCallback(async () => {
    if (!material) return;

    setSurfaceLoading(true);
    setSurfaceError(null);

    try {
      const response = await fetch("/api/generate-surface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xyzData: material.xyzData,
          materialId: material.id,
          h: millerH,
          k: millerK,
          l: millerL,
          slabThickness,
          vacuumThickness,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Surface generation failed");
      }

      const data = await response.json();
      const desc = `${material.name} (${millerH}${millerK}${millerL}) surface slab`;
      const blob = new Blob([data.xyzData], { type: "chemical/x-xyz" });
      const file = new File([blob], `${material.id}-surface-${millerH}${millerK}${millerL}.xyz`, {
        type: "chemical/x-xyz",
      });

      onSurfaceGenerated(file, desc);
    } catch (err) {
      setSurfaceError(
        err instanceof Error ? err.message : "Surface generation failed"
      );
    } finally {
      setSurfaceLoading(false);
    }
  }, [material, millerH, millerK, millerL, slabThickness, vacuumThickness, onSurfaceGenerated]);

  // ── No structure loaded ──
  if (!structureFile || !material) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 font-mono text-sm font-bold text-zinc-400">
          DEFECT GENERATOR
        </h2>
        <p className="font-mono text-xs text-zinc-600">
          Load a structure from the library first.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
      <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
        DEFECT GENERATOR
      </h2>

      {parseError && (
        <div className="mb-4 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/5 p-3">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="font-mono text-xs text-red-400">{parseError}</span>
        </div>
      )}

      <Tabs defaultValue="vacancy">
        <TabsList className="mb-4 bg-zinc-800/80">
          <TabsTrigger value="vacancy" className="font-mono text-xs">
            <Scissors className="mr-1.5 h-3 w-3" />
            Vacancy
          </TabsTrigger>
          <TabsTrigger value="surface" className="font-mono text-xs">
            <Layers className="mr-1.5 h-3 w-3" />
            Surface Slab
          </TabsTrigger>
        </TabsList>

        {/* ═══ Vacancy Tab ═══ */}
        <TabsContent value="vacancy">
          {parsed && (
            <div className="space-y-3">
              <p className="font-mono text-[10px] text-zinc-500">
                Click an atom row to select it for removal.
              </p>

              {/* Atom table */}
              <div className="max-h-48 overflow-auto rounded border border-zinc-800">
                <table className="w-full font-mono text-xs">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">Elem</th>
                      <th className="px-2 py-1.5 text-right">x</th>
                      <th className="px-2 py-1.5 text-right">y</th>
                      <th className="px-2 py-1.5 text-right">z</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {parsed.symbols.map((sym, i) => (
                      <tr
                        key={i}
                        onClick={() => setSelectedAtom(i)}
                        className={`cursor-pointer border-t border-zinc-800/60 transition-colors hover:bg-zinc-800/40 ${
                          selectedAtom === i
                            ? "bg-red-500/10 text-red-300"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-1 text-zinc-500">{i}</td>
                        <td className="px-2 py-1 font-bold">{sym}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {parsed.positions[i][0].toFixed(3)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {parsed.positions[i][1].toFixed(3)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {parsed.positions[i][2].toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerateVacancy}
                disabled={selectedAtom === null}
                className="w-full rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 font-mono text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {selectedAtom !== null
                  ? `Remove ${parsed.symbols[selectedAtom]} at site ${selectedAtom}`
                  : "Select an atom to remove"}
              </button>

              {vacancyMessage && (
                <p className="font-mono text-[10px] text-matrix-green">
                  ✓ {vacancyMessage}
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══ Surface Slab Tab ═══ */}
        <TabsContent value="surface">
          <div className="space-y-4">
            {/* Miller indices */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] text-zinc-500">
                Miller Indices (h k l)
              </label>
              <div className="flex gap-2">
                {[
                  { val: millerH, set: setMillerH, label: "h" },
                  { val: millerK, set: setMillerK, label: "k" },
                  { val: millerL, set: setMillerL, label: "l" },
                ].map(({ val, set, label }) => (
                  <div key={label} className="flex-1">
                    <input
                      type="number"
                      value={val}
                      onChange={(e) => set(parseInt(e.target.value) || 0)}
                      min={0}
                      max={3}
                      className="no-spinner w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-center font-mono text-xs text-zinc-300 focus:border-matrix-green/50 focus:outline-none"
                    />
                    <p className="mt-0.5 text-center font-mono text-[9px] text-zinc-600">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Slab thickness */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="font-mono text-[10px] text-zinc-500">
                  Slab Thickness
                </label>
                <span className="font-mono text-[10px] text-zinc-400">
                  {slabThickness} Å
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={30}
                value={slabThickness}
                onChange={(e) => setSlabThickness(Number(e.target.value))}
                className="w-full accent-matrix-green"
              />
            </div>

            {/* Vacuum thickness */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="font-mono text-[10px] text-zinc-500">
                  Vacuum Thickness
                </label>
                <span className="font-mono text-[10px] text-zinc-400">
                  {vacuumThickness} Å
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={25}
                value={vacuumThickness}
                onChange={(e) => setVacuumThickness(Number(e.target.value))}
                className="w-full accent-matrix-green"
              />
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerateSurface}
              disabled={surfaceLoading || (millerH === 0 && millerK === 0 && millerL === 0)}
              className="w-full rounded-md border border-matrix-green/50 bg-matrix-green/10 px-4 py-2 font-mono text-xs font-bold text-matrix-green transition-all hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {surfaceLoading
                ? "Generating surface…"
                : `Generate (${millerH}${millerK}${millerL}) Surface Slab`}
            </button>

            {surfaceError && (
              <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/5 p-2">
                <AlertCircle className="h-3 w-3 text-red-500" />
                <span className="font-mono text-[10px] text-red-400">
                  {surfaceError}
                </span>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
