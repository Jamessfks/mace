/**
 * Extended result types for the new backend calculation types (vibrations,
 * coordinate-scan, and the shared "energy profile" shape neb/irc are
 * expected to reuse).
 *
 * WHY THIS FILE EXISTS AND ISN'T FOLDED INTO types/mace.ts:
 *   types/mace.ts is out of scope for this change (see CLAUDE.md /
 *   task brief) — it has not yet grown the `vibrations`, `thermochemistry`,
 *   `scan` and `profile` keys that the Python backend now attaches to
 *   `CalculationResult`. Every field below is copied from the two verified
 *   real-run samples in docs/schemas/ (sample-vibrations-water.json,
 *   sample-scan-ethane.json) — nothing here is guessed. Fields absent from
 *   both samples, or present in only one and not obviously generic, are
 *   left out rather than invented.
 *
 * `ExtendedCalculationResult` is a structural superset of `CalculationResult`
 * (intersection with all-optional extra keys), so any `CalculationResult`
 * can be safely treated as one — the added keys just read as `undefined`
 * until the backend actually sends them.
 */

import type { CalculationResult } from "@/types/mace";

// ═══════════════════════════════════════════════════════════════════════════
// Vibrations
// ═══════════════════════════════════════════════════════════════════════════

export interface VibrationMode {
  index: number;
  kind: "vibration" | "translation-rotation";
  frequencyCm1: number;
  imaginary: boolean;
  energyEv: number;
  reducedMassAmu: number;
  forceConstantEvPerAngstrom2: number;
  /** 0 = pure vibration, 1 = pure translation/rotation. */
  translationRotationCharacter: number;
  /** Always null on every current model — MACE has no dipole output. */
  irIntensityDebye2PerAngstrom2PerAmu: number | null;
  /** Per-atom [dx, dy, dz] eigenvector, already scaled for display. */
  displacementsAngstrom: number[][];
}

export interface VibrationsAnimationSpec {
  scheme: string;
  amplitudeAngstrom: number;
  note: string;
  suggestedFrames: number;
}

export interface InfraredBlock {
  /** FALSE for every current model — MACE has no dipole moment output. */
  available: boolean;
  reason: string | null;
  intensityUnits: string | null;
  kmPerMolConversionFactor: number | null;
  stickSpectrum: {
    frequenciesCm1: number[];
    /** Always null while `available` is false. */
    intensities: number[] | null;
  };
}

export interface StationaryPointCheck {
  fmaxToleranceEvPerAngstrom: number;
  fmaxOnEntryEvPerAngstrom: number;
  optimizedFirst: boolean;
  fmaxAfterOptimizationEvPerAngstrom: number;
  optSteps: number;
  converged: boolean;
}

export interface VibrationsBlock {
  geometry: "linear" | "nonlinear";
  nAtoms: number;
  nModesTotal: number;
  nTranslationRotation: number;
  nVibrational: number;
  modeCountFormula: string;
  frequenciesCm1: number[];
  nImaginary: number;
  nImaginarySignificant: number;
  imaginaryThresholdCm1: number;
  imaginaryFrequenciesCm1: number[];
  /** "minimum" (0 imaginary) | "transition-state" (1 imaginary) | other. */
  stationaryPointType: string;
  /** Plain-English one-liner — the single most useful field on the page. */
  stationaryPointStatement: string;
  zeroPointEnergyEv: number;
  modes: VibrationMode[];
  translationRotationModes?: VibrationMode[];
  animation?: VibrationsAnimationSpec;
  infrared: InfraredBlock;
  stationaryPoint?: StationaryPointCheck;
  units?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Thermochemistry
// ═══════════════════════════════════════════════════════════════════════════

export interface ThermochemistrySymmetry {
  symmetryNumber: number;
  /** "detected" — the backend computed sigma; "override" — the user set it. */
  source: string;
  confident?: boolean;
  rotationalSubgroup?: string;
  effectOnEntropy?: string;
  entropyShiftEvPerK?: number;
  gibbsShiftEv?: number;
}

export interface ThermochemistryBlock {
  temperatureK: number;
  pressurePa: number;
  pressureNote?: string;
  geometry: string;
  symmetry: ThermochemistrySymmetry;
  spinMultiplicity: number;
  nVibrationalModesUsed?: number;
  nImaginaryModesExcluded?: number;
  potentialEnergyEv?: number;
  zeroPointEnergyEv: number;
  internalEnergyEv: number;
  enthalpyEv: number;
  entropyEvPerK: number;
  entropyJPerMolPerK: number;
  minusTSEv?: number;
  gibbsEnergyEv: number;
  enthalpyCorrectionEv: number;
  gibbsCorrectionEv: number;
  unitConversions: {
    evToKjPerMol: number;
    evToKcalPerMol: number;
    evPerKToJPerMolPerK: number;
    evToCm1: number;
  };
  definitions?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Energy profile — shared shape for coordinate-scan / NEB / IRC
// ═══════════════════════════════════════════════════════════════════════════

export interface EnergyProfile {
  x: number[];
  xLabel: string;
  xUnit: string;
  /** Coordinate value actually achieved at each point (may differ from x if a point failed to converge exactly). */
  xAchieved?: number[];
  /** Energy relative to the lowest point on the profile (eV). */
  y: number[];
  /** Absolute total energy per point (eV), when supplied. */
  yAbsolute?: number[];
  yUnit: string;
  yLabel: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Coordinate scan — only meaningful when calculationType === "coordinate-scan"
// ═══════════════════════════════════════════════════════════════════════════

export interface ScanBlock {
  coordinate: "bond" | "angle" | "dihedral";
  indices: number[];
  unit: string;
  targets: number[];
  achieved: number[];
  deviations: number[];
  deviationTolerance: number;
  constraintHeld: boolean;
  worstDeviationIndex?: number;
  pointConverged: boolean[];
  pointsRequested: number;
  pointsCompleted: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  maxIndex: number;
  minIndex: number;
  barrierEv: number;
  barrierKcalPerMol: number;
  barrierKjPerMol: number;
  displacementMethod?: string;
  sequential?: boolean;
  hysteresisNote?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Trajectory additions carried by coordinate-scan (and presumably NEB/IRC)
// ═══════════════════════════════════════════════════════════════════════════

export interface ReactionCoordinateTrajectoryExtra {
  reactionCoordinate?: number[];
  reactionCoordinateUnit?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// The extended result
// ═══════════════════════════════════════════════════════════════════════════

export type ExtendedCalculationResult = CalculationResult & {
  vibrations?: VibrationsBlock;
  thermochemistry?: ThermochemistryBlock;
  /** Present for coordinate-scan today; the same shape is expected from NEB/IRC. */
  profile?: EnergyProfile;
  /** coordinate-scan only. */
  scan?: ScanBlock;
  trajectory?: NonNullable<CalculationResult["trajectory"]> & ReactionCoordinateTrajectoryExtra;
};

/** Narrow a plain CalculationResult to the extended shape for rendering. */
export function asExtended(result: CalculationResult): ExtendedCalculationResult {
  return result as ExtendedCalculationResult;
}
