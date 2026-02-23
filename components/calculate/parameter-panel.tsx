"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Info, Upload, X, FileText, Info as InfoIcon } from "lucide-react";
import type { CalculationParams } from "@/types/mace";

interface ParameterPanelProps {
  params: CalculationParams;
  onChange: (params: CalculationParams) => void;
  customModelFile: File | null;
  onCustomModelChange: (file: File | null) => void;
}

export function ParameterPanel({ params, onChange, customModelFile, onCustomModelChange }: ParameterPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateParam = <K extends keyof CalculationParams>(
    key: K,
    value: CalculationParams[K]
  ) => {
    onChange({ ...params, [key]: value });
  };

  useEffect(() => {
    if (params.modelType !== "custom") {
      onCustomModelChange(null);
    }
  }, [params.modelType]);

  return (
    <div className="sticky top-6 space-y-4">
      {/* Model Selection */}
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6">
        <h2 className="mb-4 font-sans text-sm font-bold text-[var(--color-accent-primary)]">
          MODEL SELECTION
        </h2>

        <div className="space-y-4">
          <ParamSelect
            label="Model Type"
            value={params.modelType}
            onChange={(v) => updateParam("modelType", v as any)}
            options={[
              { value: "MACE-MP-0", label: "MACE-MP-0 (materials, 89 elements)" },
              { value: "MACE-OFF", label: "MACE-OFF (organic molecules, ethanol, H2O)" },
              { value: "custom", label: "Custom Model (upload .model file)" },
            ]}
            tooltip="MACE-MP: bulk crystals. MACE-OFF: organic molecules. Custom: upload your own."
          />

          {params.modelType === "custom" && (
            <div className="space-y-3 rounded border border-[var(--color-accent-secondary)]/30 bg-[var(--color-accent-secondary)]/5 p-3">
              <div className="flex items-start gap-2 text-xs text-[var(--color-accent-secondary)]">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Upload a MACE-compatible .model file. This can be a fine-tuned model trained with <code className="font-mono">mace_run_train</code> or any MACE architecture checkpoint.</span>
              </div>

              {!customModelFile ? (
                <div className="relative cursor-pointer rounded border-2 border-dashed border-[var(--color-border-emphasis)] bg-[var(--color-bg-primary)]/50 p-4 text-center transition-colors hover:border-[var(--color-accent-primary)]/50 hover:bg-[var(--color-accent-primary)]/5">
                  <input
                    type="file"
                    accept=".model"
                    onChange={(e) => {
                      if (e.target.files?.[0]) onCustomModelChange(e.target.files[0]);
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <Upload className="mx-auto mb-1 h-6 w-6 text-[var(--color-text-muted)]" />
                  <p className="font-mono text-xs text-[var(--color-text-secondary)]">Drop .model file or click to browse</p>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/50 p-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[var(--color-accent-primary)]" />
                    <div>
                      <p className="font-mono text-xs text-[var(--color-text-primary)]">{customModelFile.name}</p>
                      <p className="font-mono text-[10px] text-[var(--color-text-muted)]">{(customModelFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  </div>
                  <button onClick={() => onCustomModelChange(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-error)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div>
                <label className="mb-1 block font-mono text-xs text-[var(--color-text-muted)]">Model Label</label>
                <input
                  type="text"
                  value={params.customModelName ?? ""}
                  onChange={(e) => updateParam("customModelName", e.target.value)}
                  placeholder="e.g. My Fine-tuned MACE"
                  className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/50 px-3 py-2 font-mono text-xs text-[var(--color-text-secondary)] focus:border-[var(--color-accent-primary)] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className={params.modelType === "custom" ? "opacity-50 pointer-events-none" : ""}>
            <ParamSelect
              label="Model Size"
              value={params.modelSize}
              onChange={(v) => updateParam("modelSize", v as any)}
              options={[
                { value: "small", label: "Small (fast)" },
                { value: "medium", label: "Medium (balanced)" },
                { value: "large", label: "Large (accurate)" },
              ]}
              tooltip={params.modelType === "custom" ? "Custom models have fixed architecture" : "Model size affects accuracy and speed"}
            />
            {params.modelType === "custom" && (
              <p className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">Custom models have fixed architecture</p>
            )}
          </div>

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
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6">
        <h2 className="mb-4 font-sans text-sm font-bold text-[var(--color-accent-primary)]">
          CALCULATION TYPE
        </h2>

        <div className="space-y-2">
          {[
            { value: "single-point", label: "Single Point Energy" },
            { value: "geometry-opt", label: "Geometry Optimization" },
            { value: "molecular-dynamics", label: "Molecular Dynamics" },
            {
              value: "phonon",
              label: "Phonon Spectrum",
              disabled: true,
              tooltip: "Coming soon — not yet supported by backend",
            },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 rounded p-2 transition-colors ${
                opt.disabled
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:bg-[var(--color-accent-primary)]/15"
              }`}
            >
              <input
                type="radio"
                name="calculationType"
                value={opt.value}
                checked={params.calculationType === opt.value}
                onChange={(e) =>
                  !("disabled" in opt && opt.disabled) &&
                  updateParam("calculationType", e.target.value as any)
                }
                disabled={"disabled" in opt && opt.disabled}
                className="accent-[#4A7BF7]"
              />
              <span className="font-mono text-xs text-zinc-300">
                {opt.label}
                {"tooltip" in opt && opt.tooltip && (
                  <span className="ml-1.5 inline-block text-zinc-500" title={opt.tooltip}>
                    (soon)
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Physical Parameters */}
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6">
        <h2 className="mb-4 font-sans text-sm font-bold text-[var(--color-accent-primary)]">
          PHYSICAL PARAMETERS
        </h2>

        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={params.dispersion}
              onChange={(e) => updateParam("dispersion", e.target.checked)}
              className="accent-[#4A7BF7]"
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
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between font-sans text-sm font-bold text-[var(--color-accent-primary)]"
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
            <Info className="h-3 w-3 text-[var(--color-accent-primary)]/70" />
            <span className="pointer-events-none absolute left-6 top-0 w-48 rounded bg-[var(--color-accent-primary)]/90 px-2 py-1 text-xs text-black opacity-0 transition-opacity group-hover:opacity-100">
              {tooltip}
            </span>
          </span>
        )}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/50 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-[var(--color-accent-primary)] focus:outline-none"
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
          const parsed = parseFloat(localValue);
          if (isNaN(parsed)) {
            setLocalValue(String(value));
          } else {
            const clamped =
              min != null && max != null
                ? Math.min(max, Math.max(min, parsed))
                : min != null
                  ? Math.max(min, parsed)
                  : max != null
                    ? Math.min(max, parsed)
                    : parsed;
            onChange(clamped);
            setLocalValue(String(clamped));
          }
        }}
        min={min}
        max={max}
        step={step || 1}
        className="no-spinner w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/50 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-[var(--color-accent-primary)] focus:outline-none"
      />
    </div>
  );
}
