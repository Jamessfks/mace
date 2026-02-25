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
  precision: Precision;
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
  energyThreshold?: number;

  // Advanced options
  cutoffRadius?: number;
  maxOptSteps?: number;

  // Custom model support — user-uploaded .model files
  customModelName?: string;
  customModelDescription?: string;
}

export interface CalculationResult {
  status: "success" | "error" | "timeout";
  energy?: number;
  forces?: number[][];
  positions?: number[][];
  lattice?: number[][];
  symbols?: string[];
  trajectory?: {
    energies: number[];
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

  /** Reference data extracted from input file (for accuracy metrics) */
  referenceEnergy?: number;
  referenceForces?: number[][];
}

export interface UploadedStructure {
  filename: string;
  format: "xyz" | "cif" | "poscar" | "pdb";
  atomCount: number;
  elements: string[];
  preview?: string;
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
