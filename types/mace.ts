/**
 * Type definitions for MACE calculations.
 *
 * Supports both built-in foundation models (MACE-MP-0, MACE-OFF) and
 * user-uploaded custom models (fine-tuned .model files).
 */

export type ModelSize = "small" | "medium" | "large";
export type ModelType = "MACE-MP-0" | "MACE-OFF" | "custom";
export type Precision = "float32" | "float64";
export type Device = "cpu" | "cuda";
export type CalculationType =
  | "single-point"
  | "geometry-opt"
  | "molecular-dynamics"
  | "phonon";

export interface CalculationParams {
  // Model selection
  modelSize: ModelSize;
  modelType: ModelType;
  /**
   * `default_dtype` handed to MACE. OPTIONAL on purpose: when omitted the
   * backend takes upstream's own default for the chosen model family and
   * calculation type (`upstream_default_precision()` in
   * mace-api/calculate.py — float64 for MACE-OFF and for geometry-opt,
   * float32 otherwise). An explicit value is honoured, exactly as upstream
   * honours whatever `default_dtype` it is handed, so pinning "float32" here
   * overrides upstream's recommendation and the backend says so in
   * `CalculationResult.warnings`.
   *
   * In `CalculationResult.params` this key is the dtype the loaded model was
   * actually running in, read back off the model — not the requested value.
   */
  precision?: Precision;
  device: Device;

  // Calculation type
  calculationType: CalculationType;

  // Physical parameters
  dispersion: boolean;
  temperature?: number;
  pressure?: number;
  timeStep?: number;
  friction?: number;
  mdSteps?: number;
  mdEnsemble?: "NVE" | "NVT" | "NPT";
  forceThreshold?: number;
  /** RNG seed for MD (Maxwell-Boltzmann velocities + Langevin forces). */
  seed?: number;

  // Advanced options
  maxOptSteps?: number;

  // Custom model support — user-uploaded .model files
  customModelName?: string;

  // ── Echoed back only in CalculationResult.params ──
  // Outcomes of the run, not request inputs. The backend records them here so
  // a result (including one shared via MACE Link) describes what actually
  // happened. Never send these.
  /** Geometry-opt: did BFGS reach fmax before maxOptSteps was exhausted? */
  converged?: boolean;
  /** Geometry-opt: BFGS steps actually taken. */
  optSteps?: number;
  /** Geometry-opt: max force at the final geometry, eV/Å. */
  finalFmax?: number;
  /**
   * MD: `Stationary()` was applied after the Maxwell-Boltzmann draw, so the
   * system starts with zero net momentum. Worth knowing when reading
   * `trajectory.temperatures`: ASE's `get_temperature()` divides by 3N
   * degrees of freedom regardless, so with the centre-of-mass mode pinned
   * the reported temperature reads low by (3N−3)/3N — ~11% for a 9-atom
   * molecule, ~1% for a 100-atom one. Under Langevin the thermostat
   * re-excites that mode, so 3N is the right divisor there.
   */
  comMomentumRemoved?: boolean;
}

