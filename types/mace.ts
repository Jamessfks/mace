/**
 * Type definitions for MACE calculations
 */

export type ModelSize = "small" | "medium" | "large" | "custom";
export type ModelType = "MACE-MP-0" | "MACE-OFF";
export type Precision = "float32" | "float64";
export type Device = "cpu" | "cuda";
export type CalculationType =
  | "single-point"
  | "geometry-opt"
  | "molecular-dynamics"
  | "phonon"
  | "custom";

export interface CalculationParams {
  // Model Selection
  modelSize: ModelSize;
  modelType: ModelType;
  precision: Precision;
  device: Device;

  // Calculation Type
  calculationType: CalculationType;

  // Physical Parameters
  dispersion: boolean;
  temperature?: number;
  pressure?: number;
  timeStep?: number;

  // Advanced Options (optional)
  cutoffRadius?: number;
  maxOptSteps?: number;
  forceThreshold?: number;
  energyThreshold?: number;
  mdEnsemble?: "NVE" | "NVT" | "NPT";
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
}

export interface UploadedStructure {
  filename: string;
  format: "xyz" | "cif" | "poscar" | "pdb";
  atomCount: number;
  elements: string[];
  preview?: string;
}
