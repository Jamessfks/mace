/**
 * Shared Plotly.js configuration for all MACE scientific charts.
 *
 * Styling rules:
 *   - Transparent paper background (integrates with dark card bg)
 *   - Plot background matches --color-bg-secondary (#111827)
 *   - All text uses Geist Mono for scientific data readability
 *   - Grid/axis colors from the design system border tokens
 *   - Data series use the Paul Tol colorblind-safe palette
 */

/** Standard dark-theme layout for all MACE Plotly charts. */
export const BASE_LAYOUT: Record<string, any> = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "#111827",
  font: {
    family: "Geist Mono, ui-monospace, monospace",
    color: "#9BA4B8",
    size: 11,
  },
  xaxis: {
    gridcolor: "#2A3650",
    zerolinecolor: "#3B4F72",
    linecolor: "#2A3650",
    tickfont: { size: 10 },
  },
  yaxis: {
    gridcolor: "#2A3650",
    zerolinecolor: "#3B4F72",
    linecolor: "#2A3650",
    tickfont: { size: 10 },
  },
  margin: { l: 60, r: 20, t: 40, b: 50 },
  showlegend: true,
  legend: {
    bgcolor: "rgba(0,0,0,0)",
    font: { color: "#9BA4B8", size: 10 },
  },
};

/** Plotly modebar config — show export buttons, hide Plotly logo. */
export const BASE_CONFIG: Record<string, any> = {
  displaylogo: false,
  modeBarButtonsToAdd: ["toImage"],
  toImageButtonOptions: {
    format: "svg",
    filename: "mace-chart",
    height: 600,
    width: 800,
  },
  responsive: true,
};

/** Paul Tol colorblind-safe palette for data series. */
export const DATA_COLORS = {
  blue: "#4477AA",
  red: "#EE6677",
  green: "#228833",
  yellow: "#CCBB44",
  cyan: "#66CCEE",
  purple: "#AA3377",
  gray: "#BBBBBB",
} as const;

/** Element-to-color mapping for scatter plots colored by species. */
const ELEMENT_PALETTE = [
  "#4477AA", "#EE6677", "#228833", "#CCBB44",
  "#66CCEE", "#AA3377", "#BBBBBB",
];

export function getElementColor(elementIndex: number): string {
  return ELEMENT_PALETTE[elementIndex % ELEMENT_PALETTE.length];
}