export interface CalculationResult {
  status: "success" | "error" | "timeout";
  energy?: number;
  forces?: number[][];
  positions?: number[][];
  lattice?: number[][];
  symbols?: string[];
  trajectory?: {
    /**
     * POTENTIAL energy per frame (eV) — `atoms.get_potential_energy()`.
     * Present for both geometry-opt and MD. Keeps its original meaning: it
     * has never been the total energy, despite older labels saying so.
     */
    energies: number[];
    /**
     * MD only — potential energy per frame (eV). Mirrors `energies`; read
     * this one when you mean potential energy explicitly.
     */
    potentialEnergies?: number[];
    /** MD only — kinetic energy per frame (eV). */
    kineticEnergies?: number[];
    /**
     * MD only — total energy per frame (eV), potential + kinetic. This is
     * the quantity NVE conserves; `energies` alone is not conserved.
     */
    totalEnergies?: number[];
    /** MD only — instantaneous temperature per frame (K). */
    temperatures?: number[];
    positions: number[][][];
    step: number[];
  };
  properties?: {
    volume?: number;
    density?: number;
    pressure?: number;
  };
  message?: string;
  params?: Partial<CalculationParams>;
  /**
   * Seconds the BACKEND spent on the calculation itself, measured around the
   * dispatch in `run_calculation()` (`round(time.time() - calc_start, 3)`) —
   * so it excludes structure parsing, model download and model load, which
   * happen before the clock starts.
   *
   * This is the only field that carries a measured compute time. The browser's
   * wall-clock round trip is a different quantity and lives in
   * `clientRoundTrip`; the two must never be merged, and the number rendered
   * must never carry more decimals than the value it came from.
   *
   * Absent on results produced before the backend reported it.
   */
  timeTaken?: number;
  /**
   * Seconds of browser wall-clock round trip: request → HTTP → any model
   * download → compute → JSON transfer → parse. Set on the client only; the
   * backend never produces this key, and it is never a substitute for
   * `timeTaken`. Millisecond source resolution (`Date.now()`).
   */
  clientRoundTrip?: number;

  /**
   * Non-fatal notices from the backend about what it actually did — a
   * requested D3 correction that was not applied, a precision below
   * upstream's recommendation, an unconverged optimization, or a dtype
   * conversion MACE performed on the checkpoint. Render these verbatim; the
   * explanation lives in the backend, which is the only place that knows
   * what really ran. Absent (undefined) when there was nothing to report,
   * and on results produced before this field existed.
   */
  warnings?: string[];

  /**
   * Geometry-opt only — true when BFGS reached fmax, false when it stopped
   * at the maxOptSteps ceiling. Undefined for other calculation types and
   * for results produced before this field existed.
   */
  converged?: boolean;

  /** Reference data extracted from input file (for accuracy metrics) */
  referenceEnergy?: number;
  referenceForces?: number[][];

  /** Original SMILES string when input came from SMILES conversion */
  smilesString?: string;
  /** How the structure was provided */
  inputSource?: "file" | "smiles" | "catalog";

  /**
   * Reproducibility manifest built by `mace-api/provenance.py`. OPTIONAL:
   * results produced before it existed — including ones re-opened through a
   * MACE Link — simply do not have it, and the UI must render nothing rather
   * than an empty section.
   */
  provenance?: CalculationProvenance;

