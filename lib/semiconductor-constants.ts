/**
 * Reference data for semiconductor materials — experimental and DFT values.
 *
 * Used by semiconductor-results.tsx to display calculated vs. reference
 * comparison tables with % error.
 *
 * Sources: Materials Project (MP PBE), experimental handbooks.
 */

import type { ReferenceProperties } from "@/types/semiconductor";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export const REFERENCE_DATA: Record<string, ReferenceProperties> = {
  "si-diamond": {
    a: 5.431,
    B: 99,
    E_vac: 3.6,
    source: "Expt + MP",
  },
  "ge-diamond": {
    a: 5.658,
    B: 75,
    E_vac: 2.5,
    source: "Expt",
  },
  "gaas-zincblende": {
    a: 5.653,
    B: 75.5,
    E_vac: null,
    source: "Expt",
  },
  "inp-zincblende": {
    a: 5.869,
    B: 71,
    E_vac: null,
    source: "Expt",
  },
  "hfo2-monoclinic": {
    a: 5.117,
    B: 189,
    E_vac: null,
    source: "MP PBE",
  },
  "sio2-quartz": {
    a: 4.916,
    B: 37.1,
    E_vac: null,
    source: "Expt",
  },
  "si3n4-beta": {
    a: 7.608,
    B: 259,
    E_vac: null,
    source: "Expt (NIST Brillouin)",
  },
  "al2o3-corundum": {
    a: 4.759,
    B: 254,
    E_vac: null,
    source: "Expt",
  },
  "cu-fcc": {
    a: 3.615,
    B: 140,
    E_vac: 1.28,
    source: "Expt + DFT",
  },
  "w-bcc": {
    a: 3.165,
    B: 310,
    E_vac: 3.67,
    source: "Expt (positron annihilation)",
  },
  "tin-rocksalt": {
    a: 4.240,
    B: 288,
    E_vac: null,
    source: "Expt",
  },
};

// ---------------------------------------------------------------------------
// Semiconductor context blurbs — why each property matters for chip fab
// ---------------------------------------------------------------------------

export const PROPERTY_CONTEXT: Record<string, string> = {
  energy:
    "Total energy determines thermodynamic stability — lower is more stable.",
  bulkModulus:
    "Bulk modulus governs mechanical stability during CMP (chemical-mechanical polishing) and packaging stress.",
  vacancyFormation:
    "Vacancy formation energy controls defect density — affects carrier mobility and gate leakage.",
  forces:
    "Residual forces indicate how far a structure is from its equilibrium — large forces suggest instability.",
  latticeConstant:
    "Lattice constant matching is critical for epitaxial growth — mismatch causes strain and dislocations.",
};
