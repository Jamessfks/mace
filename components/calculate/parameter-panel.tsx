"use client";

/**
 * ParameterPanel — model and calculation configuration.
 *
 * Rebuilt on shadcn primitives (Select, RadioGroup, Switch, Input, Label,
 * Tooltip) and the warm light theme. Physical parameters are contextual to
 * the chosen calculation type. D3 dispersion is disabled for MACE-OFF, which
 * already includes dispersion (enabling it would double-count).
 */

import { useEffect, useState } from "react";
import { Info, Upload, X, FileText } from "lucide-react";
import type { CalculationParams } from "@/types/mace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ParameterPanelProps {
  params: CalculationParams;
  onChange: (params: CalculationParams) => void;
  customModelFile: File | null;
  onCustomModelChange: (file: File | null) => void;
}

type CalcTypeOption = {
  value: CalculationParams["calculationType"];
  label: string;
  hint: string;
  disabled?: boolean;
};

const CALC_TYPES: CalcTypeOption[] = [
  {
    value: "single-point",
    label: "Single-point energy",
    hint: "Energy and forces at the current geometry",
  },
  {
    value: "geometry-opt",
    label: "Geometry optimization",
    hint: "Relax atomic positions to a local energy minimum",
  },
  {
    value: "molecular-dynamics",
    label: "Molecular dynamics",
    hint: "Propagate atomic motion over time",
  },
  {
    value: "phonon",
    label: "Phonon spectrum",
    hint: "Vibrational analysis — not yet supported by the backend",
    disabled: true,
  },
];

