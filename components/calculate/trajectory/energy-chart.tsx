"use client";

/**
 * EnergyChart — SVG-based energy-vs-step line chart for MD trajectories.
 *
 * PURPOSE:
 *   Visualize how total energy evolves over MD steps. A materials scientist
 *   uses this to check equilibration, detect instabilities, and verify
 *   energy conservation (NVE) or thermostat behavior (NVT/NPT).
 *
 * FEATURES:
 *   - Smooth SVG path with Matrix-green gradient fill
 *   - Current-frame indicator (vertical line + dot synced with trajectory viewer)
 *   - Hover crosshair showing energy/step at mouse position
 *   - Auto-scaled axes with labeled ticks
 *   - Responsive width (fills container)
 *
 * DESIGN:
 *   Pure SVG — no charting library dependency. This keeps the bundle small
 *   and gives full control over the Matrix theme aesthetic.
 *
 * PROPS:
 *   - energies: number[]        — energy at each MD step (eV)
 *   - steps: number[]           — step indices
 *   - currentFrame: number      — index of currently displayed frame
 *   - onFrameSelect?: (i) => void — callback when user clicks on the chart
 */

import { useRef, useState, useCallback, useMemo } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnergyChartProps {
  /** Energy values per frame (eV). */
  energies: number[];
  /** Step indices (same length as energies). */
  steps: number[];
  /** Currently active frame index (highlighted on chart). */
  currentFrame: number;
  /** Optional callback when user clicks a point on the chart. */
  onFrameSelect?: (frameIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 16, bottom: 32, left: 64 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EnergyChart({
  energies,
  steps,
  currentFrame,
  onFrameSelect,
}: EnergyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);

  // Total number of data points
  const n = energies.length;

  // Compute axis ranges with 5% padding on y-axis
  const { yMin, yMax, xMin, xMax } = useMemo(() => {
    const eMin = Math.min(...energies);
    const eMax = Math.max(...energies);
    const yPad = (eMax - eMin) * 0.05 || 0.001; // avoid zero-range
    return {
      yMin: eMin - yPad,
      yMax: eMax + yPad,
      xMin: steps[0] ?? 0,
      xMax: steps[n - 1] ?? n - 1,
    };
  }, [energies, steps, n]);

  // Map data coords → SVG coords (using container width via viewBox)
  const VIEWBOX_WIDTH = 600;
  const plotW = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (step: number) =>
      PADDING.left + ((step - xMin) / (xMax - xMin || 1)) * plotW,
    [xMin, xMax, plotW]
  );
  const toY = useCallback(
    (energy: number) =>
      PADDING.top + (1 - (energy - yMin) / (yMax - yMin || 1)) * plotH,
    [yMin, yMax, plotH]
  );

  // Build SVG path for the energy line
  const linePath = useMemo(() => {
    if (n === 0) return "";
    return energies
      .map((e, i) => `${i === 0 ? "M" : "L"}${toX(steps[i])},${toY(e)}`)
      .join(" ");
  }, [energies, steps, n, toX, toY]);

  // Gradient fill path (line + close along bottom)
  const fillPath = useMemo(() => {
    if (n === 0) return "";
    const bottomY = PADDING.top + plotH;
    return `${linePath} L${toX(steps[n - 1])},${bottomY} L${toX(steps[0])},${bottomY} Z`;
  }, [linePath, n, steps, toX, plotH]);

  // Y-axis tick values (5 ticks)
  const yTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => yMin + ((yMax - yMin) * i) / (count - 1));
  }, [yMin, yMax]);

  // Handle mouse move for hover crosshair
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || n === 0) return;
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
      // Find nearest data point
      const dataX = xMin + ((svgX - PADDING.left) / plotW) * (xMax - xMin);
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(steps[i] - dataX);
        if (d < minDist) {
          minDist = d;
          closest = i;
        }
      }
      setHover({ x: toX(steps[closest]), idx: closest });
    },
    [n, xMin, xMax, plotW, steps, toX]
  );

  const handleClick = useCallback(() => {
    if (hover && onFrameSelect) onFrameSelect(hover.idx);
  }, [hover, onFrameSelect]);

  // Current frame marker position
  const cfX = n > 0 ? toX(steps[Math.min(currentFrame, n - 1)]) : 0;
  const cfY = n > 0 ? toY(energies[Math.min(currentFrame, n - 1)]) : 0;

  if (n === 0) return null;

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${CHART_HEIGHT}`}
        className="w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        style={{ cursor: onFrameSelect ? "crosshair" : "default" }}
      >
        <defs>
          {/* Gradient fill under the energy line */}
          <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ff41" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00ff41" stopOpacity="0.02" />
          </linearGradient>
          {/* Glow filter for the current-frame dot */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Grid lines ── */}
        {yTicks.map((t) => (
          <line
            key={t}
            x1={PADDING.left}
            y1={toY(t)}
            x2={VIEWBOX_WIDTH - PADDING.right}
            y2={toY(t)}
            stroke="#27272a"
            strokeWidth="0.5"
          />
        ))}

        {/* ── Gradient fill under curve ── */}
        <path d={fillPath} fill="url(#energyFill)" />

        {/* ── Energy line ── */}
        <path
          d={linePath}
          fill="none"
          stroke="#00ff41"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ── Current frame indicator (vertical line + glowing dot) ── */}
        <line
          x1={cfX}
          y1={PADDING.top}
          x2={cfX}
          y2={PADDING.top + plotH}
          stroke="#00ff41"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.5"
        />
        <circle cx={cfX} cy={cfY} r="4" fill="#00ff41" filter="url(#glow)" />

        {/* ── Hover crosshair ── */}
        {hover && (
          <>
            <line
              x1={hover.x}
              y1={PADDING.top}
              x2={hover.x}
              y2={PADDING.top + plotH}
              stroke="#a1a1aa"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
            <circle
              cx={hover.x}
              cy={toY(energies[hover.idx])}
              r="3"
              fill="white"
              stroke="#00ff41"
              strokeWidth="1"
            />
            {/* Hover tooltip */}
            <text
              x={hover.x + 6}
              y={PADDING.top + 10}
              fill="#a1a1aa"
              fontSize="9"
              fontFamily="monospace"
            >
              Step {steps[hover.idx]} · {energies[hover.idx].toFixed(4)} eV
            </text>
          </>
        )}

        {/* ── Y-axis labels ── */}
        {yTicks.map((t) => (
          <text
            key={t}
            x={PADDING.left - 6}
            y={toY(t) + 3}
            fill="#71717a"
            fontSize="8"
            fontFamily="monospace"
            textAnchor="end"
          >
            {t.toFixed(3)}
          </text>
        ))}

        {/* ── X-axis labels (first, middle, last) ── */}
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text
            key={i}
            x={toX(steps[i])}
            y={CHART_HEIGHT - 4}
            fill="#71717a"
            fontSize="8"
            fontFamily="monospace"
            textAnchor="middle"
          >
            {steps[i]}
          </text>
        ))}

        {/* ── Axis labels ── */}
        <text
          x={VIEWBOX_WIDTH / 2}
          y={CHART_HEIGHT - 18}
          fill="#52525b"
          fontSize="8"
          fontFamily="monospace"
          textAnchor="middle"
        >
          MD Step
        </text>
        <text
          x={12}
          y={CHART_HEIGHT / 2}
          fill="#52525b"
          fontSize="8"
          fontFamily="monospace"
          textAnchor="middle"
          transform={`rotate(-90, 12, ${CHART_HEIGHT / 2})`}
        >
          Energy (eV)
        </text>
      </svg>
    </div>
  );
}
