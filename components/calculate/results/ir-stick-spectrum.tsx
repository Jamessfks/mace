"use client";

/**
 * IrStickSpectrum — stick spectrum over the computed frequencies.
 *
 * CRITICAL HONESTY REQUIREMENT (see CLAUDE.md / task brief):
 * `vibrations.infrared.available` is FALSE for every current MACE model —
 * MACE has no dipole moment output, so IR intensities are null
 * (docs/schemas/sample-vibrations-water.json: infrared.stickSpectrum.intensities
 * is null). This component draws every stick at the SAME height in that case
 * and says so, both as an on-chart annotation and as text below the chart.
 * It must never be mistaken for an intensity plot. If a future model DOES
 * report intensities (`infrared.available === true`), the real values are
 * plotted instead and labeled normally — this is speculative-proofed but not
 * exercised by any current sample.
 */

import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import type { VibrationsBlock } from "@/types/mace-results-ext";
import { BASE_LAYOUT, BASE_CONFIG, DATA_COLORS } from "@/components/calculate/charts/chart-config";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface IrStickSpectrumProps {
  vibrations: VibrationsBlock;
}

export function IrStickSpectrum({ vibrations }: IrStickSpectrumProps) {
  const { infrared } = vibrations;
  const frequencies = infrared.stickSpectrum.frequenciesCm1;
  if (frequencies.length === 0) return null;

  const hasIntensities = infrared.available && infrared.stickSpectrum.intensities != null;
  const heights = hasIntensities
    ? (infrared.stickSpectrum.intensities as number[])
    : frequencies.map(() => 1);

  // Thin bars stand in for sticks — Plotly has no dedicated "stick" trace type.
  const span = Math.max(...frequencies) - Math.min(...frequencies) || 1000;
  const barWidth = Math.max(span * 0.006, 3);

  const traces: any[] = [
    {
      x: frequencies,
      y: heights,
      type: "bar",
      width: frequencies.map(() => barWidth),
      marker: { color: hasIntensities ? DATA_COLORS.blue : DATA_COLORS.gray },
      name: hasIntensities ? "IR intensity" : "Frequency (height not meaningful)",
      hovertemplate: hasIntensities
        ? "%{x:.1f} cm⁻¹<br>%{y:.3g}<extra></extra>"
        : "%{x:.1f} cm⁻¹<extra>intensity unavailable</extra>",
    },
  ];

  const layout: Record<string, any> = {
    ...BASE_LAYOUT,
    title: {
      text: hasIntensities ? "IR stick spectrum" : "Frequencies (intensities unavailable)",
      font: { size: 13, color: "#5C574E" },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: { text: "Wavenumber (cm⁻¹)", font: { size: 11 } },
      autorange: "reversed",
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: {
        text: hasIntensities ? "Intensity" : "(uniform height — not intensity)",
        font: { size: 11 },
      },
      showticklabels: hasIntensities,
      range: [0, 1.15],
    },
    showlegend: false,
    margin: { l: 60, r: 20, t: 70, b: 50 },
    annotations: hasIntensities
      ? []
      : [
          {
            x: 0.5,
            y: 1.1,
            xref: "paper",
            yref: "paper",
            text: "Stick heights are uniform — IR intensities are not available for this model",
            showarrow: false,
            font: { family: "Geist Mono, monospace", size: 10, color: "#B07A1E" },
            bgcolor: "rgba(176,122,30,0.1)",
            bordercolor: "#B07A1E",
            borderwidth: 1,
            borderpad: 5,
          },
        ],
    height: 320,
  };

  return (
    <div className="space-y-2">
      <Plot
        data={traces}
        layout={layout}
        config={BASE_CONFIG}
        useResizeHandler
        style={{ width: "100%", height: "320px" }}
      />
      {!hasIntensities && (
        <div className="flex items-start gap-2 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-xs leading-relaxed text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Intensities unavailable, not zero.</strong> Every stick is
            drawn at the same height only to mark where a vibrational
            frequency falls — the height carries no physical meaning and must
            not be read as IR intensity.
            {infrared.reason && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] underline-offset-2 hover:underline">
                  Why aren&apos;t intensities available?
                </summary>
                <p className="mt-1.5 font-mono text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {infrared.reason}
                </p>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
