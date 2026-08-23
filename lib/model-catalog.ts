/**
 * Frontend mirror of mace-api/model_catalog.py's ModelSpec catalog.
 *
 * SOURCE OF TRUTH: mace-api/model_catalog.py is authoritative. This file is a
 * static snapshot generated from it, via:
 *
 *   python3 -c "import sys;sys.path.insert(0,'mace-api');import model_catalog;\
 *     print(model_catalog.catalog_as_json(indent=1))"
 *
 * verifiedAgainstMaceVersion: "0.3.15"
 * schemaVersion: 1
 *
 * A static mirror (rather than a live call into mace-api/) is deliberate: the
 * Next.js frontend must not depend on a Python runtime being reachable just to
 * render the model picker, and the catalog itself is source data — checkpoint
 * sizes, licences and measured costs — that does not change without a backend
 * release. Regenerate this file (by hand, from the command above) whenever
 * mace-api/model_catalog.py changes.
 *
 * Only the fields the UI actually renders are kept. Every value below is
 * copied verbatim from the catalog — nothing here is invented.
 */

export interface ModelCatalogEntry {
  /** ModelType value the backend and types/mace.ts both use for this family. */
  modelType: string;
  modelSize: "small" | "medium" | "large";
  family: string;
  displayName: string;
  description: string;
  levelOfTheory: string;
  trainingDataset: string;
  energyReferenceNote: string;
  license: "MIT" | "ASL";
  licenseName: string;
  licenseUrl: string;
  licenseNotice: string;
  commercialUsePermitted: boolean;
  /** `default_dtype` upstream itself defaults to for this loader (mace_mp: float32, mace_off: float64). */
  upstreamDefaultDtype: "float32" | "float64";
  /** Whether `dispersion=True` (Grimme D3) is a meaningful, non-double-counting option for this family. */
  dispersionSupported: boolean;
  dispersionNote: string;
  elementCount: number;
  elementSymbols: string[];
  checkpointMB: number;
  cpuMsPerAtom: number;
  /** Cost relative to the cheapest checkpoint in the catalog (MACE-OFF23 small = 1.0). */
  relativeCost: number;
  costNote: string;
  recommendedFor: string[];
  notes: string[];
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    modelType: "MACE-MP-0",
    modelSize: "small",
    family: "MACE-MP",
    displayName: "MACE-MP-0 (small)",
    description: "The original Materials Project foundation model, L=0 / 128 channels. Cheapest 89-element option; use it for a first look, screening and MD.",
    levelOfTheory: "PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
    trainingDataset: "MPtrj (Materials Project relaxation trajectories)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "MIT",
    licenseName: "MIT",
    licenseUrl: "https://github.com/ACEsuit/mace/blob/main/MIT.md",
    licenseNotice: "MIT licensed — commercial use permitted.",
    commercialUsePermitted: true,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 32.6,
    cpuMsPerAtom: 1.34,
    relativeCost: 1.7,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "bulk materials", "quick screening"],
    notes: ["L=0 (invariant) model — cheaper than medium but less accurate for directional bonding."],
  },
  {
    modelType: "MACE-MP-0",
    modelSize: "medium",
    family: "MACE-MP",
    displayName: "MACE-MP-0 (medium)",
    description: "The original Materials Project foundation model, L=1 / 128 channels. SimpleAtom's long-standing default for materials.",
    levelOfTheory: "PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
    trainingDataset: "MPtrj (Materials Project relaxation trajectories)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "MIT",
    licenseName: "MIT",
    licenseUrl: "https://github.com/ACEsuit/mace/blob/main/MIT.md",
    licenseNotice: "MIT licensed — commercial use permitted.",
    commercialUsePermitted: true,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 44.4,
    cpuMsPerAtom: 3.77,
    relativeCost: 4.7,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "bulk materials"],
    notes: [],
  },
  {
    modelType: "MACE-MP-0",
    modelSize: "large",
    family: "MACE-MP",
    displayName: "MACE-MP-0 (large)",
    description: "The largest MACE-MP-0 checkpoint (MACE_MPtrj_2022.9, ~15.8M parameters). Most accurate of the original line, and the largest download in the MACE-MP menu.",
    levelOfTheory: "PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
    trainingDataset: "MPtrj (Materials Project relaxation trajectories)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "MIT",
    licenseName: "MIT",
    licenseUrl: "https://github.com/ACEsuit/mace/blob/main/MIT.md",
    licenseNotice: "MIT licensed — commercial use permitted.",
    commercialUsePermitted: true,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 133.8,
    cpuMsPerAtom: 6.16,
    relativeCost: 7.7,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "bulk materials"],
    notes: ["133.8 MB — the slowest cold start in the catalog. On a Space that sleeps, the first request after a wake pays the whole download."],
  },
  {
    modelType: "MACE-MP-0b3",
    modelSize: "medium",
    family: "MACE-MP",
    displayName: "MACE-MP-0b3 (medium)",
    description: "Third revision of MACE-MP-0. Same MPtrj data and same 89 elements, retrained with improved handling of short-range repulsion and isolated atoms — noticeably better behaved than 0 on distorted or high-pressure geometries.",
    levelOfTheory: "PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
    trainingDataset: "MPtrj (Materials Project relaxation trajectories)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "MIT",
    licenseName: "MIT",
    licenseUrl: "https://github.com/ACEsuit/mace/blob/main/MIT.md",
    licenseNotice: "MIT licensed — commercial use permitted.",
    commercialUsePermitted: true,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 79.5,
    cpuMsPerAtom: 4.35,
    relativeCost: 5.4,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "distorted or compressed structures"],
    notes: ["Upstream ships the URL under the mace_mp_0b3 release tag and names no separate paper for it; the citation shown is mace_mp()'s own."],
  },
  {
    modelType: "MACE-MPA-0",
    modelSize: "medium",
    family: "MACE-MP",
    displayName: "MACE-MPA-0 (medium)",
    description: "MPtrj plus the sub-sampled Alexandria dataset. This is what upstream's mace_mp() loads when no model is named, and the best general-purpose MIT-licensed materials model in this catalog.",
    levelOfTheory: "PBE / PBE+U (GGA-DFT, VASP)",
    trainingDataset: "MPtrj + sAlex (sub-sampled Alexandria)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "MIT",
    licenseName: "MIT",
    licenseUrl: "https://github.com/ACEsuit/mace/blob/main/MIT.md",
    licenseNotice: "MIT licensed — commercial use permitted.",
    commercialUsePermitted: true,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 79.5,
    cpuMsPerAtom: 3.98,
    relativeCost: 4.9,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "bulk materials", "general-purpose materials work"],
    notes: ["SILENT-FALLBACK TRAP: this is the checkpoint upstream returns for `mace_mp(model=None)` — download_mace_mp_checkpoint() defaults to mace_mp_urls['medium-mpa-0'] (foundations_models.py:55). A caller that passes None gets MPA-0 weights while believing it asked for MACE-MP-0 medium. build_calculator() always passes an explicit model string, never None."],
  },
  {
    modelType: "MACE-OMAT-0",
    modelSize: "small",
    family: "MACE-MP",
    displayName: "MACE-OMAT-0 (small)",
    description: "Trained on Meta's OMat24 dataset — far larger and more diverse in off-equilibrium geometries than MPtrj. Non-commercial licence.",
    levelOfTheory: "PBE (GGA-DFT, VASP; OMat24 protocol)",
    trainingDataset: "OMat24 (Open Materials 2024)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 67.6,
    cpuMsPerAtom: 1.44,
    relativeCost: 1.8,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "off-equilibrium geometries"],
    notes: ["ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s ASL_checkpoint_urls set (foundations_models.py:64-69).", "OMat24's DFT protocol is PBE-based and close to, but not identical with, the Materials Project PBE+U settings behind MPtrj. Do not put MACE-OMAT-0 and MACE-MP-0 energies on one scale."],
  },
  {
    modelType: "MACE-OMAT-0",
    modelSize: "medium",
    family: "MACE-MP",
    displayName: "MACE-OMAT-0 (medium)",
    description: "The larger OMat24 model — the most accurate materials model in this catalog on Matbench Discovery. Non-commercial licence.",
    levelOfTheory: "PBE (GGA-DFT, VASP; OMat24 protocol)",
    trainingDataset: "OMat24 (Open Materials 2024)",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 79.5,
    cpuMsPerAtom: 4.15,
    relativeCost: 5.2,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "off-equilibrium geometries"],
    notes: ["ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s ASL_checkpoint_urls set (foundations_models.py:64-69).", "OMat24's DFT protocol is PBE-based and close to, but not identical with, the Materials Project PBE+U settings behind MPtrj. Do not put MACE-OMAT-0 and MACE-MP-0 energies on one scale."],
  },
  {
    modelType: "MACE-MATPES-PBE-0",
    modelSize: "medium",
    family: "MACE-MP",
    displayName: "MACE-MATPES-PBE-0 (medium)",
    description: "OMat24-pretrained, fine-tuned on the MATPES PBE static dataset. MATPES is a consistent single-point dataset rather than a set of relaxation trajectories, which makes it better behaved for finite-temperature and off-equilibrium work. Non-commercial licence.",
    levelOfTheory: "PBE (GGA-DFT, VASP; MATPES protocol, no Hubbard U)",
    trainingDataset: "MATPES-PBE, fine-tuned from an OMat24-pretrained model",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 79.5,
    cpuMsPerAtom: 3.96,
    relativeCost: 4.9,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "finite-temperature materials work"],
    notes: ["ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s ASL_checkpoint_urls set (foundations_models.py:64-69).", "The 'fine-tuned from OMat24' claim is read off upstream's own filename, MACE-matpes-pbe-omat-ft.model, not from a paper."],
  },
  {
    modelType: "MACE-MATPES-R2SCAN-0",
    modelSize: "medium",
    family: "MACE-MP",
    displayName: "MACE-MATPES-r2SCAN-0 (medium)",
    description: "OMat24-pretrained, fine-tuned on the MATPES r2SCAN static dataset. The only meta-GGA model in this catalog: r2SCAN corrects much of PBE's systematic overbinding. Non-commercial licence.",
    levelOfTheory: "r2SCAN (meta-GGA DFT, VASP; MATPES protocol)",
    trainingDataset: "MATPES-r2SCAN, fine-tuned from an OMat24-pretrained model",
    energyReferenceNote: "Total energy on the VASP/Materials-Project reference scale, referenced to isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float32",
    dispersionSupported: true,
    dispersionNote: "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, so `mace_mp(dispersion=True)` adds a real missing physical contribution via TorchDFTD3Calculator. torch-dftd is a separate distribution from mace-torch — see require_dispersion_backend() in calculate.py.",
    elementCount: 89,
    elementSymbols: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Ac", "Th", "Pa", "U", "Np", "Pu"],
    checkpointMB: 79.5,
    cpuMsPerAtom: 3.77,
    relativeCost: 4.7,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["crystals", "surfaces", "cases where PBE overbinding is the problem"],
    notes: ["ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s ASL_checkpoint_urls set (foundations_models.py:64-69).", "DIFFERENT LEVEL OF THEORY, THEREFORE A DIFFERENT ENERGY ZERO. r2SCAN total energies are not on the PBE scale: an r2SCAN energy must never be differenced against a PBE one, and CLAUDE.md's 'MACE-MP-0 is PBE-level, ~0.1-0.5 eV/atom overbinding vs experiment' does not apply to this model.", "The 'fine-tuned from OMat24' claim is read off upstream's own filename, MACE-matpes-r2scan-omat-ft.model, not from a paper."],
  },
  {
    modelType: "MACE-OFF23",
    modelSize: "small",
    family: "MACE-OFF",
    displayName: "MACE-OFF23 (small)",
    description: "Smallest organic model, 4.5 A cutoff. The cheapest force call in the whole catalog and the right default for molecules on a free CPU tier.",
    levelOfTheory: "wB97M-D3(BJ)/def2-TZVPPD (range-separated hybrid DFT)",
    trainingDataset: "SPICE and related organic/biomolecular data — see arXiv:2312.15211 for the exact composition",
    energyReferenceNote: "Total energy on the wB97M-D3(BJ)/def2-TZVPPD all-electron scale: hugely negative and strongly composition-dependent (H -13.57, O -2043.93, Br -70045.28 eV per free atom). Water is ~-693 eV/atom, bromobenzene ~-6000 eV/atom. Use expected_energy_range() rather than a fixed band, and never compare with a MACE-MP energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float64",
    dispersionSupported: false,
    dispersionNote: "D3 must NOT be added. MACE-OFF23 is trained on wB97M-D3(BJ) reference data, so dispersion is already inside the model, and upstream's mace_off() has no `dispersion` parameter at all. Enabling it would double-count.",
    elementCount: 10,
    elementSymbols: ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"],
    checkpointMB: 7.3,
    cpuMsPerAtom: 0.81,
    relativeCost: 1.0,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["organic molecules", "drug-like molecules", "biomolecules"],
    notes: ["Cutoff radius r_max = 4.5 A (read off the checkpoint)."],
  },
  {
    modelType: "MACE-OFF23",
    modelSize: "medium",
    family: "MACE-OFF",
    displayName: "MACE-OFF23 (medium)",
    description: "The recommended MACE-OFF23 model: 5.0 A cutoff, ~1.4M parameters, a good accuracy/cost balance for drug-like molecules.",
    levelOfTheory: "wB97M-D3(BJ)/def2-TZVPPD (range-separated hybrid DFT)",
    trainingDataset: "SPICE and related organic/biomolecular data — see arXiv:2312.15211 for the exact composition",
    energyReferenceNote: "Total energy on the wB97M-D3(BJ)/def2-TZVPPD all-electron scale: hugely negative and strongly composition-dependent (H -13.57, O -2043.93, Br -70045.28 eV per free atom). Water is ~-693 eV/atom, bromobenzene ~-6000 eV/atom. Use expected_energy_range() rather than a fixed band, and never compare with a MACE-MP energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float64",
    dispersionSupported: false,
    dispersionNote: "D3 must NOT be added. MACE-OFF23 is trained on wB97M-D3(BJ) reference data, so dispersion is already inside the model, and upstream's mace_off() has no `dispersion` parameter at all. Enabling it would double-count.",
    elementCount: 10,
    elementSymbols: ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"],
    checkpointMB: 18.4,
    cpuMsPerAtom: 3.29,
    relativeCost: 4.1,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["organic molecules", "drug-like molecules", "biomolecules"],
    notes: ["Cutoff radius r_max = 5.0 A (read off the checkpoint)."],
  },
  {
    modelType: "MACE-OFF23",
    modelSize: "large",
    family: "MACE-OFF",
    displayName: "MACE-OFF23 (large)",
    description: "Most accurate organic model, 5.0 A cutoff, ~4.7M parameters. Also the most expensive force call offered — see the note.",
    levelOfTheory: "wB97M-D3(BJ)/def2-TZVPPD (range-separated hybrid DFT)",
    trainingDataset: "SPICE and related organic/biomolecular data — see arXiv:2312.15211 for the exact composition",
    energyReferenceNote: "Total energy on the wB97M-D3(BJ)/def2-TZVPPD all-electron scale: hugely negative and strongly composition-dependent (H -13.57, O -2043.93, Br -70045.28 eV per free atom). Water is ~-693 eV/atom, bromobenzene ~-6000 eV/atom. Use expected_energy_range() rather than a fixed band, and never compare with a MACE-MP energy.",
    license: "ASL",
    licenseName: "Academic Software License (ASL)",
    licenseUrl: "https://github.com/gabor1/ASL",
    licenseNotice: "Academic Software License (ASL). ASL is based on the GNU Public License but does NOT permit commercial use. Using this model means accepting the terms of the licence — see https://github.com/gabor1/ASL",
    commercialUsePermitted: false,
    upstreamDefaultDtype: "float64",
    dispersionSupported: false,
    dispersionNote: "D3 must NOT be added. MACE-OFF23 is trained on wB97M-D3(BJ) reference data, so dispersion is already inside the model, and upstream's mace_off() has no `dispersion` parameter at all. Enabling it would double-count.",
    elementCount: 10,
    elementSymbols: ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"],
    checkpointMB: 55.5,
    cpuMsPerAtom: 12.35,
    relativeCost: 15.3,
    costNote: "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the MEASUREMENTS block in this module's docstring.",
    recommendedFor: ["organic molecules", "drug-like molecules", "biomolecules"],
    notes: ["Cutoff radius r_max = 5.0 A (read off the checkpoint).", "15.3x the cost of MACE-OFF23 small: ~1.2 s per force call for a 100-atom molecule on 2 vCPU, so a 500-step BFGS relaxation is ~10 minutes of wall clock. Fine for single-point, marginal for MD."],
  },
];

/** Distinct model families in catalog order, for the picker's top-level choice. */
export const MODEL_FAMILIES: string[] = Array.from(
  new Set(MODEL_CATALOG.map((m) => m.modelType)),
);

/** All catalog entries for a given family (modelType), in size order. */
export function sizesForFamily(modelType: string): ModelCatalogEntry[] {
  const order: Record<string, number> = { small: 0, medium: 1, large: 2 };
  return MODEL_CATALOG.filter((m) => m.modelType === modelType).sort(
    (a, b) => order[a.modelSize] - order[b.modelSize],
  );
}

/** The single catalog entry for a family + size, or undefined if that combination does not exist. */
export function catalogEntry(
  modelType: string,
  modelSize: string,
): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find(
    (m) => m.modelType === modelType && m.modelSize === modelSize,
  );
}

