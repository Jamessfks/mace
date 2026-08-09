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
  timeTaken?: number;

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