  /**
   * Advisory findings from `test_scripts/validate_calculation.py`, attached by
   * `attach_validation()`. Never used to reject a calculation that completed.
   * OPTIONAL for the same reason as `provenance`.
   */
  validation?: CalculationValidation;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provenance (mace-api/provenance.py → result["provenance"])
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The audit trail attached to a result: which weights, which library versions,
 * which structure, which commit.
 *
 * Every leaf is nullable and every group is optional, deliberately. The
 * backend never fabricates a field it could not measure — it writes `null` and
 * appends a line to `notes` saying why (see `build_manifest()` and
 * `unavailable_manifest()` in mace-api/provenance.py). Groups are optional on
 * top of that so a manifest written by a different schema version cannot crash
 * a reader; consumers should use optional chaining throughout.
 */
export interface CalculationProvenance {
  /** Bumped by the backend when the manifest shape changes. Currently 1. */
  schemaVersion?: number;
  /** ISO-8601 UTC, e.g. "2026-08-10T02:38:41Z". */
  timestampUtc?: string | null;
  model?: {
    type?: string | null;
    size?: string | null;
    checkpoint?: {
      /** Basename only — server paths are never echoed. */
      filename?: string | null;
      sizeBytes?: number | null;
      /** SHA256 of the file `torch.load()` actually opened. */
      sha256?: string | null;
      /** How that file was identified, e.g. "mace-cache-dir". */
      resolvedBy?: string | null;
    };
  };
  /**
   * Installed versions of the distributions that decide the numbers, keyed by
   * distribution name ("mace-torch", "torch", "ase", "numpy"). A package with
   * no installed metadata reads as null.
   */
  packages?: Record<string, string | null>;
  input?: {
    filename?: string | null;
    format?: string | null;
    nAtoms?: number | null;
    formula?: string | null;
    /** SHA256 of the uploaded file's bytes. */
    fileSha256?: string | null;
    /** Format-independent SHA256 of the parsed structure. */
    structureSha256?: string | null;
    /** Recipe that produced `structureSha256`, e.g. "simpleatom-structure-v1". */
    structureHashSpec?: string | null;
  };
  runtime?: {
    device?: string | null;
    precision?: string | null;
    /** MD RNG seed. Null when the run had no stochastic step. */
    seed?: number | null;
    python?: string | null;
    platform?: string | null;
    executable?: string | null;
  };
  code?: {
    gitCommit?: string | null;
    /** Null (not false) when the dirty state could not be determined. */
    gitDirty?: boolean | null;
  };
  /** Pointer to `result.params`; the effective parameters are not duplicated. */
  paramsRef?: string;
  /** One line for every field that came back null, saying why. */
  notes?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation (mace-api/calculate.py attach_validation → result["validation"])
// ═══════════════════════════════════════════════════════════════════════════

/** Issues/warnings from the parameter-sanity pass, when it ran. */
export interface ValidationParamFindings {
  valid?: boolean;
  issues?: string[];
  warnings?: string[];
}

export interface CalculationValidation {
  /** "ran" — the validator executed; "unavailable" — it could not be loaded. */
  status: "ran" | "unavailable";
  /** Filename of the validator module, e.g. "validate_calculation.py". */
  source?: string | null;
  /** Why the findings are advisory. Rendered verbatim; set by the backend. */
  policy?: string;
  /** Overall verdict. Only present when `status === "ran"`. */
  valid?: boolean;
  /** Checks that failed. Advisory — a completed calculation is never rejected. */
  issues?: string[];
  /** Checks that passed but look suspicious. */
  warnings?: string[];
  /** Checks that passed, with the measured value. */
  info?: string[];
  /** Parameter-sanity findings, or null when the validator has no such pass. */
  params?: ValidationParamFindings | null;
  /** Set only when `status === "unavailable"`. */
  unavailableReason?: string | null;
}

export interface UploadedStructure {
  filename: string;
  format: "xyz" | "cif" | "poscar" | "pdb";
  atomCount: number;
  elements: string[];
  preview?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared Result (MACE Link)
// ═══════════════════════════════════════════════════════════════════════════

export interface SharedResult {
  id: string;
  result: CalculationResult;
  params: Partial<CalculationParams>;
  filename?: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Benchmark Suite Types
// ═══════════════════════════════════════════════════════════════════════════

export interface BenchmarkModelConfig {
  type: ModelType;
  size: ModelSize;
  label: string;
}

export interface BenchmarkModelResult {
  modelLabel: string;
  modelType: ModelType;
  modelSize: ModelSize;
  status: "success" | "error";
  energy?: number;
  energyPerAtom?: number;
  forces?: number[][];
  symbols?: string[];
  rmsForce?: number;
  maxForce?: number;
  timeTaken?: number;
  error?: string;
}

export interface BenchmarkStructureResult {
  structureId: string;
  structureName: string;
  category: string;
  formula: string;
  atomCount: number;
  models: BenchmarkModelResult[];
  /** Experimental reference values for context (not for automated scoring). */
  reference?: {
    cohesiveEnergy?: { value: number; source: string };
    latticeConstant?: { value: number; source: string };
  };
}

export interface BenchmarkResult {
  status: "success" | "partial" | "error";
  results: BenchmarkStructureResult[];
  summary: {
    totalStructures: number;
    totalModels: number;
    totalCalculations: number;
    successCount: number;
    errorCount: number;
    totalTime: number;
  };
}
