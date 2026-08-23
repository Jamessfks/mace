"use client";

/**
 * EnergyProfileChart — relative-energy-vs-coordinate plot for coordinate-scan
 * (and the shared shape NEB/IRC are expected to reuse — see
 * types/mace-results-ext.ts).
 *
 * Every field plotted here (`profile.x/y/xLabel/xUnit/yLabel/yUnit`) exists
 * in docs/schemas/sample-scan-ethane.json's `profile` block. The barrier
 * readout prefers `scan.barrierEv/barrierKcalPerMol` when a coordinate-scan
 * block is present (exact values the backend already computed); otherwise it
 * falls back to max(y) - min(y) off the profile itself, converted to
 * kcal/mol with the same 1 eV = 23.060548 kcal/mol constant the backend's
 * own `unitConversions.evToKcalPerMol` reports (see
 * sample-vibrations-water.json), so the two paths never disagree.
 */

import dynamic from "next/dynamic";
import type { EnergyProfile, ScanBlock } from "@/types/mace-results-ext";
import { BASE_LAYOUT, BASE_CONFIG, DATA_COLORS } from "@/components/calculate/charts/chart-config";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/** 1 eV in kcal/mol — matches the backend's own unitConversions.evToKcalPerMol. */
const EV_TO_KCAL_PER_MOL = 23.060548;

interface EnergyProfileChartProps {
  profile: EnergyProfile;
  scan?: ScanBlock;
}

export function EnergyProfileChart({ profile, scan }: EnergyProfileChartProps) {
  const barrierEv = scan?.barrierEv ?? Math.max(...profile.y) - Math.min(...profile.y);
  const barrierKcal = scan?.barrierKcalPerMol ?? barrierEv * EV_TO_KCAL_PER_MOL;

  const maxIdx = scan?.maxIndex ?? profile.y.indexOf(Math.max(...profile.y));
  const minIdx = scan?.minIndex ?? profile.y.indexOf(Math.min(...profile.y));

  const traces: any[] = [
    {
      x: profile.x,
      y: profile.y,
      mode: "lines+markers",
      type: "scatter",
      name: profile.yLabel,
      line: { color: DATA_COLORS.blue, width: 2 },
      marker: { size: 6, color: DATA_COLORS.blue },
    },
    {
      x: [profile.x[maxIdx]],
      y: [profile.y[maxIdx]],
      mode: "markers",
      type: "scatter",
      name: "Barrier",
      marker: { size: 11, color: DATA_COLORS.red, symbol: "diamond" },
    },
  ];

  const layout: Record<string, any> = {
    ...BASE_LAYOUT,
    title: { text: "Energy profile", font: { size: 13, color: "#5C574E" } },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: { text: `${profile.xLabel} (${profile.xUnit})`, font: { size: 11 } },
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: { text: `${profile.yLabel} (${profile.yUnit})`, font: { size: 11 } },
    },
    annotations: [
      {
        x: 0.98,
        y: 0.95,
        xref: "paper",
        yref: "paper",
        text: `Barrier = ${barrierEv.toFixed(4)} eV = ${barrierKcal.toFixed(2)} kcal/mol`,
        showarrow: false,
        font: { family: "Geist Mono, monospace", size: 10, color: "#5C574E" },
        bgcolor: "rgba(255,255,255,0.85)",
        bordercolor: "#D8D2C6",
        borderwidth: 1,
        borderpad: 6,
        align: "right",
      },
    ],
    height: 360,
  };

  return (
    <div className="space-y-3">
      <Plot
        data={traces}
        layout={layout}
        config={BASE_CONFIG}
        useResizeHandler
        style={{ width: "100%", height: "360px" }}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs text-[var(--color-text-secondary)]">
        <span>
          Barrier:{" "}
          <strong className="text-[var(--color-text-primary)]">
            {barrierEv.toFixed(4)} eV
          </strong>{" "}
          = <strong className="text-[var(--color-text-primary)]">{barrierKcal.toFixed(2)} kcal/mol</strong>
        </span>
        {minIdx >= 0 && (
          <span>
            Minimum at {profile.x[minIdx]?.toFixed(2)} {profile.xUnit}
          </span>
        )}
        {maxIdx >= 0 && (
          <span>
            Maximum at {profile.x[maxIdx]?.toFixed(2)} {profile.xUnit}
          </span>
        )}
      </div>
    </div>
  );
}
