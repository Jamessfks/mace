"use client";

/**
 * TrainingCharts — Scientific graphs for MACE training progress.
 *
 * Renders Loss, MAE Energy (meV/atom), and MAE Force (meV/Å) vs epoch
 * with a high-tech dark theme (matrix-green / cyan accents, gradient fills).
 * Used on the MACE Freeze page during and after training.
 */

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
  ComposedChart,
} from "recharts";

export interface TrainingPoint {
  epoch: number;
  loss: number;
  mae_energy: number;
  mae_force: number;
}

interface TrainingChartsProps {
  data: TrainingPoint[];
  /** Show as compact (e.g. during training) or full size */
  compact?: boolean;
}

const CHART_COLORS = {
  loss: "#22c55e",
  maeEnergy: "#06b6d4",
  maeForce: "#a78bfa",
};

export function TrainingCharts({ data, compact }: TrainingChartsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 font-mono text-sm text-zinc-500">
        No data yet — start training to see live metrics.
      </div>
    );
  }

  const chartHeight = compact ? 200 : 280;

  return (
    <div className="space-y-6">
      {/* Loss vs Epoch */}
      <div className="rounded-lg border border-zinc-800 bg-black/60 p-4">
        <h4 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-matrix-green">
          Training loss
        </h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.loss} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_COLORS.loss} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="epoch"
              type="number"
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickFormatter={(v) => `Epoch ${v}`}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickFormatter={(v) => v.toExponential(1)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: "6px",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
              labelFormatter={(v) => `Epoch ${v}`}
              formatter={(value: number) => [value.toExponential(4), "Loss"]}
            />
            <Area
              type="monotone"
              dataKey="loss"
              stroke={CHART_COLORS.loss}
              strokeWidth={2}
              fill="url(#lossGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* MAE Energy & Force */}
      <div className="rounded-lg border border-zinc-800 bg-black/60 p-4">
        <h4 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
          Validation MAE (meV/atom, meV/Å)
        </h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="epoch"
              type="number"
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickFormatter={(v) => `Epoch ${v}`}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickFormatter={(v) => `${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: "6px",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
              labelFormatter={(v) => `Epoch ${v}`}
              formatter={(value: number, name: string) => [
                typeof value === "number" ? value.toFixed(3) : value,
                name === "mae_energy" ? "MAE E (meV/atom)" : "MAE F (meV/Å)",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(value) =>
                value === "mae_energy" ? "MAE Energy" : "MAE Force"
              }
            />
            <Line
              type="monotone"
              dataKey="mae_energy"
              stroke={CHART_COLORS.maeEnergy}
              strokeWidth={2}
              dot={false}
              name="mae_energy"
            />
            <Line
              type="monotone"
              dataKey="mae_force"
              stroke={CHART_COLORS.maeForce}
              strokeWidth={2}
              dot={false}
              name="mae_force"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