export function ParameterPanel({
  params,
  onChange,
  customModelFile,
  onCustomModelChange,
}: ParameterPanelProps) {
  const updateParam = <K extends keyof CalculationParams>(
    key: K,
    value: CalculationParams[K],
  ) => onChange({ ...params, [key]: value });

  const isCustom = params.modelType === "custom";
  const isOFF = params.modelType === "MACE-OFF";

  // Custom models have no size choice / MACE-OFF must not double-count dispersion.
  useEffect(() => {
    if (params.modelType !== "custom") onCustomModelChange(null);
    if (params.modelType === "MACE-OFF" && params.dispersion) {
      onChange({ ...params, dispersion: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.modelType]);

  return (
    <div className="space-y-6">
      {/* ── Model ── */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Model</CardTitle>
          <CardDescription>
            Choose a MACE foundation model or upload a fine-tuned checkpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            label="Model type"
            tooltip="MACE-MP-0: materials & crystals (89 elements). MACE-OFF: organic molecules. Custom: your own .model checkpoint."
          >
            <Select
              value={params.modelType}
              onValueChange={(v) =>
                updateParam("modelType", v as CalculationParams["modelType"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MACE-MP-0">
                  MACE-MP-0 — materials, 89 elements
                </SelectItem>
                <SelectItem value="MACE-OFF">
                  MACE-OFF — organic molecules
                </SelectItem>
                <SelectItem value="custom">
                  Custom — upload .model file
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {isCustom && (
            <div className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-primary)]" />
                <span>
                  Upload a MACE-compatible <code className="font-mono">.model</code>{" "}
                  checkpoint — a fine-tuned model from{" "}
                  <code className="font-mono">mace_run_train</code> or any MACE
                  architecture.
                </span>
              </p>

              {!customModelFile ? (
                <div className="relative cursor-pointer rounded-lg border-2 border-dashed border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] p-4 text-center transition-colors hover:border-[var(--color-accent-primary)] hover:bg-[var(--color-accent-soft)]">
                  <input
                    type="file"
                    accept=".model"
                    aria-label="Upload custom MACE model"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        onCustomModelChange(e.target.files[0]);
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <Upload className="mx-auto mb-1 h-5 w-5 text-[var(--color-text-muted)]" />
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Drop a .model file or click to browse
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[var(--color-accent-primary)]" />
                    <div>
                      <p className="font-mono text-xs text-[var(--color-text-primary)]">
                        {customModelFile.name}
                      </p>
                      <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {(customModelFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCustomModelChange(null)}
                    aria-label="Remove custom model"
                    className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-error)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <Field label="Model label">
                <Input
                  type="text"
                  value={params.customModelName ?? ""}
                  onChange={(e) => updateParam("customModelName", e.target.value)}
                  placeholder="e.g. My fine-tuned MACE"
                />
              </Field>
            </div>
          )}

          <Field
            label="Model size"
            tooltip={
              isCustom
                ? "Custom models have a fixed architecture."
                : "Larger models are more accurate but slower."
            }
          >
            <Select
              value={params.modelSize}
              onValueChange={(v) =>
                updateParam("modelSize", v as CalculationParams["modelSize"])
              }
              disabled={isCustom}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small — fastest</SelectItem>
                <SelectItem value="medium">Medium — balanced</SelectItem>
                <SelectItem value="large">Large — most accurate</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Precision"
              tooltip="float64 is required for vibrational / Hessian accuracy."
            >
              <Select
                value={params.precision}
                onValueChange={(v) =>
                  updateParam("precision", v as CalculationParams["precision"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="float32">float32 — faster</SelectItem>
                  <SelectItem value="float64">float64 — precise</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Device">
              <Select
                value={params.device}
                onValueChange={(v) =>
                  updateParam("device", v as CalculationParams["device"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpu">CPU</SelectItem>
                  <SelectItem value="cuda">CUDA (GPU)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Calculation ── */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Calculation</CardTitle>
          <CardDescription>
            Pick what to compute; parameters below adapt to your choice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup
            value={params.calculationType}
            onValueChange={(v) =>
              updateParam(
                "calculationType",
                v as CalculationParams["calculationType"],
              )
            }
            className="gap-2"
          >
            {CALC_TYPES.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`ct-${opt.value}`}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                  opt.disabled
                    ? "cursor-not-allowed border-[var(--color-border-subtle)] opacity-55"
                    : params.calculationType === opt.value
                      ? "cursor-pointer border-[var(--color-accent-primary)] bg-[var(--color-accent-soft)]"
                      : "cursor-pointer border-[var(--color-border-subtle)] hover:border-[var(--color-border-emphasis)] hover:bg-[var(--color-bg-secondary)]"
                }`}
              >
                <RadioGroupItem
                  value={opt.value}
                  id={`ct-${opt.value}`}
                  disabled={opt.disabled}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                    {opt.label}
                    {opt.disabled && (
                      <span className="ml-2 rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-normal text-[var(--color-text-muted)]">
                        soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">
                    {opt.hint}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          <div className="border-t border-[var(--color-border-subtle)] pt-5">
            {/* D3 dispersion — meaningful only for MACE-MP-0 */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="dispersion" className="text-sm">
                  D3 dispersion correction
                </Label>
                <InfoTip text="Grimme D3 dispersion. Only meaningful for MACE-MP-0 — MACE-OFF already includes dispersion." />
              </div>
              <Switch
                id="dispersion"
                checked={params.dispersion && !isOFF}
                disabled={isOFF}
                onCheckedChange={(c) => updateParam("dispersion", c)}
              />
            </div>
            {isOFF && (
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                Dispersion is already included in MACE-OFF.
              </p>
            )}

            {/* Geometry optimization */}
            {params.calculationType === "geometry-opt" && (
              <div className="mt-5 space-y-4">
                <NumberField
                  label="Force threshold (eV/Å)"
                  hint="Convergence criterion: max force per atom (fmax)"
                  value={params.forceThreshold ?? 0.05}
                  onChange={(v) => updateParam("forceThreshold", v)}
                  min={0.001}
                  max={1}
                  step={0.01}
                />
                <NumberField
                  label="Max optimization steps"
                  value={params.maxOptSteps ?? 500}
                  onChange={(v) => updateParam("maxOptSteps", v)}
                  min={10}
                  max={5000}
                />
              </div>
            )}

            {/* Molecular dynamics */}
            {params.calculationType === "molecular-dynamics" && (
              <div className="mt-5 space-y-4">
                <Field
                  label="Ensemble"
                  tooltip="NVE: no thermostat. NVT: Langevin thermostat. NPT: thermostat + barostat (needs a periodic cell)."
                >
                  <Select
                    value={params.mdEnsemble ?? "NVT"}
                    onValueChange={(v) =>
                      updateParam("mdEnsemble", v as "NVE" | "NVT" | "NPT")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NVE">NVE — microcanonical</SelectItem>
                      <SelectItem value="NVT">NVT — canonical</SelectItem>
                      <SelectItem value="NPT">NPT — constant P, T</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <NumberField
                  label="Temperature (K)"
                  value={params.temperature ?? 300}
                  onChange={(v) => updateParam("temperature", v)}
                  min={0}
                  max={5000}
                />

                {(params.mdEnsemble ?? "NVT") === "NVT" && (
                  <NumberField
                    label="Friction (1/fs)"
                    hint="Langevin thermostat coupling strength"
                    value={params.friction ?? 0.005}
                    onChange={(v) => updateParam("friction", v)}
                    min={0.0001}
                    max={0.1}
                    step={0.001}
                  />
                )}

                {(params.mdEnsemble ?? "NVT") === "NPT" && (
                  <NumberField
                    label="Pressure (GPa)"
                    value={params.pressure ?? 0}
                    onChange={(v) => updateParam("pressure", v)}
                    min={0}
                    max={1000}
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label="Time step (fs)"
                    value={params.timeStep ?? 1.0}
                    onChange={(v) => updateParam("timeStep", v)}
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                  <NumberField
                    label="MD steps"
                    value={params.mdSteps ?? 100}
                    onChange={(v) => updateParam("mdSteps", v)}
                    min={1}
                    max={100000}
                  />
                </div>
              </div>
            )}

            {params.calculationType === "single-point" && (
              <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                No additional parameters required for a single-point evaluation.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Local helpers ── */

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium text-[var(--color-text-secondary)]">
          {label}
        </Label>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      {children}
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
          aria-label="More information"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint?: string;
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
    <div className="space-y-2">
      <Label className="text-xs font-medium text-[var(--color-text-secondary)]">
        {label}
      </Label>
      <Input
        type="number"
        className="no-spinner font-mono"
        value={displayValue}
        onFocus={() => {
          setLocalValue(String(value));
          setIsFocused(true);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalValue(raw);
          const parsed = parseFloat(raw);
          if (!isNaN(parsed)) onChange(parsed);
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
        step={step ?? 1}
      />
      {hint && (
        <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}
