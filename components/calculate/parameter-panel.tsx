"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import type { CalculationParams } from "@/types/mace";

interface ParameterPanelProps {
  params: CalculationParams;
  onChange: (params: CalculationParams) => void;
}

export function ParameterPanel({ params, onChange }: ParameterPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateParam = <K extends keyof CalculationParams>(
    key: K,
    value: CalculationParams[K]
  ) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className="sticky top-6 space-y-4">
      {/* Model Selection */}
      <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
        <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
          MODEL SELECTION
        </h2>

        <div className="space-y-4">
          <ParamSelect
            label="Model Size"
            value={params.modelSize}
            onChange={(v) => updateParam("modelSize", v as any)}
            options={[
              { value: "small", label: "Small (fast)" },
              { value: "medium", label: "Medium (balanced)" },
              { value: "large", label: "Large (accurate)" },
            ]}
            tooltip="Model size affects accuracy and speed"
          />

          <ParamSelect
            label="Model Type"
            value={params.modelType}
            onChange={(v) => updateParam("modelType", v as any)}
            options={[
              { value: "MACE-MP-0", label: "MACE-MP-0 (materials, 89 elements)" },
              { value: "MACE-OFF", label: "MACE-OFF (organic molecules, ethanol, H2O)" },
            ]}
            tooltip="MACE-MP: bulk crystals. MACE-OFF: organic molecules."
          />

          <ParamSelect
            label="Precision"
            value={params.precision}
            onChange={(v) => updateParam("precision", v as any)}
            options={[
              { value: "float32", label: "float32 (faster)" },
              { value: "float64", label: "float64 (precise)" },
            ]}
          />

          <ParamSelect
            label="Device"
            value={params.device}
            onChange={(v) => updateParam("device", v as any)}
            options={[
              { value: "cpu", label: "CPU" },
              { value: "cuda", label: "CUDA (GPU)" },
            ]}
          />
        </div>
      </div>

      {/* Calculation Type */}
      <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
        <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
          CALCULATION TYPE
        </h2>

        <div className="space-y-2">
          {[
            { value: "single-point", label: "Single Point Energy" },
            { value: "geometry-opt", label: "Geometry Optimization" },
            { value: "molecular-dynamics", label: "Molecular Dynamics" },
            { value: "phonon", label: "Phonon Spectrum" },
          ].map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-3 rounded p-2 transition-colors hover:bg-matrix-green/5"
            >
              <input
                type="radio"
                name="calculationType"
                value={opt.value}
                checked={params.calculationType === opt.value}
                onChange={(e) =>
                  updateParam("calculationType", e.target.value as any)
                }
                className="accent-matrix-green"
              />
              <span className="font-mono text-xs text-zinc-300">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Physical Parameters */}
      <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
        <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
          PHYSICAL PARAMETERS
        </h2>

        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={params.dispersion}
              onChange={(e) => updateParam("dispersion", e.target.checked)}
              className="accent-matrix-green"
            />
            <span className="font-mono text-xs text-zinc-300">
              Enable D3 Dispersion
            </span>
          </label>

          <ParamSelect
            label="MD Ensemble"
            value={params.mdEnsemble ?? "NVT"}
            onChange={(v) => updateParam("mdEnsemble", v as "NVE" | "NVT" | "NPT")}
            options={[
              { value: "NVE", label: "NVE (microcanonical)" },
              { value: "NVT", label: "NVT (canonical)" },
              { value: "NPT", label: "NPT (isothermal-isobaric)" },
            ]}
            tooltip="Thermodynamic ensemble for MD"
          />

          <ParamInput
            label="Temperature (K)"
            value={params.temperature ?? 300}
            onChange={(v) => updateParam("temperature", v)}
            min={0}
            max={5000}
          />

          <ParamInput
            label="Pressure (GPa)"
            value={params.pressure ?? 0}
            onChange={(v) => updateParam("pressure", v)}
            min={0}
            max={1000}
          />

          <ParamInput
            label="Time Step (fs)"
            value={params.timeStep ?? 1.0}
            onChange={(v) => updateParam("timeStep", v)}
            min={0.1}
            max={10}
            step={0.1}
          />

          <ParamInput
            label="Langevin Friction"
            value={params.friction ?? 0.005}
            onChange={(v) => updateParam("friction", v)}
            min={0.0001}
            max={0.1}
            step={0.001}
          />
          <span className="-mt-2 block font-mono text-[10px] text-zinc-600">
            Thermostat coupling for NVT (ASE default 5e-3)
          </span>

          <ParamInput
            label="MD Steps"
            value={params.mdSteps ?? 100}
            onChange={(v) => updateParam("mdSteps", v)}
            min={1}
            max={100000}
          />

          <ParamInput
            label="Force Threshold (eV/Å)"
            value={params.forceThreshold ?? 0.05}
            onChange={(v) => updateParam("forceThreshold", v)}
            min={0.001}
            max={1}
            step={0.01}
          />
          <span className="-mt-2 block font-mono text-[10px] text-zinc-600">
            fmax for geometry optimization
          </span>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between font-mono text-sm font-bold text-matrix-green"
        >
          ADVANCED OPTIONS
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <ParamInput
              label="Cutoff Radius (Å)"
              value={params.cutoffRadius ?? 5.0}
              onChange={(v) => updateParam("cutoffRadius", v)}
              min={3}
              max={10}
              step={0.5}
            />
            <ParamInput
              label="Max Opt Steps"
              value={params.maxOptSteps ?? 500}
              onChange={(v) => updateParam("maxOptSteps", v)}
              min={10}
              max={5000}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components
function ParamSelect({
  label,
  value,
  onChange,
  options,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  tooltip?: string;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 font-mono text-xs text-zinc-500">
        {label}
        {tooltip && (
          <span className="group relative">
            <Info className="h-3 w-3 text-matrix-green/60" />
            <span className="pointer-events-none absolute left-6 top-0 w-48 rounded bg-matrix-green/90 px-2 py-1 text-xs text-black opacity-0 transition-opacity group-hover:opacity-100">
              {tooltip}
            </span>
          </span>
        )}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-matrix-green/30 bg-black/50 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-matrix-green focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ParamInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [localValue, setLocalValue] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Sync from parent when not focused (e.g. external reset)
  const displayValue = isFocused ? localValue : String(value);

  return (
    <div>
      <label className="mb-2 block font-mono text-xs text-zinc-500">
        {label}
      </label>
      <input
        type="number"
        value={displayValue}
        onFocus={() => {
          setLocalValue(String(value));
          setIsFocused(true);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalValue(raw);
          const parsed = parseFloat(raw);
          if (!isNaN(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          // If left empty or invalid, restore previous valid value
          const parsed = parseFloat(localValue);
          if (isNaN(parsed)) {
            setLocalValue(String(value));
          } else {
            onChange(parsed);
          }
        }}
        min={min}
        max={max}
        step={step || 1}
        className="no-spinner w-full rounded border border-matrix-green/30 bg-black/50 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-matrix-green focus:outline-none"
      />
    </div>
  );
}
