"use client";

/**
 * ParameterPanel — model and calculation configuration.
 *
 * Rebuilt on shadcn primitives (Select, RadioGroup, Switch, Input, Label,
 * Tooltip) and the warm light theme. Physical parameters are contextual to
 * the chosen calculation type. Every numeric control shows its unit and
 * valid range inline (Materials Project panel discipline — nothing bare).
 *
 * MODEL PICKER: driven entirely by lib/model-catalog.ts, a static mirror of
 * mace-api/model_catalog.py (see that file's header for how to regenerate
 * it). `params.modelType` IS the family key the catalog uses — no separate
 * "family" state is needed. Not every family offers every size; switching
 * families snaps modelSize to the nearest size that family actually has.
 *
 * Guardrails enforced here (see CLAUDE.md "Scientific Accuracy Rules"):
 *  - D3 dispersion is disabled for any family the catalog marks
 *    `dispersionSupported: false` (MACE-OFF23 today — already includes
 *    dispersion, so adding D3 would double-count it) and for custom
 *    checkpoints (the backend never wires `dispersion` into a custom
 *    MACECalculator, so the toggle would be a no-op).
 *  - Element coverage for the SELECTED family is surfaced, with a hard
 *    warning if the loaded structure is known to fall outside it — this used
 *    to be MACE-OFF-only and now applies to every family via its catalog
 *    entry's `elementSymbols`.
 *  - Licence (MIT vs ASL/non-commercial) is shown before a run, not after —
 *    five-plus of the twelve checkpoints in the catalog are ASL, and a user
 *    who may publish a result needs to know that up front.
 *  - Relative cost (vs. the cheapest checkpoint in the catalog) is shown so
 *    nobody picks a 15x model on a shared CPU box by accident.
 *  - MD timestep is capped and flagged outside the typical 0.5-2.0 fs band.
 *  - NPT is disabled when the loaded structure is known not to be periodic.
 *  - `pressure` means different things in different calculation types —
 *    GPa for MD/NPT (mace-api/calculate.py multiplies it by `units.GPa`) but
 *    Pa for vibrations (mace-api/vibrations_thermo.py reads it straight into
 *    `ase.thermochemistry.IdealGasThermo`, which REJECTS anything <= 0). A
 *    value left over from the other context is guarded against below.
 *  - Vibrational analysis defaults `optimizeFirst` ON: the backend refuses to
 *    build a Hessian on a geometry that is not already a stationary point.
 *  - NEB has no functioning upload path yet (it needs a SECOND structure,
 *    and even the remote-vs-local dual-mode plumbing in
 *    app/api/calculate/route.ts only carries one file through in local
 *    mode), so it stays disabled with an honest explanation rather than
 *    shipping a button that fails every time it is pressed.
 * The element/periodicity checks are undefined-safe: they activate once a
 * parent passes `structureElements` / `isPeriodic`, and stay inert otherwise.
 */

import { useEffect, useRef, useState } from "react";
import {
  Info,
  Upload,
  X,
  FileText,
  AlertTriangle,
  Lock,
  Unlock,
  Gauge,
  ChevronUp,
} from "lucide-react";
import type { CalculationParams } from "@/types/mace";
import {
  MODEL_FAMILIES,
  sizesForFamily,
  catalogEntry,
  type ModelCatalogEntry,
} from "@/lib/model-catalog";
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
import { Badge } from "@/components/ui/badge";
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
  /**
   * Unique elements present in the currently loaded structure (e.g. ["C", "H", "O"]),
   * if known. Drives the element-coverage warning below, generalized to whichever
   * family is selected. Optional and undefined-safe: stays inactive until a
   * parent wires up a parsed structure.
   */
  structureElements?: string[];
  /**
   * Whether the currently loaded structure has a periodic cell (lattice vectors),
   * if known. Drives the NPT guard below (NPT/barostat dynamics are only physically
   * meaningful for a periodic system). Optional: when undefined, periodicity cannot
   * be verified, so NPT is left selectable rather than guessed at.
   */
  isPeriodic?: boolean;
  /**
   * Per-atom element symbols, in index order (0-based, matching what the
   * backend expects in `scanIndices`), if a structure is loaded. Drives the
   * labeled atom pickers in the coordinate-scan form ("2: H" rather than a
   * bare, easy-to-miscount integer). Falls back to plain numeric inputs when
   * absent.
   */
  structureSymbols?: string[];
}

