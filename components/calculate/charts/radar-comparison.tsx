"use client";

/**
 * RadarComparison — Spider/radar chart for multi-metric model comparison.
 *
 * Compares two MACE models (e.g. custom vs. foundation) across multiple
 * accuracy metrics. Each axis represents a metric; each model gets a
 * polygon. Smaller area = better model (lower errors).
 *
 * Axes: Energy MAE, Force MAE, Energy R², Force RMSE, Max Force Error
 *
 * Note: R² is inverted (1 - R²) so that all axes follow the convention
 * where smaller = better, making the radar chart visually consistent.
 */

import dynamic from "next/dynamic";
import { BASE_CONFIG, DATA_COLORS } from "./chart-config";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/** Metrics for one model on the radar chart. */
export interface ModelMetrics {
  label: string;
  energyMAE: number;
  forceMAE: number;
  energyR2: number;
  forceRMSE: number;
  maxForceError: number;
}

interface RadarComparisonProps {
  modelA: ModelMetrics;
  modelB: ModelMetrics;
  title?: string;
}

const AXES = [
  "Energy MAE (meV/atom)",
  "Force MAE (meV/A)",
  "1 - R\u00B2",
  "Force RMSE (meV/A)",
  "Max Force Error (meV/A)",
];

export function RadarComparison({
  modelA,
  modelB,
  title = "Model Comparison",
}: RadarComparisonProps) {
  const toValues = (m: ModelMetrics) => [
    m.energyMAE,
    m.forceMAE,
    (1 - m.energyR2) * 100,
    m.forceRMSE,
    m.maxForceError,
  ];

  const valuesA = toValues(modelA);
  const valuesB = toValues(modelB);

  const traces: any[] = [
    {
      type: "scatterpolar",
      r: [...valuesA, valuesA[0]],
      theta: [...AXES, AXES[0]],
      fill: "toself",
      name: modelA.label,
      fillcolor: "rgba(68,119,170,0.15)",
      line: { color: DATA_COLORS.blue, width: 2 },
      marker: { color: DATA_COLORS.blue, size: 5 },
    },
    {
      type: "scatterpolar",
      r: [...valuesB, valuesB[0]],
      theta: [...AXES, AXES[0]],
      fill: "toself",
      name: modelB.label,
      fillcolor: "rgba(170,51,119,0.15)",
      line: { color: DATA_COLORS.purple, width: 2 },
      marker: { color: DATA_COLORS.purple, size: 5 },
    },
  ];

  const layout: Record<string, any> = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family: "Geist Mono, ui-monospace, monospace",
      color: "#9BA4B8",
      size: 10,
    },
    title: { text: title, font: { size: 13, color: "#E8ECF4" } },
    polar: {
      bgcolor: "#111827",
      radialaxis: {
        visible: true,
        gridcolor: "#2A3650",
        linecolor: "#2A3650",
        tickfont: { size: 9 },
      },
      angularaxis: {
        gridcolor: "#2A3650",
        linecolor: "#2A3650",
        tickfont: { size: 9 },
      },
    },
    showlegend: true,
    legend: {
      bgcolor: "rgba(0,0,0,0)",
      font: { color: "#9BA4B8", size: 10 },
    },
    margin: { l: 40, r: 40, t: 50, b: 40 },
    width: undefined,
    height: 400,
  };

  return (
    <Plot
      data={traces}
      layout={layout}
      config={BASE_CONFIG}
      useResizeHandler
      style={{ width: "100%", height: "400px" }}
    />
  );
}
