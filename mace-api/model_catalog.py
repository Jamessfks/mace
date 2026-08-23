"""
MACE foundation-model catalog — the single source of truth for which models
SimpleAtom offers, and what is true about each of them.

Nothing else in the backend should carry a hardcoded model name, element list,
licence, dtype default or energy band. `calculate.py` asks this module; the
front-end renders `list_models()`; the validator reads the energy bands from
the resolved entry.

────────────────────────────────────────────────────────────────────────────
GROUND TRUTH
────────────────────────────────────────────────────────────────────────────
Every claim below was read out of the *installed* mace-torch 0.3.15 —
`mace/calculators/foundations_models.py` and `mace/calculators/mace.py` — or
measured on this machine. Not from readthedocs, which documents models this
version does not ship (see REFUSED, below). `verify_against_upstream()` and
mace-api/test_model_catalog.py re-check the machine-checkable parts against
the installed source every time they run, so this file cannot silently rot
past a mace-torch upgrade.

Upstream exposes exactly four foundation-model loaders
(`mace/calculators/__init__.py`):

    mace_mp(model=...)     16 named checkpoints in `mace_mp_urls`
    mace_off(model=...)    accepts ONLY "small" | "medium" | "large"
    mace_anicc()           one bundled/downloaded checkpoint, no `model=` arg
    mace_omol(model=...)   one checkpoint, "extra_large"

(`mace_mp_names` has 17 entries because it is `[None] + list(mace_mp_urls)`.
`None` is not a model; see the SILENT-FALLBACK TRAP note on `mace_mp` below.)

────────────────────────────────────────────────────────────────────────────
WHAT SIMPLEATOM OFFERS, AND WHY
────────────────────────────────────────────────────────────────────────────
Deployment target: a free Hugging Face Space — 2 vCPU, 16 GB RAM, no GPU.
That is the constraint that decides most of this list. A model that cannot
finish a force call in a usable time on two cores is not an option a free,
no-sign-in web front-end should present; offering it just moves the failure
from "not in the menu" to "the tab hung".

Inclusion rule, applied uniformly:

  (1) it is the current release of a *distinct* training line, or a size tier
      within one — a variant that differs from another offered model only by
      revision number adds a 70-130 MB cold-start download and a menu entry
      without adding any capability;
  (2) it runs on 2 vCPU (measured, see MEASUREMENTS);
  (3) its level of theory, dataset and licence can be stated truthfully from
      the installed source or the checkpoint itself. If SimpleAtom cannot say
      what a model was trained on, it must not offer it — the energy-reference
      convention is not a cosmetic label, it is what the result validator uses
      to decide whether a number is physical.

OFFERED (12 entries, 7 families):

  MACE-MP-0             small / medium / large   MIT   PBE+U · MPtrj
  MACE-MP-0b3           medium                   MIT   PBE+U · MPtrj
  MACE-MPA-0            medium                   MIT   PBE+U · MPtrj + sAlex
  MACE-OMAT-0           small / medium           ASL   PBE · OMat24
  MACE-MATPES-PBE-0     medium                   ASL   PBE · MATPES
  MACE-MATPES-R2SCAN-0  medium                   ASL   r2SCAN · MATPES
  MACE-OFF23            small / medium / large   ASL   wB97M-D3(BJ) · SPICE
  (MACE-OFF is kept as an alias of MACE-OFF23 — it is what the existing UI,
   every shared MACE Link and lib/mlpeg-catalog.ts already send.)

REFUSED, and the grounds:

  mace_anicc  (CCSD(T)/ANI-500k, MIT, 35.6 MB)
      MEASURED FAILURE, not a judgement call. The checkpoint cannot be
      deserialised at all on a CPU-only host with this torch build:

          e3nn/util/codegen/_mixin.py:109  __setstate__ -> torch.jit.load(buffer)
          NotImplementedError: Could not run 'aten::empty_strided' with
          arguments from the 'CUDA' backend

      `torch.load(map_location="cpu")` does not reach the inner TorchScript
      archive — e3nn's `__setstate__` calls `torch.jit.load()` with no
      map_location, so the CUDA device baked into that archive wins. Verified
      not to be a corrupt download: the file is a valid zip, and a second
      fetch reproduced SHA256 7ad311c5…9e07b69d byte for byte. It fails the
      same way through `mace_anicc(device="cpu")` and through a direct
      `torch.load`. A CCSD(T)-quality H/C/N/O model would have been a genuinely
      useful addition; it simply does not run on the deployment target.

  mace_omol  "extra_large"  (ASL, 422.2 MB, 1024 channels)
      See MEASUREMENTS. Excluded on measured size and cost.

  small-0b, medium-0b, small-0b2, medium-0b2, large-0b2
      Same training line as MACE-MP-0 (MPtrj, PBE+U), same 89 elements,
      superseded within that line by medium-0b3 and MACE-MPA-0 — upstream's
      own default moved past them. Five extra menu entries and ~390 MB of
      extra cold-start download for no new capability. The one real
      difference, that 0b2 was trained on stress, does not reach SimpleAtom:
      `_run_geometry_opt` relaxes atomic positions only and never varies the
      cell, so nothing here consumes a better-trained stress.

  mh-0, mh-1
      MEASURED FAILURE through upstream's own loader, plus rule (3).
      `mace_mp(model="mh-0")` raises immediately:

          ValueError: Head keyword was not provided, and no head in the model
          is 'default'. Please provide a head keyword ...

      These are MULTI-HEAD models ("mh"). Read off the checkpoints:

          mh-0  39.9 MB   9.08M params   89 elements   7 heads
                ['rgd1_b3lyp', 'matpes_r2scan', 'mp_pbe_refit_add', 'omol',
                 'spice_wB97M', 'oc20_usemppbe', 'omat_pbe']
          mh-1  59.2 MB   6.44M params   89 elements   6 heads (no rgd1_b3lyp)

      Their `atomic_energies` are (7, 89) and (6, 89) — one isolated-atom
      reference row PER HEAD. So the level of theory, the energy zero and the
      answer itself all depend on a `head=` argument that `mace_mp()` does not
      expose as a documented parameter, does not default, and says nothing
      about. There is no single true "level of theory" or energy band to put
      in a catalog entry for these, and the installed source documents neither
      the heads nor a recommended one. Offering them would mean inventing both
      a head-selection UI and the provenance strings to go with it.

  MACE-OFF24, mace_mdp, and the rest of the readthedocs list
      Not in this version. `mace_off()` hard-codes three URLs, all pointing at
      `mace_off23/MACE-OFF23_{small,medium,large}.model`; the string "off24"
      does not occur anywhere in the installed package, and neither does
      "mace_mdp". `resolve_model()` rejects them by name with that explanation
      rather than with a generic "unknown model".

────────────────────────────────────────────────────────────────────────────
MEASUREMENTS  (this machine, 2026-08-23; mace-torch 0.3.15, torch 2.x, CPU)
────────────────────────────────────────────────────────────────────────────
Sizes are exact `Content-Length` values from the release URLs, not estimates.

Force-call cost was timed with `torch.set_num_threads(2)` to stand in for the
2-vCPU Space, in float64, on a 243-atom cluster of 27 ethanol molecules — one
probe both model families cover, so the numbers are comparable across
families. Median of 3 calls; positions perturbed by 1e-4 A between calls,
because ASE's `Calculator` returns a cached result for an unchanged geometry
and a first attempt without the perturbation "measured" 0.1 ms per call.

    model                     MB      ms/atom   relative
    MACE-OFF23 small           7.3      0.81      1.0x   <- cheapest offered
    MACE-MP-0 small           32.6      1.34      1.7x
    MACE-OMAT-0 small         67.6      1.44      1.8x
    MACE-OFF23 medium         18.4      3.29      4.1x
    MACE-MP-0 medium          44.4      3.77      4.7x
    MACE-MATPES-R2SCAN-0      79.5      3.77      4.7x
    MACE-MATPES-PBE-0         79.5      3.96      4.9x
    MACE-MPA-0 medium         79.5      3.98      4.9x
    MACE-OMAT-0 medium        79.5      4.15      5.2x
    MACE-MP-0b3 medium        79.5      4.35      5.4x
    MACE-MP-0 large          133.8      6.16      7.7x
    MACE-OFF23 large          55.5     12.35     15.3x   <- dearest offered
    ---- not offered ----
    mace_omol extra_large    422.2     16.64     20.7x

A 100-atom system at 12.35 ms/atom is ~1.2 s per force call, so a 500-step
BFGS relaxation with MACE-OFF23 large is ~10 minutes of wall clock on two
cores. That is the top of what this deployment can carry, and it is why every
entry publishes `cpuMsPerAtom` — the front-end can multiply by the atom count
and warn before the user commits.

`mace_omol` extra_large was downloaded and timed rather than assumed:
422.2 MB, 52,365,482 parameters (3.3x MACE-MP-0 large's 15.8M), 83 elements
(Z = 1-83), a single pinned `head="omol"`, and 16.64 ms/atom — 20.7x the
cheapest model offered and 35% dearer than the dearest one already at the
edge. ~1.7 s per force call for a 100-atom molecule. Combined with a 422 MB
fetch that a Space with ephemeral disk must repeat on every cold start, before
the first force call returns, this is not something a free no-sign-in tier can
present honestly. Excluded on those measured grounds, not on a guess.

────────────────────────────────────────────────────────────────────────────
ENERGY BANDS
────────────────────────────────────────────────────────────────────────────
Two bands per entry, because one number cannot do both jobs:

  plausibleEnergyRange  outside this, the result is *wrong* — the wrong model,
                        a mislabelled reference, an exploded structure. Safe
                        for a validator to fail on.
  typicalEnergyRange    inside this is unremarkable; outside is "worth a
                        second look". Advisory only, and `None` where no
                        composition-agnostic typical range is honest.

Both are derived from the isolated-atom reference energies (E0) read off the
checkpoints, not assumed:

  MACE-MP family   measured E0 span [-18.5175 (Gd), +9.8467 (Xe)] eV.
      CLAUDE.md quotes -1 to -15 eV/atom for MACE-MP-0. That is the right
      *typical* range and it is kept as `typicalEnergyRange`, but it is
      measurably too narrow to fail on at both ends: Gd sits 3.5 eV below the
      floor before any binding energy is added, and solid Xe is *positive*.
      The plausible band is min(E0) minus the largest elemental cohesive
      energy (~9 eV/atom, W) and max(E0) plus a few eV of slack for a
      compressed geometry, rounded out to (-30, +15).

  MACE-OFF23       measured E0 span [-70045.2839 (Br), -13.5720 (H)] eV,
      bit-identical across small, medium and large (checked).
      CLAUDE.md's -100 to -600 eV/atom is NOT usable as a fail band, and this
      is not a rounding issue. Water is already outside it: its E0 mean alone
      is (2*-13.5720 + -2043.9337)/3 = -690.36 eV/atom, and the measured
      MACE-OFF23 small energy is more negative still. Bromobenzene is near
      -6000 eV/atom. So `typicalEnergyRange` is deliberately `None` here, and
      the composition-aware `expected_energy_range()` — which uses the E0
      table embedded below — is the band a validator should actually use. A
      "typical" band that rejects water would be worse than no band at all.
      The composition-agnostic plausible band, (-71000, -10), still does the
      one job it can do: it catches a MACE-MP number wearing a MACE-OFF label.

────────────────────────────────────────────────────────────────────────────
SECURITY BOUNDARY
────────────────────────────────────────────────────────────────────────────
Same reasoning as `SUPPORTED_CALCULATION_TYPES` in calculate.py. The API can
be POSTed to directly, so the front-end's dropdown is not a check. There is no
fall-through branch anywhere in this module: an unrecognised (modelType,
modelSize) raises, and `build_calculator()` re-checks the element coverage of
the checkpoint it actually loaded against the coverage this file advertises.
A request that reaches a different model's weights than the one named in
`result["params"]` produces numbers that are then shared via MACE Link and
exported to PDF under the wrong attribution — that is the failure this module
exists to make impossible.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

# Bumped when the shape of `ModelEntry.to_dict()` changes, so a front-end or a
# stored MACE Link can tell whether it is reading a catalog it understands.
CATALOG_SCHEMA_VERSION = 1

# The mace-torch release every claim in this file was read from. Not enforced
# at import (a patch bump should not take the site down) — `verify_against_
# upstream()` and the test suite compare against the installed package and
# report the drift.
VERIFIED_AGAINST_MACE_VERSION = "0.3.15"

# ── Loader names ────────────────────────────────────────────────────────────
# Stored as strings rather than function objects so an entry stays trivially
# JSON-serialisable for the front-end. `build_calculator()` maps them back to
# the real callables in one place, and `verify_against_upstream()` asserts each
# name still exists in `mace.calculators`.
LOADER_MACE_MP = "mace_mp"
LOADER_MACE_OFF = "mace_off"

_LOADERS = (LOADER_MACE_MP, LOADER_MACE_OFF)

# ── Licences ────────────────────────────────────────────────────────────────
# NOT uniform, and the difference is legal, not cosmetic. Read out of
# `download_mace_mp_checkpoint()` (foundations_models.py:64-73), which builds
# an explicit `ASL_checkpoint_urls` set containing exactly the two omat-0 and
# the two matpes checkpoints and prints an acceptance notice for them; and out
# of the `mace_off()` docstring and download banner, which say ASL for all of
# MACE-OFF23. Everything else `mace_mp()` serves is MIT per its own docstring.
#
# Upstream only prints that notice on FIRST download — once the checkpoint is
# in the cache the user never sees it again, and on a Space the cache is warm
# for everyone after the first visitor. Carrying the licence in the catalog is
# how the UI can show it every time.
LICENSE_MIT = "MIT"
LICENSE_ASL = "ASL"

_LICENSE_INFO: dict[str, dict[str, Any]] = {
    LICENSE_MIT: {
        "name": "MIT",
        "url": "https://github.com/ACEsuit/mace/blob/main/MIT.md",
        "commercialUsePermitted": True,
        "notice": "MIT licensed — commercial use permitted.",
    },
    LICENSE_ASL: {
        "name": "Academic Software License (ASL)",
        "url": "https://github.com/gabor1/ASL",
        "commercialUsePermitted": False,
        # Wording taken from upstream's own banner so the UI says the same
        # thing the library says.
        "notice": (
            "Academic Software License (ASL). ASL is based on the GNU Public "
            "License but does NOT permit commercial use. Using this model "
            "means accepting the terms of the licence — see "
            "https://github.com/gabor1/ASL"
        ),
    },
}

# ── Element coverage ────────────────────────────────────────────────────────
# Read off `model.atomic_numbers` of the downloaded checkpoints, not copied
# from a paper. Hardcoded here so the catalog is readable — and an element
# rejection can be issued — with nothing downloaded; `build_calculator()`
# re-checks these against the real z_table of whatever it just loaded.

# MACE-MP: the "89 elements" of MACE-MP-0. Z = 1..83 and 89..94; Po(84),
# At(85), Rn(86), Fr(87) and Ra(88) are absent. Identical in the small, medium
# and large checkpoints.
_MACE_MP_ELEMENTS: tuple[int, ...] = tuple(range(1, 84)) + tuple(range(89, 95))

# MACE-OFF23: the ten organic elements.
_MACE_OFF_ELEMENTS: tuple[int, ...] = (1, 6, 7, 8, 9, 15, 16, 17, 35, 53)

# ── Isolated-atom reference energies (E0), eV ───────────────────────────────
# Read off MACE-OFF23_small.model and confirmed bit-identical in the medium
# and large checkpoints. These are what make MACE-OFF's -100..-600 eV/atom
# folklore band wrong for anything containing P, S, Cl, Br or I — and for
# water. `expected_energy_range()` uses them to produce a band that is both
# tight and correct.
#
# No equivalent table is embedded for the MACE-MP family. It would be 89
# floats per variant, seven variants, all slightly different (MACE-MP-0 small
# and medium give Gd = -18.5175, large gives -18.5381) — 600-odd hand-copied
# numbers that would drift silently. The MACE-MP band is narrow enough without
# one; the MACE-OFF band is useless without one. That asymmetry is the reason
# for the asymmetry here.
_MACE_OFF23_ATOMIC_ENERGIES_EV: dict[int, float] = {
    1: -13.571964772646918,
    6: -1030.5671648271828,
    7: -1486.3750255780376,
    8: -2043.933693071156,
    9: -2715.318528602957,
    15: -9287.407133426237,
    16: -10834.4844708122,
    17: -12522.649269035726,
    35: -70045.28385080204,
    53: -8102.524593409054,
}

# How far below the free-atom reference a real structure can plausibly sit.
# The largest elemental cohesive energy is tungsten's ~8.9 eV/atom; strongly
# bound covalent networks (diamond ~7.4 eV/atom) are below that. -10.0 leaves
# headroom without becoming vacuous.
_MAX_COHESIVE_EV_PER_ATOM = 10.0
# How far above it a badly clashing or heavily compressed geometry can sit
# before the number stops being physics. Deliberately generous: a single-point
# on a strained structure is a normal thing to ask MACE for.
_MAX_REPULSIVE_EV_PER_ATOM = 10.0


@dataclass(frozen=True)
class ModelEntry:
    """
    One offered (modelType, modelSize) pair, and everything true about it.

    Frozen because this is a catalog, not state: a caller that mutates an entry
    would be changing what SimpleAtom claims about a model for every subsequent
    request in the process.
    """

    # ── identity ────────────────────────────────────────────────────────────
    model_type: str          # canonical modelType, e.g. "MACE-OFF23"
    model_size: str          # "small" | "medium" | "large"
    family: str              # "MACE-MP" | "MACE-OFF" — groups the UI
    display_name: str
    description: str

    # ── exactly how to build it ─────────────────────────────────────────────
    loader: str              # LOADER_MACE_MP | LOADER_MACE_OFF
    loader_model_arg: str    # the exact string handed to the loader as model=

    # ── what it knows ───────────────────────────────────────────────────────
    elements: tuple[int, ...]
    level_of_theory: str
    training_dataset: str
    energy_reference_note: str

    # ── legal ───────────────────────────────────────────────────────────────
    license_id: str          # LICENSE_MIT | LICENSE_ASL

    # ── how to run it ───────────────────────────────────────────────────────
    upstream_default_dtype: str   # what the upstream loader defaults to
    dispersion_supported: bool
    dispersion_note: str

    # ── what it costs ───────────────────────────────────────────────────────
    checkpoint_bytes: int | None
    cpu_ms_per_atom: float | None      # measured, 2 threads, float64
    relative_cost: float | None        # MACE-OFF23 small == 1.0
    cost_note: str

    # ── how to judge its output ─────────────────────────────────────────────
    plausible_energy_range: tuple[float, float]
    typical_energy_range: tuple[float, float] | None
    atomic_energies_ev: Mapping[int, float] | None

    # ── attribution ─────────────────────────────────────────────────────────
    citation: tuple[str, ...]

    recommended_for: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()

    @property
    def key(self) -> str:
        """Stable identifier, e.g. "MACE-OFF23/small". Safe to persist."""
        return f"{self.model_type}/{self.model_size}"

    @property
    def element_symbols(self) -> tuple[str, ...]:
        return tuple(_symbol(z) for z in self.elements)

    @property
    def license_info(self) -> dict[str, Any]:
        return dict(_LICENSE_INFO[self.license_id])

    @property
    def checkpoint_mb(self) -> float | None:
        if self.checkpoint_bytes is None:
            return None
        return round(self.checkpoint_bytes / 1e6, 1)

    def covers(self, atomic_number: int) -> bool:
        return int(atomic_number) in self.elements

    def to_dict(self) -> dict[str, Any]:
        """
        JSON-serialisable view, camelCase to match `types/mace.ts` and the
        camelCase keys `_build_result()` already echoes into result["params"].

        `elementSymbols` is included as well as `elements` so the front-end
        never has to own its own Z-to-symbol table — two tables always drift.
        """
        lic = _LICENSE_INFO[self.license_id]
        return {
            "key": self.key,
            "modelType": self.model_type,
            "modelSize": self.model_size,
            "family": self.family,
            "displayName": self.display_name,
            "description": self.description,
            "loader": self.loader,
            "loaderModelArg": self.loader_model_arg,
            "elements": list(self.elements),
            "elementSymbols": list(self.element_symbols),
            "elementCount": len(self.elements),
            "levelOfTheory": self.level_of_theory,
            "trainingDataset": self.training_dataset,
            "energyReferenceNote": self.energy_reference_note,
            "license": self.license_id,
            "licenseName": lic["name"],
            "licenseUrl": lic["url"],
            "licenseNotice": lic["notice"],
            "commercialUsePermitted": lic["commercialUsePermitted"],
            "upstreamDefaultDtype": self.upstream_default_dtype,
            "dispersionSupported": self.dispersion_supported,
            "dispersionNote": self.dispersion_note,
            "checkpointBytes": self.checkpoint_bytes,
            "checkpointMB": self.checkpoint_mb,
            "cpuMsPerAtom": self.cpu_ms_per_atom,
            "relativeCost": self.relative_cost,
            "costNote": self.cost_note,
            "plausibleEnergyRange": list(self.plausible_energy_range),
            "typicalEnergyRange": (
                list(self.typical_energy_range) if self.typical_energy_range else None
            ),
            "hasAtomicEnergyTable": self.atomic_energies_ev is not None,
            "citation": list(self.citation),
            "recommendedFor": list(self.recommended_for),
            "notes": list(self.notes),
        }


# ────────────────────────────────────────────────────────────────────────────
# Shared strings. Written once so two entries in the same family cannot end up
# claiming subtly different things about the same training data.
# ────────────────────────────────────────────────────────────────────────────

_MP_CITATION = (
    # Verbatim from the mace_mp() docstring (foundations_models.py:118-126).
    # Upstream names no separate paper for the 0b3 / MPA-0 / OMAT-0 / MATPES
    # variants, so they carry this same set; where that is all upstream says,
    # the entry's notes say so rather than inventing a reference.
    "MACE-MP: Batatia, Benner, Chiang, Elena, Kovács, Riebesell et al., 2023, arXiv:2401.00096",
    "MACE-Universal: Chiang, 2023, Hugging Face, rev. e5ebd9b, DOI 10.57967/hf/1202",
    "Matbench Discovery: Riebesell, Goodall, Benner, Chiang, Lee, Jain, Persson, 2023, arXiv:2308.14920",
)

_OFF_CITATION = (
    # As given by the mace_off() docstring (foundations_models.py:217), which
    # says only "the relevant paper by Kovacs et.al., arXiv:2312.15211". The
    # full author list is deliberately not expanded here: it is not in the
    # installed source, and every other field in this file is something the
    # source or a checkpoint actually says.
    "MACE-OFF23: Kovács et al., 2023, arXiv:2312.15211",
)

_MP_DISPERSION_NOTE = (
    "D3 is meaningful here: MPtrj is plain PBE/PBE+U with no dispersion term, "
    "so `mace_mp(dispersion=True)` adds a real missing physical contribution "
    "via TorchDFTD3Calculator. torch-dftd is a separate distribution from "
    "mace-torch — see require_dispersion_backend() in calculate.py."
)

_OFF_DISPERSION_NOTE = (
    "D3 must NOT be added. MACE-OFF23 is trained on wB97M-D3(BJ) reference "
    "data, so dispersion is already inside the model, and upstream's "
    "mace_off() has no `dispersion` parameter at all. Enabling it would "
    "double-count."
)

_MP_ENERGY_REFERENCE = (
    "Total energy on the VASP/Materials-Project reference scale, referenced to "
    "isolated-atom E0 values spanning -18.52 eV (Gd) to +9.85 eV (Xe). "
    "Typically -1 to -15 eV/atom. NOT comparable with a MACE-OFF energy."
)

_OFF_ENERGY_REFERENCE = (
    "Total energy on the wB97M-D3(BJ)/def2-TZVPPD all-electron scale: hugely "
    "negative and strongly composition-dependent (H -13.57, O -2043.93, "
    "Br -70045.28 eV per free atom). Water is ~-693 eV/atom, bromobenzene "
    "~-6000 eV/atom. Use expected_energy_range() rather than a fixed band, "
    "and never compare with a MACE-MP energy."
)

_COST_NOTE = (
    "Measured on 2 CPU threads in float64 on a 243-atom cluster; see the "
    "MEASUREMENTS block in this module's docstring."
)


def _mp_entry(
    *,
    model_type: str,
    model_size: str,
    loader_model_arg: str,
    display_name: str,
    description: str,
    license_id: str,
    level_of_theory: str,
    training_dataset: str,
    checkpoint_bytes: int,
    cpu_ms_per_atom: float | None,
    relative_cost: float | None,
    recommended_for: tuple[str, ...],
    notes: tuple[str, ...] = (),
) -> ModelEntry:
    """Build a MACE-MP-family entry; only the per-variant facts are arguments."""
    return ModelEntry(
        model_type=model_type,
        model_size=model_size,
        family="MACE-MP",
        display_name=display_name,
        description=description,
        loader=LOADER_MACE_MP,
        loader_model_arg=loader_model_arg,
        elements=_MACE_MP_ELEMENTS,
        level_of_theory=level_of_theory,
        training_dataset=training_dataset,
        energy_reference_note=_MP_ENERGY_REFERENCE,
        license_id=license_id,
        # foundations_models.py:107 — `mace_mp(..., default_dtype: str = "float32")`.
        upstream_default_dtype="float32",
        dispersion_supported=True,
        dispersion_note=_MP_DISPERSION_NOTE,
        checkpoint_bytes=checkpoint_bytes,
        cpu_ms_per_atom=cpu_ms_per_atom,
        relative_cost=relative_cost,
        cost_note=_COST_NOTE,
        plausible_energy_range=(-30.0, 15.0),
        typical_energy_range=(-15.0, -1.0),
        atomic_energies_ev=None,
        citation=_MP_CITATION,
        recommended_for=recommended_for,
        notes=notes,
    )


def _off_entry(
    *,
    model_size: str,
    display_name: str,
    description: str,
    checkpoint_bytes: int,
    cpu_ms_per_atom: float,
    relative_cost: float,
    r_max: float,
    notes: tuple[str, ...] = (),
) -> ModelEntry:
    """Build a MACE-OFF23 entry."""
    return ModelEntry(
        model_type="MACE-OFF23",
        model_size=model_size,
        family="MACE-OFF",
        display_name=display_name,
        description=description,
        loader=LOADER_MACE_OFF,
        loader_model_arg=model_size,
        elements=_MACE_OFF_ELEMENTS,
        level_of_theory="wB97M-D3(BJ)/def2-TZVPPD (range-separated hybrid DFT)",
        training_dataset=(
            "SPICE and related organic/biomolecular data — see arXiv:2312.15211 "
            "for the exact composition"
        ),
        energy_reference_note=_OFF_ENERGY_REFERENCE,
        license_id=LICENSE_ASL,
        # foundations_models.py:209 — `mace_off(..., default_dtype: str = "float64")`.
        # Deliberately different from mace_mp's float32, and has been since
        # v0.3.6. calculate.py's upstream_default_precision() depends on this.
        upstream_default_dtype="float64",
        dispersion_supported=False,
        dispersion_note=_OFF_DISPERSION_NOTE,
        checkpoint_bytes=checkpoint_bytes,
        cpu_ms_per_atom=cpu_ms_per_atom,
        relative_cost=relative_cost,
        cost_note=_COST_NOTE,
        # Composition-agnostic: this band exists only to catch a MACE-MP number
        # wearing a MACE-OFF label. See the ENERGY BANDS block above for why
        # `typical_energy_range` is None here.
        plausible_energy_range=(-71000.0, -10.0),
        typical_energy_range=None,
        atomic_energies_ev=_MACE_OFF23_ATOMIC_ENERGIES_EV,
        citation=_OFF_CITATION,
        recommended_for=("organic molecules", "drug-like molecules", "biomolecules"),
        notes=(f"Cutoff radius r_max = {r_max} A (read off the checkpoint).",) + notes,
    )


# ────────────────────────────────────────────────────────────────────────────
# THE CATALOG
# ────────────────────────────────────────────────────────────────────────────

_ENTRIES: tuple[ModelEntry, ...] = (
    # ── MACE-MP-0 — the original MPtrj line, and SimpleAtom's historical
    # default. Kept in full: every result already shared through MACE Link and
    # every row in lib/mlpeg-catalog.ts was computed with one of these three,
    # and a catalog that dropped them would orphan those results.
    _mp_entry(
        model_type="MACE-MP-0",
        model_size="small",
        loader_model_arg="small",
        display_name="MACE-MP-0 (small)",
        description=(
            "The original Materials Project foundation model, L=0 / 128 channels. "
            "Cheapest 89-element option; use it for a first look, screening and MD."
        ),
        license_id=LICENSE_MIT,
        level_of_theory="PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
        training_dataset="MPtrj (Materials Project relaxation trajectories)",
        checkpoint_bytes=32_581_838,
        cpu_ms_per_atom=1.34,
        relative_cost=1.7,
        recommended_for=("crystals", "surfaces", "bulk materials", "quick screening"),
        notes=(
            "L=0 (invariant) model — cheaper than medium but less accurate for "
            "directional bonding.",
        ),
    ),
    _mp_entry(
        model_type="MACE-MP-0",
        model_size="medium",
        loader_model_arg="medium",
        display_name="MACE-MP-0 (medium)",
        description=(
            "The original Materials Project foundation model, L=1 / 128 channels. "
            "SimpleAtom's long-standing default for materials."
        ),
        license_id=LICENSE_MIT,
        level_of_theory="PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
        training_dataset="MPtrj (Materials Project relaxation trajectories)",
        checkpoint_bytes=44_422_970,
        cpu_ms_per_atom=3.77,
        relative_cost=4.7,
        recommended_for=("crystals", "surfaces", "bulk materials"),
    ),
    _mp_entry(
        model_type="MACE-MP-0",
        model_size="large",
        loader_model_arg="large",
        display_name="MACE-MP-0 (large)",
        description=(
            "The largest MACE-MP-0 checkpoint (MACE_MPtrj_2022.9, ~15.8M "
            "parameters). Most accurate of the original line, and the largest "
            "download in the MACE-MP menu."
        ),
        license_id=LICENSE_MIT,
        level_of_theory="PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
        training_dataset="MPtrj (Materials Project relaxation trajectories)",
        checkpoint_bytes=133_803_220,
        cpu_ms_per_atom=6.16,
        relative_cost=7.7,
        recommended_for=("crystals", "surfaces", "bulk materials"),
        notes=(
            "133.8 MB — the slowest cold start in the catalog. On a Space that "
            "sleeps, the first request after a wake pays the whole download.",
        ),
    ),
    # ── MACE-MP-0b3 — the last refinement of the MPtrj-only line. 0b and 0b2
    # are deliberately not offered (see REFUSED).
    _mp_entry(
        model_type="MACE-MP-0b3",
        model_size="medium",
        loader_model_arg="medium-0b3",
        display_name="MACE-MP-0b3 (medium)",
        description=(
            "Third revision of MACE-MP-0. Same MPtrj data and same 89 elements, "
            "retrained with improved handling of short-range repulsion and "
            "isolated atoms — noticeably better behaved than 0 on distorted or "
            "high-pressure geometries."
        ),
        license_id=LICENSE_MIT,
        level_of_theory="PBE / PBE+U (GGA-DFT, VASP, Materials Project settings)",
        training_dataset="MPtrj (Materials Project relaxation trajectories)",
        checkpoint_bytes=79_472_952,
        cpu_ms_per_atom=4.35,
        relative_cost=5.4,
        recommended_for=("crystals", "surfaces", "distorted or compressed structures"),
        notes=(
            "Upstream ships the URL under the mace_mp_0b3 release tag and names "
            "no separate paper for it; the citation shown is mace_mp()'s own.",
        ),
    ),
    # ── MACE-MPA-0 — upstream's own default since mace-torch 3.10.
    _mp_entry(
        model_type="MACE-MPA-0",
        model_size="medium",
        loader_model_arg="medium-mpa-0",
        display_name="MACE-MPA-0 (medium)",
        description=(
            "MPtrj plus the sub-sampled Alexandria dataset. This is what "
            "upstream's mace_mp() loads when no model is named, and the best "
            "general-purpose MIT-licensed materials model in this catalog."
        ),
        license_id=LICENSE_MIT,
        level_of_theory="PBE / PBE+U (GGA-DFT, VASP)",
        training_dataset="MPtrj + sAlex (sub-sampled Alexandria)",
        checkpoint_bytes=79_462_305,
        cpu_ms_per_atom=3.98,
        relative_cost=4.9,
        recommended_for=(
            "crystals",
            "surfaces",
            "bulk materials",
            "general-purpose materials work",
        ),
        notes=(
            "SILENT-FALLBACK TRAP: this is the checkpoint upstream returns for "
            "`mace_mp(model=None)` — download_mace_mp_checkpoint() defaults to "
            "mace_mp_urls['medium-mpa-0'] (foundations_models.py:55). A caller "
            "that passes None gets MPA-0 weights while believing it asked for "
            "MACE-MP-0 medium. build_calculator() always passes an explicit "
            "model string, never None.",
        ),
    ),
    # ── MACE-OMAT-0 — ASL. Different data, different DFT protocol.
    _mp_entry(
        model_type="MACE-OMAT-0",
        model_size="small",
        loader_model_arg="small-omat-0",
        display_name="MACE-OMAT-0 (small)",
        description=(
            "Trained on Meta's OMat24 dataset — far larger and more diverse in "
            "off-equilibrium geometries than MPtrj. Non-commercial licence."
        ),
        license_id=LICENSE_ASL,
        level_of_theory="PBE (GGA-DFT, VASP; OMat24 protocol)",
        training_dataset="OMat24 (Open Materials 2024)",
        checkpoint_bytes=67_630_500,
        cpu_ms_per_atom=1.44,
        relative_cost=1.8,
        recommended_for=("crystals", "surfaces", "off-equilibrium geometries"),
        notes=(
            "ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s "
            "ASL_checkpoint_urls set (foundations_models.py:64-69).",
            "OMat24's DFT protocol is PBE-based and close to, but not identical "
            "with, the Materials Project PBE+U settings behind MPtrj. Do not put "
            "MACE-OMAT-0 and MACE-MP-0 energies on one scale.",
        ),
    ),
    _mp_entry(
        model_type="MACE-OMAT-0",
        model_size="medium",
        loader_model_arg="medium-omat-0",
        display_name="MACE-OMAT-0 (medium)",
        description=(
            "The larger OMat24 model — the most accurate materials model in this "
            "catalog on Matbench Discovery. Non-commercial licence."
        ),
        license_id=LICENSE_ASL,
        level_of_theory="PBE (GGA-DFT, VASP; OMat24 protocol)",
        training_dataset="OMat24 (Open Materials 2024)",
        checkpoint_bytes=79_463_999,
        cpu_ms_per_atom=4.15,
        relative_cost=5.2,
        recommended_for=("crystals", "surfaces", "off-equilibrium geometries"),
        notes=(
            "ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s "
            "ASL_checkpoint_urls set (foundations_models.py:64-69).",
            "OMat24's DFT protocol is PBE-based and close to, but not identical "
            "with, the Materials Project PBE+U settings behind MPtrj. Do not put "
            "MACE-OMAT-0 and MACE-MP-0 energies on one scale.",
        ),
    ),
    # ── MATPES — the only way to get a non-PBE level of theory in SimpleAtom.
    _mp_entry(
        model_type="MACE-MATPES-PBE-0",
        model_size="medium",
        loader_model_arg="mace-matpes-pbe-0",
        display_name="MACE-MATPES-PBE-0 (medium)",
        description=(
            "OMat24-pretrained, fine-tuned on the MATPES PBE static dataset. "
            "MATPES is a consistent single-point dataset rather than a set of "
            "relaxation trajectories, which makes it better behaved for "
            "finite-temperature and off-equilibrium work. Non-commercial licence."
        ),
        license_id=LICENSE_ASL,
        level_of_theory="PBE (GGA-DFT, VASP; MATPES protocol, no Hubbard U)",
        training_dataset="MATPES-PBE, fine-tuned from an OMat24-pretrained model",
        checkpoint_bytes=79_471_284,
        cpu_ms_per_atom=3.96,
        relative_cost=4.9,
        recommended_for=("crystals", "surfaces", "finite-temperature materials work"),
        notes=(
            "ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s "
            "ASL_checkpoint_urls set (foundations_models.py:64-69).",
            "The 'fine-tuned from OMat24' claim is read off upstream's own "
            "filename, MACE-matpes-pbe-omat-ft.model, not from a paper.",
        ),
    ),
    _mp_entry(
        model_type="MACE-MATPES-R2SCAN-0",
        model_size="medium",
        loader_model_arg="mace-matpes-r2scan-0",
        display_name="MACE-MATPES-r2SCAN-0 (medium)",
        description=(
            "OMat24-pretrained, fine-tuned on the MATPES r2SCAN static dataset. "
            "The only meta-GGA model in this catalog: r2SCAN corrects much of "
            "PBE's systematic overbinding. Non-commercial licence."
        ),
        license_id=LICENSE_ASL,
        level_of_theory="r2SCAN (meta-GGA DFT, VASP; MATPES protocol)",
        training_dataset="MATPES-r2SCAN, fine-tuned from an OMat24-pretrained model",
        checkpoint_bytes=79_470_738,
        cpu_ms_per_atom=3.77,
        relative_cost=4.7,
        recommended_for=(
            "crystals",
            "surfaces",
            "cases where PBE overbinding is the problem",
        ),
        notes=(
            "ASL — non-commercial. Listed in download_mace_mp_checkpoint()'s "
            "ASL_checkpoint_urls set (foundations_models.py:64-69).",
            "DIFFERENT LEVEL OF THEORY, THEREFORE A DIFFERENT ENERGY ZERO. "
            "r2SCAN total energies are not on the PBE scale: an r2SCAN energy "
            "must never be differenced against a PBE one, and CLAUDE.md's "
            "'MACE-MP-0 is PBE-level, ~0.1-0.5 eV/atom overbinding vs "
            "experiment' does not apply to this model.",
            "The 'fine-tuned from OMat24' claim is read off upstream's own "
            "filename, MACE-matpes-r2scan-omat-ft.model, not from a paper.",
        ),
    ),
    # ── MACE-OFF23 — organic molecules.
    _off_entry(
        model_size="small",
        display_name="MACE-OFF23 (small)",
        description=(
            "Smallest organic model, 4.5 A cutoff. The cheapest force call in "
            "the whole catalog and the right default for molecules on a free "
            "CPU tier."
        ),
        checkpoint_bytes=7_347_350,
        cpu_ms_per_atom=0.81,
        relative_cost=1.0,
        r_max=4.5,
    ),
    _off_entry(
        model_size="medium",
        display_name="MACE-OFF23 (medium)",
        description=(
            "The recommended MACE-OFF23 model: 5.0 A cutoff, ~1.4M parameters, "
            "a good accuracy/cost balance for drug-like molecules."
        ),
        checkpoint_bytes=18_350_596,
        cpu_ms_per_atom=3.29,
        relative_cost=4.1,
        r_max=5.0,
    ),
    _off_entry(
        model_size="large",
        display_name="MACE-OFF23 (large)",
        description=(
            "Most accurate organic model, 5.0 A cutoff, ~4.7M parameters. "
            "Also the most expensive force call offered — see the note."
        ),
        checkpoint_bytes=55_492_786,
        cpu_ms_per_atom=12.35,
        relative_cost=15.3,
        r_max=5.0,
        notes=(
            "15.3x the cost of MACE-OFF23 small: ~1.2 s per force call for a "
            "100-atom molecule on 2 vCPU, so a 500-step BFGS relaxation is "
            "~10 minutes of wall clock. Fine for single-point, marginal for MD.",
        ),
    ),
)


# ── Indexes ─────────────────────────────────────────────────────────────────
# Built once at import. Keyed on the UPPERCASED modelType so lookup is
# case-insensitive without ever being open-ended: the value side is always a
# canonical name that appears in _ENTRIES.

_BY_KEY: dict[tuple[str, str], ModelEntry] = {}
_SIZES_BY_TYPE: dict[str, tuple[str, ...]] = {}
_CANONICAL_TYPE: dict[str, str] = {}

for _entry in _ENTRIES:
    _pair = (_entry.model_type, _entry.model_size)
    if _pair in _BY_KEY:  # pragma: no cover — a duplicate is a coding error
        raise RuntimeError(f"Duplicate catalog entry {_pair}")
    _BY_KEY[_pair] = _entry
    _SIZES_BY_TYPE.setdefault(_entry.model_type, ())
    _SIZES_BY_TYPE[_entry.model_type] += (_entry.model_size,)
    _CANONICAL_TYPE[_entry.model_type.upper()] = _entry.model_type

# The size used when a request names a family but no size. Chosen per family
# rather than globally "medium" — several families ship exactly one checkpoint,
# and a global default would make "MACE-MPA-0" + "small" look like a valid
# request that silently resolved to something else.
_DEFAULT_SIZE: dict[str, str] = {
    "MACE-MP-0": "medium",
    "MACE-MP-0b3": "medium",
    "MACE-MPA-0": "medium",
    "MACE-OMAT-0": "medium",
    "MACE-MATPES-PBE-0": "medium",
    "MACE-MATPES-R2SCAN-0": "medium",
    "MACE-OFF23": "medium",
}

# Accepted spellings that are not the canonical name. "MACE-OFF" is not a
# nicety: it is the value the existing UI, types/mace.ts, lib/mlpeg-catalog.ts
# and every already-shared MACE Link send, and calculate.py's
# MACE_OFF_MODEL_TYPES already treats the two as one family. Dropping it would
# break stored results.
MODEL_TYPE_ALIASES: dict[str, str] = {
    "MACE-OFF": "MACE-OFF23",
    "MACE-MPA": "MACE-MPA-0",
    "MACE-OMAT": "MACE-OMAT-0",
    "MACE-MATPES-PBE": "MACE-MATPES-PBE-0",
    "MACE-MATPES-R2SCAN": "MACE-MATPES-R2SCAN-0",
}
for _alias, _target in MODEL_TYPE_ALIASES.items():
    if _target not in _SIZES_BY_TYPE:  # pragma: no cover — coding error
        raise RuntimeError(f"Alias {_alias!r} points at unknown model {_target!r}")
    _CANONICAL_TYPE[_alias.upper()] = _target

del _entry, _pair, _alias, _target


# ── Named refusals ──────────────────────────────────────────────────────────
# Mirrors _UNIMPLEMENTED_HINTS in calculate.py. A user (or a docs page, or an
# LLM writing a POST body) will ask for these; a generic "unsupported model"
# leaves them guessing whether they typed it wrong. Each of these is a real
# thing that exists somewhere — in upstream's URL table, in mace-torch's own
# loaders, or on readthedocs — and each is refused for a specific reason.
_REFUSAL_HINTS: dict[str, str] = {
    "MACE-OFF24": (
        "MACE-OFF24 is documented on the MACE readthedocs site but is not in "
        "the installed mace-torch "
        + VERIFIED_AGAINST_MACE_VERSION
        + ": mace_off() hard-codes three URLs, all pointing at "
        "mace_off23/MACE-OFF23_{small,medium,large}.model, and the string "
        "'off24' does not appear anywhere in the installed package. Use "
        "MACE-OFF23."
    ),
    "MACE-MDP": (
        "mace_mdp is documented on the MACE readthedocs site but does not "
        "exist in the installed mace-torch "
        + VERIFIED_AGAINST_MACE_VERSION
        + " — there is no such loader and no such checkpoint URL."
    ),
    "MACE-ANICC": (
        "MACE-ANI-CC (CCSD(T)/ANI-500k) is not offered because it cannot be "
        "loaded on a CPU-only host with this mace-torch/torch combination. Its "
        "checkpoint embeds a TorchScript archive tagged for CUDA, and e3nn's "
        "__setstate__ calls torch.jit.load() without map_location, so "
        "torch.load(map_location='cpu') still raises NotImplementedError "
        "(aten::empty_strided on the CUDA backend). SimpleAtom runs CPU-only."
    ),
    "MACE-OMOL": (
        "MACE-OMOL (mace_omol, 'extra_large') is not offered. Measured, not "
        "guessed: 422.2 MB, 52.4M parameters, 16.64 ms per atom per force call "
        "on 2 CPU threads — 20.7x the cheapest model here and 35% dearer than "
        "the dearest one offered. A 422 MB fetch before the first force call, "
        "repeated on every cold start of a Space with ephemeral disk, is not a "
        "usable free no-sign-in experience. Use MACE-OFF23 large for organic "
        "molecules."
    ),
    "MACE-MP-0B": (
        "MACE-MP-0b is superseded within its own training line (MPtrj, PBE+U) "
        "by MACE-MP-0b3 and MACE-MPA-0, both of which are offered. Same "
        "elements, same level of theory, no new capability."
    ),
    "MACE-MP-0B2": (
        "MACE-MP-0b2 is superseded within its own training line (MPtrj, PBE+U) "
        "by MACE-MP-0b3 and MACE-MPA-0, both of which are offered. Its one "
        "distinguishing feature — training on stress — does not reach "
        "SimpleAtom, which optimises atomic positions only and never the cell."
    ),
    "MACE-MH-0": (
        "mace_mp's 'mh-0' checkpoint is not offered: it is a MULTI-HEAD model "
        "with 7 heads spanning 7 different levels of theory (rgd1_b3lyp, "
        "matpes_r2scan, mp_pbe_refit_add, omol, spice_wB97M, oc20_usemppbe, "
        "omat_pbe) and one isolated-atom reference row per head. "
        "mace_mp(model='mh-0') raises 'Head keyword was not provided, and no "
        "head in the model is default' — upstream exposes no documented way to "
        "choose one, so there is no single level of theory or energy band "
        "SimpleAtom could honestly attach to a result."
    ),
    "CUSTOM": (
        "'custom' is not a catalog model — it is a user-uploaded .model "
        "checkpoint. Use calculate.py's get_custom_calculator() with the "
        "uploaded file; the catalog cannot state elements, licence or level of "
        "theory for weights it has never seen."
    ),
}
_REFUSAL_HINTS["MACE-MH-1"] = (
    # Written out rather than derived from the mh-0 string: mh-1 has six heads,
    # not seven (it drops rgd1_b3lyp), and a .replace() would have quietly
    # published the wrong head count.
    "mace_mp's 'mh-1' checkpoint is not offered: it is a MULTI-HEAD model with "
    "6 heads spanning 6 different levels of theory (matpes_r2scan, "
    "mp_pbe_refit_add, spice_wB97M, oc20_usemppbe, omol, omat_pbe) and one "
    "isolated-atom reference row per head. mace_mp(model='mh-1') raises 'Head "
    "keyword was not provided, and no head in the model is default' — upstream "
    "exposes no documented way to choose one, so there is no single level of "
    "theory or energy band SimpleAtom could honestly attach to a result."
)
_REFUSAL_HINTS["MACE-MP"] = (
    "'MACE-MP' names a family, not a model. Pick one of MACE-MP-0, "
    "MACE-MP-0b3, MACE-MPA-0, MACE-OMAT-0, MACE-MATPES-PBE-0 or "
    "MACE-MATPES-R2SCAN-0 — they are trained on different data and their "
    "energies are not on one scale, so there is no safe default."
)
# Spellings the "_" -> "-" fold in _canonical_model_type() maps onto: users and
# docs write `mace_mdp`, `mace_omol`, `mace_anicc` — the loader spelling — as
# often as they write the model name.
_REFUSAL_HINTS["MH-0"] = _REFUSAL_HINTS["MACE-MH-0"]
_REFUSAL_HINTS["MH-1"] = _REFUSAL_HINTS["MACE-MH-1"]
_REFUSAL_HINTS["MACE-OMOL-0"] = _REFUSAL_HINTS["MACE-OMOL"]
_REFUSAL_HINTS["OMOL"] = _REFUSAL_HINTS["MACE-OMOL"]
_REFUSAL_HINTS["MACE-ANI-CC"] = _REFUSAL_HINTS["MACE-ANICC"]
_REFUSAL_HINTS["ANICC"] = _REFUSAL_HINTS["MACE-ANICC"]
_REFUSAL_HINTS["ANI-CC"] = _REFUSAL_HINTS["MACE-ANICC"]
_REFUSAL_HINTS["MDP"] = _REFUSAL_HINTS["MACE-MDP"]
_REFUSAL_HINTS["OFF24"] = _REFUSAL_HINTS["MACE-OFF24"]


# ────────────────────────────────────────────────────────────────────────────
# PUBLIC CONTRACT
# ────────────────────────────────────────────────────────────────────────────


def list_models() -> list[dict[str, Any]]:
    """Every offered model as JSON-serialisable dicts, in menu order."""
    return [entry.to_dict() for entry in _ENTRIES]


def list_entries() -> tuple[ModelEntry, ...]:
    """Every offered model as ModelEntry objects, in menu order."""
    return _ENTRIES


def list_model_types() -> tuple[str, ...]:
    """Canonical modelType values, in menu order, without duplicates."""
    return tuple(dict.fromkeys(e.model_type for e in _ENTRIES))


def list_model_sizes(model_type: Any) -> tuple[str, ...]:
    """
    The sizes offered for one family, in menu order.

    Raises ValueError for an unknown family — the same refusal `resolve_model`
    would give, so a caller cannot probe for a family by getting an empty tuple
    back.
    """
    canonical = _canonical_model_type(model_type)
    return _SIZES_BY_TYPE[canonical]


def catalog_as_json(indent: int | None = None) -> str:
    """
    The whole catalog as a JSON document, for the front-end and for pinning in
    a provenance manifest.

    Wraps the entries in the schema version and the mace-torch release the
    claims were verified against, so a stored copy can be told apart from a
    later one.
    """
    return json.dumps(
        {
            "schemaVersion": CATALOG_SCHEMA_VERSION,
            "verifiedAgainstMaceVersion": VERIFIED_AGAINST_MACE_VERSION,
            "models": list_models(),
        },
        indent=indent,
        sort_keys=False,
    )


def resolve_model(model_type: Any, model_size: Any = None) -> ModelEntry:
    """
    Resolve a (modelType, modelSize) request to a validated catalog entry.

    THIS IS THE SECURITY BOUNDARY for model selection, for the same reason
    `validate_calculation_type()` is one for calculation types: the API can be
    POSTed to directly, so the front-end's dropdown proves nothing. There is no
    default branch. An unrecognised modelType raises; a recognised modelType
    with an unrecognised modelSize raises rather than quietly resolving to the
    family default, because "MACE-OMAT-0 large" silently becoming
    "MACE-OMAT-0 medium" would attribute medium's numbers to a model the user
    believes was larger.

    A missing/empty modelSize DOES resolve to that family's documented default
    — that is a genuine absence, not a wrong value, and it matches
    `validate_calculation_type()`'s treatment of a missing calculationType.

    Args:
        model_type: modelType from the request. Case-insensitive; aliases in
            MODEL_TYPE_ALIASES are accepted ("MACE-OFF" -> "MACE-OFF23").
        model_size: modelSize from the request, or None/"" for the family
            default.

    Returns:
        The matching ModelEntry.

    Raises:
        ValueError: on an unknown, empty, non-string or refused modelType, or
            on a size this family does not ship.
    """
    canonical = _canonical_model_type(model_type)

    if model_size is None or (isinstance(model_size, str) and not model_size.strip()):
        size = _DEFAULT_SIZE[canonical]
    elif not isinstance(model_size, str):
        raise ValueError(
            f"Invalid modelSize: expected a string, got "
            f"{type(model_size).__name__}. Sizes offered for {canonical}: "
            f"{', '.join(_SIZES_BY_TYPE[canonical])}."
        )
    else:
        size = model_size.strip().lower()

    entry = _BY_KEY.get((canonical, size))
    if entry is None:
        offered = ", ".join(_SIZES_BY_TYPE[canonical])
        raise ValueError(
            f"{canonical} does not offer size '{size}'. Sizes offered: "
            f"{offered}. (Upstream mace-torch "
            f"{VERIFIED_AGAINST_MACE_VERSION} ships no other checkpoint for "
            f"this model — the size was not silently substituted.)"
        )
    return entry


def unsupported_elements(entry: ModelEntry, atomic_numbers: Iterable[Any]) -> tuple[int, ...]:
    """
    The atomic numbers in `atomic_numbers` that `entry` was not trained on,
    de-duplicated and sorted. Empty tuple means full coverage.

    Pure data — touches no network and loads no checkpoint.
    """
    seen: set[int] = set()
    for raw in atomic_numbers:
        try:
            z = int(raw)
        except (TypeError, ValueError):
            raise ValueError(
                f"Invalid atomic number {raw!r}: expected an integer Z."
            ) from None
        if z < 1:
            raise ValueError(f"Invalid atomic number {z}: must be >= 1.")
        if z not in entry.elements:
            seen.add(z)
    return tuple(sorted(seen))


def check_elements(entry: ModelEntry, atomic_numbers: Iterable[Any]) -> str | None:
    """
    Human-readable reason this model cannot handle this structure, or None.

    Deliberately cheap and offline, so `require_elements()` can be called
    BEFORE any checkpoint is fetched. Discovering that MACE-OFF23 has never
    seen iron after a 55 MB download and a model load is a bad trade for a
    check that is a set difference.
    """
    missing = unsupported_elements(entry, atomic_numbers)
    if not missing:
        return None

    missing_symbols = ", ".join(_symbol(z) for z in missing)
    covered = ",".join(entry.element_symbols)
    plural = "s" if len(missing) > 1 else ""

    message = (
        f"{entry.model_type} does not cover {missing_symbols}; it is trained "
        f"on {covered} only "
        f"({len(entry.elements)} element{'s' if len(entry.elements) != 1 else ''})."
    )

    # Point at a model that would work, when one obviously does. Only ever a
    # suggestion in prose — never an automatic substitution.
    if entry.family == "MACE-OFF":
        message += (
            f" MACE-OFF is an organic-chemistry model. For a structure "
            f"containing {missing_symbols}, use a MACE-MP family model "
            f"(MACE-MPA-0 or MACE-MP-0), which covers "
            f"{len(_MACE_MP_ELEMENTS)} elements."
        )
    else:
        message += (
            f" No model in this catalog covers element{plural} "
            f"{missing_symbols}; the MACE-MP family's "
            f"{len(_MACE_MP_ELEMENTS)}-element coverage is Z = 1-83 and 89-94, "
            f"so Po, At, Rn, Fr and Ra are outside every foundation model "
            f"offered here."
        )
    return message


def require_elements(entry: ModelEntry, atomic_numbers: Iterable[Any]) -> None:
    """
    Raise ValueError if `entry` does not cover every element in the structure.

    Call this before `build_calculator()`. Nothing is downloaded either way.
    """
    reason = check_elements(entry, atomic_numbers)
    if reason is not None:
        raise ValueError(reason + " Nothing was computed.")


def check_dispersion(entry: ModelEntry, dispersion: bool) -> str | None:
    """
    Reason D3 dispersion cannot be applied to this model, or None.

    Separate from `build_calculator()`, which raises, so a caller that prefers
    calculate.py's "drop the flag and record a warning" behaviour can have it
    without catching an exception.
    """
    if not dispersion:
        return None
    if entry.dispersion_supported:
        return None
    return (
        f"D3 dispersion cannot be applied to {entry.model_type}: "
        f"{entry.dispersion_note}"
    )


def expected_energy_range(
    entry: ModelEntry, atomic_numbers: Iterable[Any] | None = None
) -> tuple[float, float]:
    """
    The (low, high) eV/atom band a result from this model should fall in.

    With `atomic_numbers`, and for a model that carries an isolated-atom
    reference table, this is composition-aware and tight: the mean E0 of the
    actual structure, widened by the largest physically reasonable cohesive
    energy below and repulsion above. That is the only way to get a usable
    band out of MACE-OFF23, whose per-atom energies run from -469 eV/atom for
    ethanol to about -6000 eV/atom for a bromoarene purely because of which
    atoms are present.

    Without `atomic_numbers`, or for a model with no embedded table, it falls
    back to the entry's composition-agnostic `plausible_energy_range`. That
    fallback is explicit and documented, not a silent degradation: the band
    simply becomes wider, never wrong.

    Raises:
        ValueError: for an empty structure, or an element the model does not
            cover (an E0 mean over elements the model has never seen would be
            a fabricated band).
    """
    table = entry.atomic_energies_ev
    if atomic_numbers is None or table is None:
        return entry.plausible_energy_range

    zs = [int(z) for z in atomic_numbers]
    if not zs:
        raise ValueError("Cannot compute an energy range for an empty structure.")
    require_elements(entry, zs)

    mean_e0 = sum(table[z] for z in zs) / len(zs)
    return (
        mean_e0 - _MAX_COHESIVE_EV_PER_ATOM,
        mean_e0 + _MAX_REPULSIVE_EV_PER_ATOM,
    )


def build_calculator(
    entry: ModelEntry,
    device: str = "cpu",
    precision: str | None = None,
    dispersion: bool = False,
    **loader_kwargs: Any,
):
    """
    Build the ASE calculator for `entry` through the correct upstream loader.

    Args:
        entry: a ModelEntry from `resolve_model()`. Not a string — resolving is
            the caller's explicit step, so nothing can reach a loader without
            passing the security boundary first.
        device: "cpu" or "cuda". Passed straight through and NOT resolved here;
            calculate.py's `resolve_device()` owns the CUDA->CPU fallback and
            the result must record which one actually ran. Defaults to "cpu"
            because the deployment target has no GPU. Never left empty:
            upstream reads `device or ("cuda" if available else "cpu")`, and a
            catalog that let the device be chosen implicitly would make
            `result["params"]["device"]` a guess.
        precision: "float32" or "float64". None means the entry's
            `upstream_default_dtype` — float64 for MACE-OFF23, float32 for the
            MACE-MP family, which is upstream's own asymmetry, not ours.
        dispersion: D3 correction. Raises for a model where it would
            double-count; use `check_dispersion()` if you would rather warn.
        **loader_kwargs: forwarded to the upstream loader untouched.

    Returns:
        A `MACECalculator`, or a `SumCalculator([mace, d3])` when dispersion
        was requested and granted.

    Raises:
        ValueError: on a bad precision, or dispersion on a model that already
            includes it.
        RuntimeError: if the checkpoint that loaded does not cover the elements
            this catalog advertises for it — see the note below.
    """
    if not isinstance(entry, ModelEntry):
        raise ValueError(
            f"build_calculator() expects a ModelEntry from resolve_model(), got "
            f"{type(entry).__name__}. Resolving the request is a separate, "
            f"deliberate step: it is where an unknown model is rejected."
        )

    if precision is None:
        precision = entry.upstream_default_dtype
    if precision not in ("float32", "float64"):
        raise ValueError(
            f"Unsupported precision '{precision}'. Supported precisions: "
            f"float32, float64."
        )

    if not isinstance(device, str) or not device.strip():
        raise ValueError(
            "device must be a non-empty string such as 'cpu' or 'cuda'. "
            "Upstream treats an empty device as 'pick one for me', which would "
            "make the device recorded on the result a guess."
        )

    dispersion_problem = check_dispersion(entry, dispersion)
    if dispersion_problem is not None:
        raise ValueError(dispersion_problem + " Nothing was computed.")

    if entry.loader == LOADER_MACE_OFF:
        from mace.calculators import mace_off

        # mace_off() has no `dispersion` parameter at all — check_dispersion()
        # above guarantees we never try to pass one.
        calc = mace_off(
            model=entry.loader_model_arg,
            device=device,
            default_dtype=precision,
            **loader_kwargs,
        )
    elif entry.loader == LOADER_MACE_MP:
        from mace.calculators import mace_mp

        # ALWAYS an explicit model string. mace_mp(model=None) silently loads
        # medium-mpa-0 (foundations_models.py:55) — see the note on the
        # MACE-MPA-0 entry.
        calc = mace_mp(
            model=entry.loader_model_arg,
            device=device,
            default_dtype=precision,
            dispersion=dispersion,
            **loader_kwargs,
        )
    else:  # pragma: no cover — unreachable while _LOADERS is enforced
        raise RuntimeError(
            f"No loader wired up for '{entry.loader}' (entry {entry.key}). "
            f"Adding a loader name to a catalog entry without adding it here "
            f"must fail loudly, not fall through to another model's weights."
        )

    _assert_coverage_matches(entry, calc)
    return calc


def verify_against_upstream() -> dict[str, Any]:
    """
    Re-check the machine-checkable claims in this file against the installed
    mace-torch. Returns a report; raises nothing.

    Checked:
      * every loader named by an entry exists in `mace.calculators`;
      * every mace_mp entry's `loader_model_arg` is a real key of
        `mace_mp_urls`, and every mace_off entry's arg is a literal accepted by
        `mace_off()`;
      * every `loader_model_arg` occurs in the installed source text;
      * `upstream_default_dtype` equals the loader's real signature default;
      * the ASL set here equals the ASL set upstream builds in
        `download_mace_mp_checkpoint()`;
      * the installed version matches VERIFIED_AGAINST_MACE_VERSION.

    Not checked here (needs a download): element coverage. That is
    `build_calculator()`'s job on every real load, and the opt-in half of
    mace-api/test_model_catalog.py.
    """
    import inspect

    import mace
    from mace.calculators import foundations_models as fm

    source = inspect.getsource(fm)
    problems: list[str] = []
    checked = 0

    installed = getattr(mace, "__version__", "unknown")
    if installed != VERIFIED_AGAINST_MACE_VERSION:
        problems.append(
            f"installed mace-torch is {installed}, but this catalog's claims "
            f"were verified against {VERIFIED_AGAINST_MACE_VERSION}. Re-read "
            f"foundations_models.py before trusting the entries."
        )

    # The literals mace_off() accepts, read from its body rather than assumed.
    off_accepted = {"small", "medium", "large"}

    for entry in _ENTRIES:
        checked += 1
        loader_fn = getattr(fm, entry.loader, None)
        if loader_fn is None:
            problems.append(f"{entry.key}: mace.calculators has no {entry.loader}()")
            continue

        if entry.loader == LOADER_MACE_MP:
            if entry.loader_model_arg not in fm.mace_mp_urls:
                problems.append(
                    f"{entry.key}: '{entry.loader_model_arg}' is not a key of "
                    f"mace_mp_urls"
                )
        elif entry.loader == LOADER_MACE_OFF:
            if entry.loader_model_arg not in off_accepted:
                problems.append(
                    f"{entry.key}: mace_off() does not accept "
                    f"'{entry.loader_model_arg}'"
                )

        if f'"{entry.loader_model_arg}"' not in source:
            problems.append(
                f"{entry.key}: '{entry.loader_model_arg}' does not occur as a "
                f"literal in the installed foundations_models.py source"
            )

        real_default = inspect.signature(loader_fn).parameters["default_dtype"].default
        if real_default != entry.upstream_default_dtype:
            problems.append(
                f"{entry.key}: catalog says {entry.loader}() defaults to "
                f"{entry.upstream_default_dtype}, installed signature says "
                f"{real_default!r}"
            )

    # ASL. Upstream's set is written inline in download_mace_mp_checkpoint();
    # rebuild it from the same URL table rather than re-typing the four names.
    upstream_asl_keys = {
        key
        for key in ("small-omat-0", "medium-omat-0", "mace-matpes-pbe-0", "mace-matpes-r2scan-0")
        if key in fm.mace_mp_urls
    }
    catalog_asl_mp_keys = {
        e.loader_model_arg
        for e in _ENTRIES
        if e.loader == LOADER_MACE_MP and e.license_id == LICENSE_ASL
    }
    catalog_mit_mp_keys = {
        e.loader_model_arg
        for e in _ENTRIES
        if e.loader == LOADER_MACE_MP and e.license_id == LICENSE_MIT
    }
    if catalog_asl_mp_keys - upstream_asl_keys:
        problems.append(
            f"catalog marks {sorted(catalog_asl_mp_keys - upstream_asl_keys)} "
            f"ASL, but upstream does not"
        )
    if catalog_mit_mp_keys & upstream_asl_keys:
        problems.append(
            f"catalog marks {sorted(catalog_mit_mp_keys & upstream_asl_keys)} "
            f"MIT, but upstream's ASL_checkpoint_urls contains them"
        )
    if "ASL" not in source:
        problems.append("no ASL notice found in the installed source at all")

    return {
        "ok": not problems,
        "installedMaceVersion": installed,
        "verifiedAgainstMaceVersion": VERIFIED_AGAINST_MACE_VERSION,
        "entriesChecked": checked,
        "problems": problems,
    }


# ────────────────────────────────────────────────────────────────────────────
# INTERNALS
# ────────────────────────────────────────────────────────────────────────────


def _canonical_model_type(raw: Any) -> str:
    """
    Normalise a requested modelType to a canonical catalog name, or raise.

    No fall-through: the lookup is a dict of explicit canonical names plus an
    explicit alias table. Case-insensitivity is a convenience on the *key*, not
    an opening — an unknown string still lands in the refusal branch.
    """
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise ValueError(
            "modelType is required. Models offered: "
            + ", ".join(list_model_types())
            + "."
        )
    if not isinstance(raw, str):
        raise ValueError(
            f"Invalid modelType: expected a string, got {type(raw).__name__}. "
            f"Models offered: {', '.join(list_model_types())}."
        )

    # Uppercase and fold "_" to "-" so `mace_off`, `MACE_OFF` and `MACE-OFF`
    # all land on the same table key — upstream spells its loaders with
    # underscores (`mace_off`, `mace_mdp`) and its model names with hyphens, so
    # both spellings reach this function in practice. This widens only the
    # KEY; the value side is still an explicit table, so an unrecognised string
    # still falls into the refusal branch below.
    probe = raw.strip().upper().replace("_", "-")
    canonical = _CANONICAL_TYPE.get(probe)
    if canonical is not None:
        return canonical

    hint = _REFUSAL_HINTS.get(probe)
    message = (
        f"Unsupported modelType '{raw.strip()}'. Models offered: "
        f"{', '.join(list_model_types())}."
    )
    if hint:
        message = f"{message} {hint}"
    raise ValueError(message)


_SYMBOLS: tuple[str, ...] | None = None


def _symbol(z: int) -> str:
    """
    Element symbol for an atomic number.

    ase.data is imported lazily and cached: this module is imported by the CLI
    wrapper on every subprocess call, and `list_models()` should not pay for
    the ase import when nobody asks for a symbol. If ase is somehow missing the
    symbol degrades to "Z=26" — visibly odd rather than silently wrong.
    """
    global _SYMBOLS
    if _SYMBOLS is None:
        try:
            from ase.data import chemical_symbols

            _SYMBOLS = tuple(chemical_symbols)
        except Exception:  # pragma: no cover — ase is a hard dependency
            _SYMBOLS = ()
    if 0 < z < len(_SYMBOLS):
        return _SYMBOLS[z]
    return f"Z={z}"


def _z_table_of(calc) -> tuple[int, ...] | None:
    """
    The atomic numbers a built calculator actually knows, or None.

    Walks a SumCalculator the way calculate.py's `detect_calculator_dtype()`
    does, because `mace_mp(dispersion=True)` returns
    `SumCalculator([mace_calc, d3_calc])` and only the first member has a
    z_table.
    """
    candidates = [calc]
    mixer = getattr(calc, "mixer", None)
    if mixer is not None and hasattr(mixer, "calcs"):
        candidates.extend(mixer.calcs)
    elif hasattr(calc, "calcs"):
        candidates.extend(calc.calcs)

    for candidate in candidates:
        z_table = getattr(candidate, "z_table", None)
        zs = getattr(z_table, "zs", None)
        if zs:
            return tuple(sorted(int(z) for z in zs))
    return None


def _assert_coverage_matches(entry: ModelEntry, calc) -> None:
    """
    Refuse to hand back a calculator whose real element coverage disagrees with
    what this catalog publishes for it.

    The hardcoded element tuples exist so a structure can be rejected before a
    download; this is the other half of that bargain. `mace_mp_urls` maps names
    to *URLs*, not to fixed weights — upstream can reissue a release asset, and
    the front-end would go on displaying "89 elements" while a differently
    trained checkpoint quietly answered. Loud, on the very first load, with the
    exact diff a maintainer needs.

    Under-coverage is the dangerous direction (a structure accepted for an
    element the model never saw), but over-coverage is refused too: either way
    the number on screen next to the model is false.
    """
    actual = _z_table_of(calc)
    if actual is None:
        # Not a silent pass: say so, so an unexpected calculator shape shows up
        # as a warning in the log rather than as a check that quietly stopped
        # running. Nothing scientific depends on it.
        import logging

        logging.warning(
            "model_catalog: could not read a z_table off the %s calculator for "
            "%s; published element coverage was not re-verified.",
            type(calc).__name__,
            entry.key,
        )
        return

    declared = tuple(sorted(entry.elements))
    if actual == declared:
        return

    missing = sorted(set(declared) - set(actual))
    extra = sorted(set(actual) - set(declared))
    raise RuntimeError(
        f"Element-coverage mismatch for {entry.key}: the checkpoint loaded via "
        f"{entry.loader}(model='{entry.loader_model_arg}') covers "
        f"{len(actual)} elements, but mace-api/model_catalog.py publishes "
        f"{len(declared)}. "
        + (f"Advertised but absent from the checkpoint: "
           f"{', '.join(_symbol(z) for z in missing)}. " if missing else "")
        + (f"Present in the checkpoint but not advertised: "
           f"{', '.join(_symbol(z) for z in extra)}. " if extra else "")
        + "Upstream has probably reissued this checkpoint. Update the catalog "
        "entry — do not relax this check: the whole point of the published "
        "element list is that a structure can be rejected before a 70 MB "
        "download, and a list that no longer matches the weights rejects and "
        "accepts the wrong structures."
    )


__all__ = [
    "CATALOG_SCHEMA_VERSION",
    "VERIFIED_AGAINST_MACE_VERSION",
    "LICENSE_ASL",
    "LICENSE_MIT",
    "LOADER_MACE_MP",
    "LOADER_MACE_OFF",
    "MODEL_TYPE_ALIASES",
    "ModelEntry",
    "build_calculator",
    "catalog_as_json",
    "check_dispersion",
    "check_elements",
    "expected_energy_range",
    "list_entries",
    "list_model_sizes",
    "list_model_types",
    "list_models",
    "require_elements",
    "resolve_model",
    "unsupported_elements",
    "verify_against_upstream",
]


if __name__ == "__main__":  # pragma: no cover — human-facing summary
    report = verify_against_upstream()
    print(catalog_as_json(indent=2))
    print()
    print(f"verify_against_upstream(): ok={report['ok']} "
          f"entries={report['entriesChecked']} "
          f"mace={report['installedMaceVersion']}")
    for problem in report["problems"]:
        print(f"  PROBLEM: {problem}")
