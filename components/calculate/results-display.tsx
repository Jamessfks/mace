"use client";

import { Download } from "lucide-react";
import { MoleculeViewer3D } from "./molecule-viewer-3d";
import type { CalculationResult } from "@/types/mace";

interface ResultsDisplayProps {
  result: CalculationResult;
}

export function ResultsDisplay({ result }: ResultsDisplayProps) {
  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mace-results.json";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-lg font-bold text-matrix-green">
          CALCULATION RESULTS
        </h2>
        <button
          onClick={downloadJSON}
          className="flex items-center gap-2 rounded border border-matrix-green/50 bg-matrix-green/10 px-3 py-1.5 font-mono text-xs text-matrix-green transition-colors hover:bg-matrix-green/20"
        >
          <Download className="h-3 w-3" />
          Download JSON
        </button>
      </div>

      {/* Energy & Forces Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PropertyCard
          title="Total Energy"
          value={`${result.energy?.toFixed(6)} eV`}
          subtitle={
            result.symbols
              ? `${(result.energy! / result.symbols.length).toFixed(4)} eV/atom`
              : undefined
          }
        />
        <PropertyCard
          title="Force Magnitude"
          value={
            result.forces
              ? `${Math.sqrt(
                  result.forces.flat().reduce((sum, f) => sum + f * f, 0) /
                    result.forces.length
                ).toFixed(4)} eV/Å`
              : "N/A"
          }
          subtitle={`${result.forces?.length || 0} atoms`}
        />
      </div>

      {/* 3D Molecular Viewer */}
      <MoleculeViewer3D result={result} />

      {/* Forces Table */}
      {result.forces && result.symbols && (
        <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
          <h3 className="mb-3 font-mono text-sm font-bold text-matrix-green">
            ATOMIC FORCES
          </h3>
          <div className="max-h-64 overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-black/90 text-zinc-500">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Element</th>
                  <th className="p-2 text-right">Fx</th>
                  <th className="p-2 text-right">Fy</th>
                  <th className="p-2 text-right">Fz</th>
                  <th className="p-2 text-right">|F|</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {result.forces.map((force, i) => (
                  <tr
                    key={i}
                    className="border-t border-matrix-green/10 hover:bg-matrix-green/5"
                  >
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{result.symbols![i]}</td>
                    <td className="p-2 text-right">{force[0].toFixed(4)}</td>
                    <td className="p-2 text-right">{force[1].toFixed(4)}</td>
                    <td className="p-2 text-right">{force[2].toFixed(4)}</td>
                    <td className="p-2 text-right text-matrix-green">
                      {Math.sqrt(
                        force[0] ** 2 + force[1] ** 2 + force[2] ** 2
                      ).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-4">
      <h3 className="mb-2 font-mono text-xs text-zinc-500">{title}</h3>
      <p className="font-mono text-xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="mt-1 font-mono text-xs text-zinc-600">{subtitle}</p>
      )}
    </div>
  );
}
