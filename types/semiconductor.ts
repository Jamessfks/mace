/**
 * Type definitions for the Semiconductor Materials Discovery page.
 *
 * Reuses CalculationResult from types/mace.ts for individual MACE runs.
 * Adds semiconductor-specific types for the structure library, defect
 * generation, property workflows, and reference data comparison.
 */

import type { CalculationResult } from "./mace";

// ---------------------------------------------------------------------------
// Material categories (chip-relevant)
// ---------------------------------------------------------------------------

export type MaterialCategory =
  | "substrate"
  | "dielectric"
  | "metal"
  | "iii-v"
  | "nitride"
  | "2d";

// ---------------------------------------------------------------------------
// Structure library entry
// ---------------------------------------------------------------------------

/** A single material in the semiconductor structure library. */
export interface SemiconductorMaterial {
  /** Unique identifier (e.g. "si-diamond") */
  id: string;
  /** Human-readable name (e.g. "Silicon (diamond)") */
  name: string;
  /** Chemical formula (e.g. "Si₂") */
  formula: string;
  /** Chip-relevant category */
  category: MaterialCategory;
  /** One-line description of its role in semiconductor fabrication */
  application: string;
  /** Reference lattice constant in Angstroms */
  latticeA: number;
  /** Number of atoms in the unit cell */
  atomCount: number;
  /** List of unique elements */
  elements: string[];
  /** Extended-XYZ formatted string of the structure */
  xyzData: string;
  /** ID into REFERENCE_DATA for validation (matches this id by default) */
  referenceId?: string;
}

// ---------------------------------------------------------------------------
// Defect types
// ---------------------------------------------------------------------------

export type DefectType = "vacancy" | "surface";

export interface VacancyConfig {
  /** Index of the atom to remove (0-based) */
  atomIndex: number;
  /** Element of the removed atom */
  element: string;
}

export interface SurfaceSlabConfig {
  /** Miller indices */
  h: number;
  k: number;
  l: number;
  /** Slab thickness in Angstroms */
  slabThickness: number;
  /** Vacuum thickness in Angstroms */
  vacuumThickness: number;
}

// ---------------------------------------------------------------------------
// Property workflow
// ---------------------------------------------------------------------------

export type WorkflowType =
  | "single-point"
  | "geometry-opt"
  | "eos"
  | "vacancy-formation";

/** Result of a semiconductor property workflow (may aggregate multiple MACE runs). */
export interface PropertyResult {
  /** The underlying MACE calculation result (final or single-point) */
  result: CalculationResult;
  /** Workflow that produced this result */
  workflow: WorkflowType;
  /** Material id from the library */
  materialId?: string;
  /** EOS-derived bulk modulus in GPa (only for eos workflow) */
  bulkModulusGPa?: number;
  /** EOS data points: [volume, energy] pairs */
  eosData?: { volumes: number[]; energies: number[] };
  /** Vacancy formation energy in eV (only for vacancy-formation workflow) */
  vacancyFormationEv?: number;
  /** Comparison to reference data */
  referenceComparison?: {
    /** Lattice constant error (%) */
    latticeError?: number;
    /** Bulk modulus error (%) */
    bulkModulusError?: number;
    /** Vacancy formation energy error (%) */
    vacancyEnergyError?: number;
  };
}

// ---------------------------------------------------------------------------
// Reference data (for comparison table)
// ---------------------------------------------------------------------------

export interface ReferenceProperties {
  /** Lattice constant (Å) */
  a?: number;
  /** Bulk modulus (GPa) */
  B?: number;
  /** Vacancy formation energy (eV), null if unknown */
  E_vac?: number | null;
  /** Data source */
  source: string;
}

// ---------------------------------------------------------------------------
// Confidence level
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low" | "uncertain";