type CalcTypeOption = {
  value: CalculationParams["calculationType"];
  label: string;
  hint: string;
  disabled?: boolean;
  /**
   * Illustration in `public/workflows/`. Original SVGs authored for SimpleAtom,
   * and — unlike the decorative artwork this pattern is borrowed from — drawn
   * from data this app really produced: coordinate-scan.svg plots the measured
   * ethane torsion profile with its true 2.487 kcal/mol barrier, and
   * vibrations.svg uses water's real eigenvector and its three real
   * frequencies. See public/workflows/README.md for the provenance of each.
   * Omitted for types with no implementation, which render as a flat tile —
   * an illustration would advertise a capability that is not there.
   */
  art?: string;
};

const CALC_TYPES: CalcTypeOption[] = [
  {
    value: "single-point",
    art: "/workflows/single-point.svg",
    label: "Single-point energy",
    hint: "Energy and forces at the current geometry",
  },
  {
    value: "geometry-opt",
    art: "/workflows/geometry-opt.svg",
    label: "Geometry optimization",
    hint: "Relax atomic positions to a local energy minimum",
  },
  {
    value: "molecular-dynamics",
    art: "/workflows/molecular-dynamics.svg",
    label: "Molecular dynamics",
    hint: "Propagate atomic motion over time",
  },
  {
    value: "vibrations",
    art: "/workflows/vibrations.svg",
    label: "Vibrational analysis",
    hint: "Harmonic frequencies, normal modes and ideal-gas thermochemistry (relaxes to a stationary point first)",
  },
  {
    value: "coordinate-scan",
    art: "/workflows/coordinate-scan.svg",
    label: "Coordinate scan",
    hint: "Relaxed scan of a bond, angle or dihedral, with an energy profile",
  },
  {
    value: "neb",
    art: "/workflows/neb.svg",
    label: "Nudged elastic band",
    hint: "Reaction path between two structures — needs a second (product) structure upload, which SimpleAtom does not have wired up yet. Coming soon.",
    disabled: true,
  },
  {
    value: "irc",
    art: "/workflows/irc.svg",
    label: "Intrinsic reaction coordinate",
    hint: "Reaction path from an uploaded transition state toward reactant and product",
  },
  {
    value: "phonon",
    label: "Phonon spectrum",
    hint: "Not implemented — the backend rejects it and points molecules to Vibrational analysis instead",
    disabled: true,
  },
];

/**
 * Sentinel for the "let upstream decide" precision option. A Radix Select
 * needs a non-empty string value, but the wire format for this choice is the
 * ABSENCE of the `precision` key — that is what makes the backend fall back
 * to `upstream_default_precision()` (mace-api/calculate.py) instead of
 * honouring an explicit request. Never send this string.
 */
const PRECISION_AUTO = "auto";

/** Atoms required to define each scan coordinate kind, in click/selection order. */
const SCAN_COORDINATE_ATOM_COUNT: Record<
  NonNullable<CalculationParams["scanCoordinate"]>,
  number
> = { bond: 2, angle: 3, dihedral: 4 };

/** Unit the scan's start/end values are expressed in, per coordinate kind. */
const SCAN_COORDINATE_UNIT: Record<
  NonNullable<CalculationParams["scanCoordinate"]>,
  string
> = { bond: "Å", angle: "deg", dihedral: "deg" };

/** Vibrations/thermochemistry pressure default (Pa) — 1 atm, matching mace-api/vibrations_thermo.py's DEFAULT_PRESSURE_PA. */
const VIBRATIONS_DEFAULT_PRESSURE_PA = 101325;
/** A pressure value this large only makes sense as Pa, never as the GPa the MD/NPT form uses. */
const PRESSURE_PA_SCALE_THRESHOLD = 1000;

/**
 * "MACE-OFF" is a legacy alias of "MACE-OFF23" (types/mace.ts) — every
 * already-shared MACE Link and some existing code paths (e.g. the SMILES
 * auto-select in app/calculate/page.tsx, and the foundation-model comparison
 * request built for a custom-model run) still write it. The catalog only
 * indexes families under their canonical key, so lookups need the alias
 * resolved; writes from THIS component always use the canonical key, so the
 * alias naturally fades out wherever the picker is actually used.
 */
function resolveFamilyKey(modelType: CalculationParams["modelType"]): CalculationParams["modelType"] {
  return modelType === "MACE-OFF" ? "MACE-OFF23" : modelType;
}

