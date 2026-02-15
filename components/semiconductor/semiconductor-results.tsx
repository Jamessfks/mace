"use client";

/**
 * SemiconductorResults — Card-based results display with reference comparison.
 *
 * Follows the same visual pattern as components/calculate/results-display.tsx
 * but adds:
 *   - Reference comparison table (calculated vs DFT/experiment with % error)
 *   - Semiconductor context blurbs (why this property matters for chip fab)
 *   - EOS chart (energy vs volume) when available
 */

import { useState } from "react";
import { Zap, ArrowRightLeft, Gauge, Target, Download } from "lucide-react";
import { MoleculeViewer3D } from "@/components/calculate/molecule-viewer-3d";
import {
  REFERENCE_DATA,
  PROPERTY_CONTEXT,
} from "@/lib/semiconductor-constants";
import type { PropertyResult } from "@/types/semiconductor";
import type { CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SemiconductorResultsProps {
  results: PropertyResult[];
  /** The primary single-point or geometry-opt result for viewer */
  viewerResult: CalculationResult | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SemiconductorResults({
  results,
  viewerResult,
}: SemiconductorResultsProps) {
  if (results.length === 0) return null;

  // Extract specific workflow results
  const singlePoint = results.find((r) => r.workflow === "single-point");
  const geomOpt = results.find((r) => r.workflow === "geometry-opt");
  const eos = results.find((r) => r.workflow === "eos");
  const vacancy = results.find((r) => r.workflow === "vacancy-formation");

  const materialId = results[0]?.materialId;
  const reference = materialId ? REFERENCE_DATA[materialId] : undefined;

  const primaryResult = viewerResult ?? singlePoint?.result ?? geomOpt?.result;

  const atomCount = primaryResult?.symbols?.length ?? 0;
  const ePerAtom =
    primaryResult?.energy != null && atomCount > 0
      ? (primaryResult.energy / atomCount).toFixed(4)
      : "N/A";

  const rmsForce =
    primaryResult?.forces && primaryResult.forces.length > 0
      ? Math.sqrt(
          primaryResult.forces.flat().reduce((s, f) => s + f * f, 0) /
            primaryResult.forces.length
        )
      : null;

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "semiconductor-results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ═══ Status Banner ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-matrix-green/20 bg-matrix-green/5 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-matrix-green animate-glow-pulse" />
          <span className="font-mono text-sm font-bold text-matrix-green">
            Semiconductor Analysis Complete
          </span>
          <span className="font-mono text-xs text-zinc-500">
            {results.length} workflow{results.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={downloadJSON}
          className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-matrix-green/50 hover:text-matrix-green"
        >
          <Download className="h-3 w-3" />
          JSON
        </button>
      </div>

      {/* ═══ Property Cards ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Energy */}
        {primaryResult?.energy != null && (
          <PropertyCard
            title="Total Energy"
            value={`${primaryResult.energy.toFixed(6)} eV`}
            subtitle={`${ePerAtom} eV/atom`}
            context={PROPERTY_CONTEXT.energy}
            accentBorder="border-l-emerald-500"
            icon={<Zap className="h-4 w-4 text-emerald-400" />}
          />
        )}

        {/* Forces */}
        {rmsForce != null && (
          <PropertyCard
            title="RMS Force"
            value={`${rmsForce.toFixed(4)} eV/Å`}
            subtitle={`${atomCount} atoms`}
            context={PROPERTY_CONTEXT.forces}
            accentBorder="border-l-blue-500"
            icon={<ArrowRightLeft className="h-4 w-4 text-blue-400" />}
          />
        )}

        {/* Bulk modulus */}
        {eos?.bulkModulusGPa != null && (
          <PropertyCard
            title="Bulk Modulus"
            value={`${eos.bulkModulusGPa.toFixed(1)} GPa`}
            subtitle={
              reference?.B != null
                ? `Ref: ${reference.B} GPa (${pctError(
                    eos.bulkModulusGPa,
                    reference.B
                  )}% error)`
                : "No reference available"
            }
            context={PROPERTY_CONTEXT.bulkModulus}
            accentBorder="border-l-purple-500"
            icon={<Gauge className="h-4 w-4 text-purple-400" />}
          />
        )}

        {/* Vacancy formation energy */}
        {vacancy?.vacancyFormationEv != null && (
          <PropertyCard
            title="Vacancy Formation Energy"
            value={`${vacancy.vacancyFormationEv.toFixed(3)} eV`}
            subtitle={
              reference?.E_vac != null
                ? `Ref: ${reference.E_vac} eV (${pctError(
                    vacancy.vacancyFormationEv,
                    reference.E_vac
                  )}% error)`
                : "No reference available"
            }
            context={PROPERTY_CONTEXT.vacancyFormation}
            accentBorder="border-l-amber-500"
            icon={<Target className="h-4 w-4 text-amber-400" />}
          />
        )}
      </div>

      {/* ═══ EOS Chart ═══ */}
      {eos?.eosData && eos.eosData.volumes.length > 0 && (
        <div className="result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 border-l-purple-500 bg-zinc-900/50 p-5">
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-purple-400">
            Equation of State (E vs V)
          </h3>
          <EOSChart volumes={eos.eosData.volumes} energies={eos.eosData.energies} />
        </div>
      )}

      {/* ═══ Reference Comparison Table ═══ */}
      {reference && (
        <div className="result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 border-l-cyan-500 bg-zinc-900/50 p-5">
          <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
            Reference Comparison
          </h3>
          <div className="overflow-auto rounded border border-zinc-800">
            <table className="w-full font-mono text-xs">
              <thead className="bg-zinc-900 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Property</th>
                  <th className="px-3 py-2 text-right">Calculated</th>
                  <th className="px-3 py-2 text-right">Reference</th>
                  <th className="px-3 py-2 text-right">Error</th>
                  <th className="px-3 py-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {reference.B != null && eos?.bulkModulusGPa != null && (
                  <RefRow
                    label="Bulk Modulus (GPa)"
                    calc={eos.bulkModulusGPa.toFixed(1)}
                    ref_={reference.B.toFixed(1)}
                    error={pctError(eos.bulkModulusGPa, reference.B)}
                    source={reference.source}
                  />
                )}
                {reference.E_vac != null &&
                  vacancy?.vacancyFormationEv != null && (
                    <RefRow
                      label="E_vac (eV)"
                      calc={vacancy.vacancyFormationEv.toFixed(3)}
                      ref_={reference.E_vac.toFixed(3)}
                      error={pctError(
                        vacancy.vacancyFormationEv,
                        reference.E_vac
                      )}
                      source={reference.source}
                    />
                  )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            Reference values from: {reference.source}
          </p>
        </div>
      )}

      {/* ═══ 3D Viewer ═══ */}
      {primaryResult &&
        primaryResult.symbols &&
        primaryResult.positions && (
          <div className="result-card animate-stagger overflow-hidden rounded-lg border border-zinc-800 border-l-4 border-l-violet-500 bg-black/80">
            <MoleculeViewer3D result={primaryResult} />
          </div>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PropertyCard({
  title,
  value,
  subtitle,
  context,
  accentBorder,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  context?: string;
  accentBorder: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`result-card animate-stagger rounded-lg border border-zinc-800 border-l-4 ${accentBorder} bg-zinc-900/50 p-4`}
    >
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
          {title}
        </h3>
      </div>
      <p className="font-mono text-xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="mt-1 font-mono text-xs text-zinc-500">{subtitle}</p>
      )}
      {context && (
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600 border-t border-zinc-800 pt-2">
          {context}
        </p>
      )}
    </div>
  );
}

function RefRow({
  label,
  calc,
  ref_,
  error,
  source,
}: {
  label: string;
  calc: string;
  ref_: string;
  error: string;
  source: string;
}) {
  const errorNum = parseFloat(error);
  const errorColor =
    errorNum < 5
      ? "text-emerald-400"
      : errorNum < 15
        ? "text-amber-400"
        : "text-red-400";

  return (
    <tr className="border-t border-zinc-800/60">
      <td className="px-3 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right font-bold tabular-nums">{calc}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
        {ref_}
      </td>
      <td className={`px-3 py-1.5 text-right font-bold ${errorColor}`}>
        {error}%
      </td>
      <td className="px-3 py-1.5 text-zinc-600">{source}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Interactive EOS Chart (SVG) with hover tooltips + data table
// ---------------------------------------------------------------------------

function EOSChart({
  volumes,
  energies,
}: {
  volumes: number[];
  energies: number[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const W = 500;
  const H = 220;
  const PAD = { top: 16, right: 24, bottom: 36, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const vMin = Math.min(...volumes);
  const vMax = Math.max(...volumes);
  const eMin = Math.min(...energies);
  const eMax = Math.max(...energies);
  const ePad = (eMax - eMin) * 0.15 || 0.001;

  const scaleX = (v: number) =>
    PAD.left + ((v - vMin) / (vMax - vMin || 1)) * plotW;
  const scaleY = (e: number) =>
    PAD.top + plotH - ((e - (eMin - ePad)) / (eMax - eMin + 2 * ePad)) * plotH;

  // Sort by volume for line
  const sorted = volumes
    .map((v, i) => ({ v, e: energies[i], idx: i }))
    .sort((a, b) => a.v - b.v);

  const pathD = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.v)},${scaleY(p.e)}`)
    .join(" ");

  // Find the minimum energy point
  const minEIdx = sorted.reduce(
    (min, p, i) => (p.e < sorted[min].e ? i : min),
    0
  );

  return (
    <div className="space-y-3">
      {/* ── SVG Chart ── */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={`hg-${frac}`}
            x1={PAD.left}
            y1={PAD.top + plotH * frac}
            x2={PAD.left + plotW}
            y2={PAD.top + plotH * frac}
            stroke="#27272a"
            strokeWidth={0.5}
            strokeDasharray="4 4"
          />
        ))}

        {/* Axes */}
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={PAD.left + plotW}
          y2={PAD.top + plotH}
          stroke="#3f3f46"
          strokeWidth={1}
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + plotH}
          stroke="#3f3f46"
          strokeWidth={1}
        />

        {/* X axis tick labels */}
        {sorted.map((p, i) => (
          <text
            key={`xt-${i}`}
            x={scaleX(p.v)}
            y={PAD.top + plotH + 14}
            textAnchor="middle"
            className="fill-zinc-600 font-mono"
            fontSize={8}
          >
            {p.v.toFixed(1)}
          </text>
        ))}

        {/* X axis label */}
        <text
          x={PAD.left + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          className="fill-zinc-500 font-mono"
          fontSize={10}
        >
          Volume (Å³)
        </text>

        {/* Y axis label */}
        <text
          x={12}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          className="fill-zinc-500 font-mono"
          fontSize={10}
          transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
        >
          Energy (eV)
        </text>

        {/* Line */}
        <path d={pathD} fill="none" stroke="#00ff41" strokeWidth={2} />

        {/* Hover crosshairs */}
        {hoveredIdx != null && (
          <>
            <line
              x1={scaleX(sorted[hoveredIdx].v)}
              y1={PAD.top}
              x2={scaleX(sorted[hoveredIdx].v)}
              y2={PAD.top + plotH}
              stroke="#00ff41"
              strokeWidth={0.5}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            <line
              x1={PAD.left}
              y1={scaleY(sorted[hoveredIdx].e)}
              x2={PAD.left + plotW}
              y2={scaleY(sorted[hoveredIdx].e)}
              stroke="#00ff41"
              strokeWidth={0.5}
              strokeDasharray="3 3"
              opacity={0.5}
            />
          </>
        )}

        {/* Points */}
        {sorted.map((p, i) => (
          <g key={i}>
            {/* Invisible larger hit target */}
            <circle
              cx={scaleX(p.v)}
              cy={scaleY(p.e)}
              r={14}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "crosshair" }}
            />
            {/* Visible point */}
            <circle
              cx={scaleX(p.v)}
              cy={scaleY(p.e)}
              r={hoveredIdx === i ? 6 : i === minEIdx ? 5 : 4}
              fill={i === minEIdx ? "#fbbf24" : "#00ff41"}
              stroke={hoveredIdx === i ? "#fff" : "#000"}
              strokeWidth={hoveredIdx === i ? 2 : 1}
              style={{ transition: "r 0.15s, stroke 0.15s" }}
              pointerEvents="none"
            />
          </g>
        ))}

        {/* Hover tooltip */}
        {hoveredIdx != null && (() => {
          const p = sorted[hoveredIdx];
          const tx = scaleX(p.v);
          const ty = scaleY(p.e);
          // Flip tooltip left if too close to right edge
          const flipX = tx > PAD.left + plotW * 0.7;
          const tooltipX = flipX ? tx - 8 : tx + 8;
          const anchor = flipX ? "end" : "start";
          return (
            <g>
              <rect
                x={flipX ? tooltipX - 140 : tooltipX - 4}
                y={ty - 30}
                width={144}
                height={36}
                rx={4}
                fill="#18181b"
                stroke="#3f3f46"
                strokeWidth={1}
                opacity={0.95}
              />
              <text
                x={tooltipX}
                y={ty - 16}
                textAnchor={anchor}
                className="font-mono"
                fontSize={9}
                fill="#a1a1aa"
              >
                V = {p.v.toFixed(3)} ų
              </text>
              <text
                x={tooltipX}
                y={ty - 4}
                textAnchor={anchor}
                className="font-mono"
                fontSize={9}
                fill="#00ff41"
                fontWeight="bold"
              >
                E = {p.e.toFixed(6)} eV
              </text>
            </g>
          );
        })()}

        {/* Min energy label */}
        <text
          x={scaleX(sorted[minEIdx].v)}
          y={scaleY(sorted[minEIdx].e) - 10}
          textAnchor="middle"
          className="font-mono"
          fontSize={8}
          fill="#fbbf24"
        >
          E₀
        </text>
      </svg>

      {/* ── Data Table ── */}
      <div className="overflow-auto rounded border border-zinc-800">
        <table className="w-full font-mono text-xs">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <th className="px-3 py-1.5 text-left">#</th>
              <th className="px-3 py-1.5 text-right">Volume (ų)</th>
              <th className="px-3 py-1.5 text-right">Energy (eV)</th>
              <th className="px-3 py-1.5 text-right">ΔE from min (meV)</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {sorted.map((p, i) => {
              const isMin = i === minEIdx;
              const deltaE = (p.e - sorted[minEIdx].e) * 1000; // meV
              return (
                <tr
                  key={i}
                  className={`border-t border-zinc-800/60 transition-colors ${
                    hoveredIdx === i
                      ? "bg-matrix-green/10"
                      : isMin
                        ? "bg-amber-500/5"
                        : "hover:bg-zinc-800/40"
                  }`}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: "crosshair" }}
                >
                  <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {p.v.toFixed(3)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                      isMin ? "text-amber-400" : ""
                    }`}
                  >
                    {p.e.toFixed(6)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      isMin ? "text-amber-400 font-bold" : "text-zinc-500"
                    }`}
                  >
                    {isMin ? "← min" : `+${deltaE.toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctError(calc: number, ref: number): string {
  if (ref === 0) return "N/A";
  return Math.abs(((calc - ref) / ref) * 100).toFixed(1);
}