export function ParameterPanel({
  params,
  onChange,
  customModelFile,
  onCustomModelChange,
  structureElements,
  isPeriodic,
  structureSymbols,
}: ParameterPanelProps) {
  const updateParam = <K extends keyof CalculationParams>(
    key: K,
    value: CalculationParams[K],
  ) => onChange({ ...params, [key]: value });

  const isCustom = params.modelType === "custom";
  const familyKey = resolveFamilyKey(params.modelType);

  // The catalog entry for the exact family+size in play. Falls back to the
  // family's first available size when the current size isn't offered by
  // this family — the size-snap effect below corrects that in state a beat
  // later, so this fallback only covers the single render in between.
  const activeEntry: ModelCatalogEntry | undefined = isCustom
    ? undefined
    : (catalogEntry(familyKey, params.modelSize) ??
      sizesForFamily(familyKey)[0]);
  const availableSizes = isCustom ? [] : sizesForFamily(familyKey);

  const dispersionSupported = !isCustom && (activeEntry?.dispersionSupported ?? false);

  // Elements outside the selected family's training domain, if the loaded
  // structure is known. Generalized from a MACE-OFF-only check: every
  // family's catalog entry carries its own trained element set.
  const unsupportedElements = activeEntry
    ? (structureElements ?? []).filter(
        (el) => !activeEntry.elementSymbols.includes(el),
      )
    : [];
  const hasHydrogen = structureElements?.includes("H") ?? false;

  const timeStepValue = params.timeStep ?? 1.0;
  const timeStepWarning =
    timeStepValue > 2.0
      ? "Above the typical 0.5–2.0 fs range — energy conservation degrades quickly beyond this; results may be unusable."
      : hasHydrogen && timeStepValue > 1.0
        ? "Structure contains hydrogen — prefer 1.0 fs or smaller for stable integration."
        : undefined;

  // Custom models have no size choice. Dispersion must not be silently
  // dropped: get_mace_calculator() only wires `dispersion` into mace_mp()-
  // loaded families the catalog marks dispersionSupported — MACE-OFF23
  // already includes dispersion (adding D3 would double-count it) and
  // get_custom_calculator() has no dispersion parameter at all. So neither an
  // unsupported family nor a custom checkpoint should leave the toggle in an
  // "on" state that the backend will ignore.
  useEffect(() => {
    if (params.modelType !== "custom") onCustomModelChange(null);

    const next = { ...params };
    let changed = false;

    const entryFamily = resolveFamilyKey(params.modelType);
    const entry =
      params.modelType === "custom"
        ? undefined
        : (catalogEntry(entryFamily, params.modelSize) ??
          sizesForFamily(entryFamily)[0]);
    const dispersionOk = params.modelType !== "custom" && (entry?.dispersionSupported ?? false);

    if (!dispersionOk && params.dispersion) {
      next.dispersion = false;
      changed = true;
    }

    // A custom checkpoint keeps the dtype it was saved in:
    // get_custom_calculator() deliberately does not pass `default_dtype` to
    // MACECalculator, so upstream adopts the checkpoint's own dtype. Sending
    // an explicit precision would be requested, ignored, and reported back as
    // a warning — drop it rather than ask for something that cannot happen.
    if (params.modelType === "custom" && params.precision != null) {
      next.precision = undefined;
      changed = true;
    }

    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.modelType]);

  // Snap modelSize to a size the newly-selected family actually offers. Not
  // every family has all three sizes (e.g. MACE-MPA-0 is medium-only).
  useEffect(() => {
    if (params.modelType === "custom") return;
    const sizes = sizesForFamily(resolveFamilyKey(params.modelType)).map((e) => e.modelSize);
    if (sizes.length > 0 && !sizes.includes(params.modelSize)) {
      onChange({ ...params, modelSize: sizes[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.modelType]);

  // NPT (barostat) dynamics are only meaningful for a periodic cell. If the
  // loaded structure is known not to be periodic, fall back to NVT rather
  // than let the request go out as a calculation that cannot work.
  useEffect(() => {
    if (isPeriodic === false && params.mdEnsemble === "NPT") {
      onChange({ ...params, mdEnsemble: "NVT" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPeriodic]);

  // `pressure` is GPa in MD/NPT (multiplied by units.GPa) but Pa in
  // vibrations (fed straight to ase.thermochemistry.IdealGasThermo, which
  // REJECTS anything <= 0). A value carried over from the other context is
  // not just cosmetically wrong here — entering vibrations with the MD
  // default of 0 would make every run fail outright, and leaving vibrations
  // with its ~101325 default would target an NPT run at ~101325 GPa.
  useEffect(() => {
    if (
      params.calculationType === "vibrations" &&
      (params.pressure == null || params.pressure <= 0)
    ) {
      onChange({ ...params, pressure: VIBRATIONS_DEFAULT_PRESSURE_PA });
    } else if (
      params.calculationType !== "vibrations" &&
      params.pressure != null &&
      params.pressure > PRESSURE_PA_SCALE_THRESHOLD
    ) {
      onChange({ ...params, pressure: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.calculationType]);

  // Vibrational analysis needs a starting point at (or near) a stationary
  // point. Default `optimizeFirst` ON the first time this type is selected,
  // so the common path — "just relax it for me" — needs no extra click, and
  // the mysterious "not a stationary point" refusal never has to happen.
  useEffect(() => {
    if (params.calculationType === "vibrations" && params.optimizeFirst == null) {
      onChange({ ...params, optimizeFirst: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.calculationType]);

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
            label="Model family"
            tooltip="Materials families (MACE-MP-0 and its variants) cover 89 elements for crystals, surfaces and bulk. MACE-OFF23 is organic molecules only — H, C, N, O, F, P, S, Cl, Br, I. Custom: your own .model checkpoint."
          >
            <Select
              value={isCustom ? "custom" : familyKey}
              onValueChange={(v) =>
                updateParam("modelType", v as CalculationParams["modelType"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_FAMILIES.map((family) => {
                  const rep = sizesForFamily(family)[0];
                  return (
                    <SelectItem key={family} value={family}>
                      {family} —{" "}
                      {rep.license === "MIT" ? "MIT" : "ASL, non-commercial"}
                    </SelectItem>
                  );
                })}
                <SelectItem value="custom">
                  Custom — upload .model file
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {activeEntry && <ModelDetailsPanel entry={activeEntry} />}

          {unsupportedElements.length > 0 && (
            <p className="flex items-start gap-2 rounded border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 p-2 text-xs leading-relaxed text-[var(--color-error)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This structure contains{" "}
                <strong>{unsupportedElements.join(", ")}</strong>, which{" "}
                {activeEntry?.displayName ?? "this model"} was not trained on.
                Pick a family whose element coverage includes it.
              </span>
            </p>
          )}

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
                      <p className="font-mono text-xs text-[var(--color-text-muted)]">
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
                : "Larger models are more accurate but slower. Not every family offers all three sizes."
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
                {isCustom ? (
                  <>
                    <SelectItem value="small">Small — fastest</SelectItem>
                    <SelectItem value="medium">Medium — balanced</SelectItem>
                    <SelectItem value="large">Large — most accurate</SelectItem>
                  </>
                ) : (
                  availableSizes.map((entry) => (
                    <SelectItem key={entry.modelSize} value={entry.modelSize}>
                      {entry.modelSize[0].toUpperCase() + entry.modelSize.slice(1)}{" "}
                      — {entry.relativeCost.toFixed(1)}x cost, {entry.checkpointMB} MB
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {!isCustom && availableSizes.length < 3 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {activeEntry?.family ?? familyKey} only ships{" "}
                {availableSizes.map((e) => e.modelSize).join(", ")}.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Precision"
              tooltip={
                isCustom
                  ? "A custom checkpoint keeps the dtype it was saved in — MACE adopts the checkpoint's own dtype, so this is not selectable."
                  : "Upstream MACE prints, on every run: float32 is faster but less accurate, recommended for MD; use float64 for geometry optimization. Auto applies exactly that, plus this family's own upstream default dtype."
              }
            >
              <Select
                value={params.precision ?? PRECISION_AUTO}
                disabled={isCustom}
                onValueChange={(v) =>
                  // "auto" means: send no `precision` key at all, so the
                  // backend derives upstream's default. JSON.stringify drops
                  // undefined keys, which is exactly the wire format wanted.
                  updateParam(
                    "precision",
                    v === PRECISION_AUTO
                      ? undefined
                      : (v as CalculationParams["precision"]),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRECISION_AUTO}>
                    Auto — match upstream MACE
                  </SelectItem>
                  <SelectItem value="float32">float32 — faster</SelectItem>
                  <SelectItem value="float64">float64 — precise</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {isCustom
                  ? "Custom checkpoints run in the dtype they were saved in."
                  : `Auto follows upstream MACE: this family defaults to ${activeEntry?.upstreamDefaultDtype ?? "float32"}, and float64 for geometry optimization regardless of family. An explicit choice is always honoured — the result will say which dtype actually ran.`}
              </p>
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
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {CALC_TYPES.map((opt) => {
              const selected = params.calculationType === opt.value;
              return (
                <label
                  key={opt.value}
                  htmlFor={`ct-${opt.value}`}
                  className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all ${
                    opt.disabled
                      ? "cursor-not-allowed border-[var(--color-border-subtle)] opacity-60"
                      : selected
                        ? "cursor-pointer border-[var(--color-accent-primary)] bg-[var(--color-accent-soft)] shadow-sm"
                        : "cursor-pointer border-[var(--color-border-subtle)] hover:border-[var(--color-border-emphasis)] hover:shadow-sm"
                  }`}
                >
                  {opt.art && (
                    /*
                     * Decorative: the label and hint below carry the meaning, so
                     * announcing the illustration too would make a screen reader
                     * read every card twice. Each SVG still has its own <title>
                     * for anyone opening the file directly.
                     */
                    <span
                      aria-hidden="true"
                      className="block border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={opt.art}
                        alt=""
                        width={280}
                        height={180}
                        loading="lazy"
                        className={`block h-auto w-full transition-opacity ${
                          opt.disabled ? "opacity-45 grayscale" : "opacity-95 group-hover:opacity-100"
                        }`}
                      />
                    </span>
                  )}
                  <span className="flex flex-1 items-start gap-2.5 p-3.5">
                    <RadioGroupItem
                      value={opt.value}
                      id={`ct-${opt.value}`}
                      disabled={opt.disabled}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                        {opt.label}
                        {opt.disabled && (
                          <span className="ml-2 rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5 text-xs font-normal text-[var(--color-text-muted)]">
                            soon
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {opt.hint}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>

          <div className="border-t border-[var(--color-border-subtle)] pt-5">
            {/* D3 dispersion — meaningful only for families the catalog marks dispersionSupported */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="dispersion" className="text-sm">
                  D3 dispersion correction
                </Label>
                <InfoTip text="Grimme D3 correction. Only meaningful for models trained without dispersion baked in — MACE-OFF23 already includes dispersion in training, so enabling this would double-count it." />
              </div>
              <Switch
                id="dispersion"
                checked={(params.dispersion && dispersionSupported) ?? false}
                disabled={!dispersionSupported}
                onCheckedChange={(c) => updateParam("dispersion", c)}
              />
            </div>
            {!dispersionSupported && (
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                {isCustom
                  ? "Disabled — dispersion is not applied to custom model checkpoints; it depends on how the model was trained."
                  : `Disabled — ${activeEntry?.displayName ?? "this model"} already includes dispersion; enabling D3 would double-count it.`}
              </p>
            )}

            {/* Geometry optimization */}
            {params.calculationType === "geometry-opt" && (
              <div className="mt-5 space-y-4">
                <NumberField
                  label="Force threshold"
                  unit="eV/Å"
                  hint="Convergence: max force per atom (fmax). 0.05 for general use; tighten to 0.01 for production-quality geometries."
                  value={params.forceThreshold ?? 0.05}
                  onChange={(v) => updateParam("forceThreshold", v)}
                  min={0.001}
                  max={1}
                  step={0.01}
                />
                <NumberField
                  label="Max optimization steps"
                  hint="Upper bound on BFGS iterations; the run stops early once fmax is reached."
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
                      <SelectItem
                        value="NPT"
                        disabled={isPeriodic === false}
                      >
                        NPT — constant P, T
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {isPeriodic === false && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      NPT is unavailable — this structure has no periodic
                      cell (not a crystal/bulk structure). Only NVE/NVT apply.
                    </p>
                  )}
                </Field>

                <NumberField
                  label="Temperature"
                  unit="K"
                  hint={
                    (params.mdEnsemble ?? "NVT") === "NVE"
                      ? "NVE has no thermostat — this sets only the initial velocity draw; temperature will drift, not stay fixed."
                      : undefined
                  }
                  value={params.temperature ?? 300}
                  onChange={(v) => updateParam("temperature", v)}
                  min={0}
                  max={5000}
                />

                {(params.mdEnsemble ?? "NVT") === "NVT" && (
                  <NumberField
                    label="Friction"
                    unit="1/fs"
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
                    label="Pressure"
                    unit="GPa"
                    value={params.pressure ?? 0}
                    onChange={(v) => updateParam("pressure", v)}
                    min={0}
                    max={1000}
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label="Time step"
                    unit="fs"
                    hint="Typical: 0.5–2.0 fs. Use smaller steps for light elements like hydrogen."
                    warning={timeStepWarning}
                    value={timeStepValue}
                    onChange={(v) => updateParam("timeStep", v)}
                    min={0.1}
                    max={4}
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

            {/* Vibrational analysis */}
            {params.calculationType === "vibrations" && (
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="optimize-first" className="text-sm">
                      Optimize to a stationary point first
                    </Label>
                    <InfoTip text="The backend REFUSES to build a Hessian on a geometry that isn't already at a stationary point (max force above the tolerance below). Leave this on unless you already relaxed the structure elsewhere." />
                  </div>
                  <Switch
                    id="optimize-first"
                    checked={params.optimizeFirst ?? true}
                    onCheckedChange={(c) => updateParam("optimizeFirst", c)}
                  />
                </div>

                <NumberField
                  label="Stationary-point tolerance"
                  unit="eV/Å"
                  hint="Max force the geometry must satisfy before a Hessian is built. CLAUDE.md's frequency-work convention: 0.005 eV/Å, tighter than the 0.05 used for a general optimization."
                  value={params.fmaxTolerance ?? 0.005}
                  onChange={(v) => updateParam("fmaxTolerance", v)}
                  min={0.0001}
                  max={0.05}
                  step={0.0005}
                />

                <NumberField
                  label="Finite-difference step"
                  unit="Å"
                  hint="Displacement used to build the Hessian by central differences. Larger = less numerical noise, more anharmonic leakage."
                  value={params.delta ?? 0.01}
                  onChange={(v) => updateParam("delta", v)}
                  min={0.001}
                  max={0.05}
                  step={0.001}
                />

                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label="Temperature"
                    unit="K"
                    hint="Ideal-gas thermochemistry (U, H, S, G)."
                    value={params.temperature ?? 298.15}
                    onChange={(v) => updateParam("temperature", v)}
                    min={0.1}
                    max={2000}
                    step={0.01}
                  />
                  <NumberField
                    label="Pressure"
                    unit="Pa"
                    hint="1 atm = 101325 Pa (default). This is NOT the GPa used by MD/NPT above — thermochemistry reads pressure directly in Pa."
                    value={params.pressure ?? VIBRATIONS_DEFAULT_PRESSURE_PA}
                    onChange={(v) => updateParam("pressure", v)}
                    min={1}
                    max={10_000_000}
                    step={1}
                  />
                </div>

                <NumberField
                  label="Spin multiplicity"
                  hint="2S+1. Use 1 for a closed-shell singlet."
                  value={params.spinMultiplicity ?? 1}
                  onChange={(v) => updateParam("spinMultiplicity", Math.round(v))}
                  min={1}
                  max={10}
                  step={1}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="symmetry-override" className="text-sm">
                        Override symmetry number
                      </Label>
                      <InfoTip text="The rotational symmetry number sigma enters the entropy only as -kB*ln(sigma), but it does shift S and G. Leave this off to let the backend detect sigma from the relaxed geometry's rotational subgroup." />
                    </div>
                    <Switch
                      id="symmetry-override"
                      checked={params.symmetryNumber != null}
                      onCheckedChange={(c) =>
                        updateParam("symmetryNumber", c ? 1 : undefined)
                      }
                    />
                  </div>
                  {params.symmetryNumber != null ? (
                    <NumberField
                      label="Symmetry number (σ)"
                      value={params.symmetryNumber}
                      onChange={(v) => updateParam("symmetryNumber", Math.round(v))}
                      min={1}
                      max={60}
                      step={1}
                    />
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Auto-detected from the relaxed geometry&apos;s point group.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Coordinate scan */}
            {params.calculationType === "coordinate-scan" && (
              <CoordinateScanForm
                params={params}
                onChange={onChange}
                structureSymbols={structureSymbols}
              />
            )}

            {/* Intrinsic reaction coordinate — only documented parameter is the
                wall-clock budget (see PARAM_KEYS_BY_CALC_TYPE in app/calculate/page.tsx). */}
            {params.calculationType === "irc" && (
              <div className="mt-5 space-y-4">
                <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  Runs from the uploaded transition-state structure toward
                  both reactant and product using the backend&apos;s default
                  IRC step settings.
                </p>
                <NumberField
                  label="Wall-clock budget"
                  unit="s"
                  hint="The run returns whatever it has completed at this ceiling rather than hanging indefinitely."
                  value={params.timeBudgetSeconds ?? 240}
                  onChange={(v) => updateParam("timeBudgetSeconds", v)}
                  min={10}
                  max={3600}
                  step={10}
                />
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

/** License + level-of-theory + element coverage + cost panel for the selected model. */
function ModelDetailsPanel({ entry }: { entry: ModelCatalogEntry }) {
  const [showAllElements, setShowAllElements] = useState(false);
  const isMIT = entry.license === "MIT";
  const shownElements = showAllElements
    ? entry.elementSymbols
    : entry.elementSymbols.slice(0, 12);
  const hiddenCount = entry.elementSymbols.length - shownElements.length;
  const isExpensive = entry.relativeCost >= 10;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3">
      {/* Licence — the thing a user needs to see BEFORE running, not after */}
      <div
        className={`flex items-start gap-2 rounded border p-2 text-xs leading-relaxed ${
          isMIT
            ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]"
            : "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
        }`}
      >
        {isMIT ? (
          <Unlock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span>
          <strong>{entry.licenseName}</strong>
          {isMIT ? " — commercial use permitted. " : " — NON-COMMERCIAL. "}
          {!isMIT && (
            <>
              A result you plan to publish or use commercially needs a
              different checkpoint, or explicit ASL clearance.{" "}
            </>
          )}
          <a
            href={entry.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Licence text
          </a>
        </span>
      </div>

      {/* Level of theory + training data */}
      <div className="font-mono text-xs">
        <PropertyRow label="Level of theory" value={entry.levelOfTheory} />
        <PropertyRow label="Training data" value={entry.trainingDataset} />
      </div>

      {/* Element coverage */}
      <div>
        <p className="mb-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          Element coverage ({entry.elementCount})
        </p>
        <div className="flex flex-wrap gap-1">
          {shownElements.map((el) => (
            <Badge
              key={el}
              variant="outline"
              className="bg-[var(--color-bg-elevated)] font-mono text-xs font-normal text-[var(--color-text-secondary)]"
            >
              {el}
            </Badge>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllElements(true)}
              className="rounded-full border border-dashed border-[var(--color-border-emphasis)] px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
            >
              +{hiddenCount} more
            </button>
          )}
          {showAllElements && entry.elementSymbols.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAllElements(false)}
              className="flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
            >
              <ChevronUp className="h-3 w-3" /> collapse
            </button>
          )}
        </div>
      </div>

      {/* Cost — so nobody picks the 15x model on a shared CPU box by accident */}
      <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] pt-2 font-mono text-xs">
        <Gauge className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent-primary)]" />
        <span className={isExpensive ? "font-bold text-[var(--color-warning)]" : "text-[var(--color-text-secondary)]"}>
          {entry.relativeCost.toFixed(1)}x cost
        </span>
        <span className="text-[var(--color-text-muted)]">
          · {entry.checkpointMB} MB checkpoint · {entry.cpuMsPerAtom} ms/atom (CPU)
        </span>
      </div>
      {isExpensive && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {entry.relativeCost.toFixed(1)}x the cost of the cheapest model in
            the catalog — expect proportionally longer runs, especially for
            geometry optimization or MD on a shared CPU instance.
          </span>
        </p>
      )}
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-border-subtle)] py-1 first:border-t-0 first:pt-0">
      <span className="shrink-0 font-bold text-[var(--color-text-muted)]">{label}</span>
      <span className="text-right text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

/** Coordinate-scan parameter form: coordinate kind, atom indices, range, points. */
function CoordinateScanForm({
  params,
  onChange,
  structureSymbols,
}: {
  params: CalculationParams;
  onChange: (params: CalculationParams) => void;
  structureSymbols?: string[];
}) {
  const updateParam = <K extends keyof CalculationParams>(
    key: K,
    value: CalculationParams[K],
  ) => onChange({ ...params, [key]: value });

  const coordinate = params.scanCoordinate ?? "bond";
  const atomCount = SCAN_COORDINATE_ATOM_COUNT[coordinate];
  const unit = SCAN_COORDINATE_UNIT[coordinate];
  const indices = params.scanIndices ?? [];

  // Reset indices to the right length when the coordinate kind changes, so a
  // dihedral's 4 indices don't linger as a stray bond request.
  const prevAtomCount = useRef(atomCount);
  useEffect(() => {
    if (prevAtomCount.current !== atomCount) {
      prevAtomCount.current = atomCount;
      const next = Array.from({ length: atomCount }, (_, i) => indices[i] ?? i);
      onChange({ ...params, scanIndices: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atomCount]);

  const setIndex = (pos: number, value: number) => {
    const next = Array.from({ length: atomCount }, (_, i) => indices[i] ?? i);
    next[pos] = value;
    updateParam("scanIndices", next);
  };

  const labels =
    coordinate === "bond"
      ? ["Atom A", "Atom B"]
      : coordinate === "angle"
        ? ["Atom A", "Vertex", "Atom C"]
        : ["Atom A", "Atom B (bond)", "Atom C (bond)", "Atom D"];

  return (
    <div className="mt-5 space-y-4">
      <Field
        label="Coordinate"
        tooltip="Which internal coordinate to hold fixed at each scan point while the rest of the structure relaxes (FixInternals constraint, BFGS to the force threshold below)."
      >
        <Select
          value={coordinate}
          onValueChange={(v) =>
            updateParam("scanCoordinate", v as CalculationParams["scanCoordinate"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bond">Bond (2 atoms)</SelectItem>
            <SelectItem value="angle">Angle (3 atoms)</SelectItem>
            <SelectItem value="dihedral">Dihedral (4 atoms)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Atom indices (0-based, in order — the {coordinate === "angle" ? "middle atom is the vertex" : "order sets the sign/direction"})
        </Label>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${atomCount}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: atomCount }).map((_, pos) => (
            <AtomIndexField
              key={pos}
              label={labels[pos]}
              value={indices[pos] ?? pos}
              onChange={(v) => setIndex(pos, v)}
              symbols={structureSymbols}
            />
          ))}
        </div>
        {!structureSymbols?.length && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Upload a structure to pick atoms by element instead of a bare index.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Start"
          unit={unit}
          value={params.scanStart ?? (coordinate === "bond" ? 1.0 : 0)}
          onChange={(v) => updateParam("scanStart", v)}
          step={coordinate === "bond" ? 0.05 : 1}
        />
        <NumberField
          label="End"
          unit={unit}
          value={params.scanEnd ?? (coordinate === "bond" ? 2.0 : 180)}
          onChange={(v) => updateParam("scanEnd", v)}
          step={coordinate === "bond" ? 0.05 : 1}
        />
      </div>

      <NumberField
        label="Points"
        hint="Number of relaxed points across the range, including both ends. Each point starts from the previous point's relaxed geometry."
        value={params.scanPoints ?? 13}
        onChange={(v) => updateParam("scanPoints", Math.round(v))}
        min={3}
        max={100}
        step={1}
      />

      <NumberField
        label="Force threshold"
        unit="eV/Å"
        hint="Convergence at each point (fmax)."
        value={params.forceThreshold ?? 0.01}
        onChange={(v) => updateParam("forceThreshold", v)}
        min={0.001}
        max={0.5}
        step={0.001}
      />

      <NumberField
        label="Wall-clock budget"
        unit="s"
        hint="The scan returns whatever points it completed at this ceiling rather than hanging indefinitely."
        value={params.timeBudgetSeconds ?? 240}
        onChange={(v) => updateParam("timeBudgetSeconds", v)}
        min={10}
        max={3600}
        step={10}
      />
    </div>
  );
}

/**
 * One atom-index picker. Renders a labeled <select> of "index: Element" when
 * the structure's per-atom symbols are known (so a user picks "2: H" instead
 * of counting atoms in a file), and falls back to a plain numeric input
 * otherwise. This is the "numeric inputs with clear labelling" fallback from
 * the brief — clicking atoms directly in the 3D viewer was judged too large
 * a change to the existing viewer/preview components for this pass.
 */
function AtomIndexField({
  label,
  value,
  onChange,
  symbols,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  symbols?: string[];
}) {
  if (symbols && symbols.length > 0) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-[var(--color-text-muted)]">{label}</Label>
        <Select
          value={String(Math.min(Math.max(value, 0), symbols.length - 1))}
          onValueChange={(v) => onChange(Number(v))}
        >
          <SelectTrigger className="font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {symbols.map((sym, i) => (
              <SelectItem key={i} value={String(i)} className="font-mono text-xs">
                {i}: {sym}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-[var(--color-text-muted)]">{label}</Label>
      <Input
        type="number"
        className="no-spinner font-mono text-xs"
        value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed)) onChange(parsed);
        }}
        min={0}
        step={1}
      />
    </div>
  );
}

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
  unit,
  hint,
  warning,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  /** Physical unit shown inline next to the label and in the range caption
   * (e.g. "eV/Å", "K", "fs") — every numeric control here carries one unless
   * the quantity is genuinely dimensionless (e.g. a step count). */
  unit?: string;
  hint?: string;
  /** Dynamic caution shown when the current value is valid but scientifically
   * risky (e.g. an MD timestep above the typical range). Rendered distinctly
   * from `hint`, which is static guidance shown regardless of the value. */
  warning?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [localValue, setLocalValue] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const displayValue = isFocused ? localValue : String(value);
  const rangeText =
    min != null && max != null
      ? `Range: ${min}–${max}${unit ? ` ${unit}` : ""}`
      : undefined;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-[var(--color-text-secondary)]">
        {label}
        {unit && (
          <span className="ml-1 font-normal text-[var(--color-text-muted)]">
            ({unit})
          </span>
        )}
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
        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
      {rangeText && (
        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          {rangeText}
        </p>
      )}
      {warning && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
    </div>
  );
}
