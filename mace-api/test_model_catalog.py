"""
Tests for mace-api/model_catalog.py.

    python3 mace-api/test_model_catalog.py              # fast, offline
    python3 mace-api/test_model_catalog.py --download   # + real checkpoints

The default run touches no network and loads no weights, so it is safe in CI
and in a pre-commit hook. Everything that needs a checkpoint lives behind
--download (or MACE_CATALOG_DOWNLOAD_TESTS=1) and is skipped otherwise, with
the skip printed rather than silently swallowed.

What the fast run proves:
  * every catalog entry's loader name and `model=` string exists in the
    INSTALLED mace-torch — both structurally (it is a key of `mace_mp_urls`,
    or a literal `mace_off()` accepts) and textually (it occurs in the source);
  * the dtype defaults, the ASL licence set and the absence of a `dispersion`
    parameter on `mace_off()` are what the catalog claims, read back out of
    the installed signatures and source;
  * an element the model was never trained on is rejected BEFORE any download
    — proved by making the network raise for the duration of the test;
  * unknown, empty, non-string, refused and wrong-size model requests all
    raise ValueError, with no fall-through to another model's weights.

No pytest dependency: the functions are named `test_*` so pytest can collect
them if it happens to be installed, but the runner at the bottom is enough.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import model_catalog as mc  # noqa: E402

DOWNLOAD = "--download" in sys.argv or os.environ.get("MACE_CATALOG_DOWNLOAD_TESTS") == "1"


class Skip(Exception):
    """Raised by a test that cannot run in this configuration."""


# ────────────────────────────────────────────────────────────────────────────
# 1. Internal consistency
# ────────────────────────────────────────────────────────────────────────────


def test_catalog_is_internally_consistent():
    entries = mc.list_entries()
    assert entries, "catalog is empty"

    keys = [e.key for e in entries]
    assert len(keys) == len(set(keys)), f"duplicate keys: {keys}"

    for e in entries:
        assert e.loader in (mc.LOADER_MACE_MP, mc.LOADER_MACE_OFF), e.key
        assert e.license_id in (mc.LICENSE_MIT, mc.LICENSE_ASL), e.key
        assert e.upstream_default_dtype in ("float32", "float64"), e.key
        assert e.model_size in ("small", "medium", "large"), e.key

        assert e.elements, f"{e.key}: no elements"
        assert list(e.elements) == sorted(set(e.elements)), (
            f"{e.key}: elements must be sorted and unique"
        )
        assert all(z >= 1 for z in e.elements), e.key

        lo, hi = e.plausible_energy_range
        assert lo < hi, f"{e.key}: plausible band {lo} !< {hi}"
        if e.typical_energy_range is not None:
            tlo, thi = e.typical_energy_range
            assert tlo < thi, f"{e.key}: typical band {tlo} !< {thi}"
            assert lo <= tlo and thi <= hi, (
                f"{e.key}: typical band {e.typical_energy_range} is not inside "
                f"the plausible band {e.plausible_energy_range}"
            )

        assert e.checkpoint_bytes and e.checkpoint_bytes > 1_000_000, e.key
        assert e.cpu_ms_per_atom and e.cpu_ms_per_atom > 0, e.key
        assert e.relative_cost and e.relative_cost > 0, e.key
        assert e.citation, f"{e.key}: no citation"
        assert e.description and e.level_of_theory and e.training_dataset, e.key

    # Every family must have a default size, and it must be one it offers.
    for model_type in mc.list_model_types():
        sizes = mc.list_model_sizes(model_type)
        assert sizes, model_type
        default = mc.resolve_model(model_type).model_size
        assert default in sizes, f"{model_type}: default {default} not in {sizes}"

    # The relative-cost scale must be anchored: exactly one entry at 1.0.
    anchors = [e.key for e in entries if e.relative_cost == 1.0]
    assert len(anchors) == 1, f"expected one 1.0x cost anchor, got {anchors}"


def test_declared_element_sets_are_the_documented_ones():
    off = mc.resolve_model("MACE-OFF23", "medium")
    assert off.elements == (1, 6, 7, 8, 9, 15, 16, 17, 35, 53)
    assert off.element_symbols == ("H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I")

    mp = mc.resolve_model("MACE-MP-0", "medium")
    assert len(mp.elements) == 89, len(mp.elements)
    # Z = 1..83 and 89..94. Po, At, Rn, Fr, Ra are genuinely absent from the
    # MPtrj checkpoints — read off model.atomic_numbers, not from a paper.
    assert set(mp.elements) == set(range(1, 84)) | set(range(89, 95))
    for z in (84, 85, 86, 87, 88):
        assert not mp.covers(z), f"MACE-MP should not cover Z={z}"

    # Every MACE-MP-family entry shares one coverage set.
    mp_entries = [e for e in mc.list_entries() if e.family == "MACE-MP"]
    assert len({e.elements for e in mp_entries}) == 1


def test_catalog_is_json_serialisable_and_round_trips():
    text = mc.catalog_as_json()
    doc = json.loads(text)
    assert doc["schemaVersion"] == mc.CATALOG_SCHEMA_VERSION
    assert doc["verifiedAgainstMaceVersion"] == mc.VERIFIED_AGAINST_MACE_VERSION
    assert len(doc["models"]) == len(mc.list_entries())

    for model in doc["models"]:
        # Fields the front-end needs in order to render a model picker that can
        # warn about licence and cost before anything is downloaded.
        for required in (
            "key", "modelType", "modelSize", "displayName", "elements",
            "elementSymbols", "levelOfTheory", "trainingDataset", "license",
            "licenseNotice", "commercialUsePermitted", "upstreamDefaultDtype",
            "dispersionSupported", "checkpointBytes", "checkpointMB",
            "cpuMsPerAtom", "relativeCost", "plausibleEnergyRange", "citation",
        ):
            assert required in model, f"{model.get('key')}: missing {required}"
        assert model["elementCount"] == len(model["elements"])
        assert len(model["elementSymbols"]) == len(model["elements"])


# ────────────────────────────────────────────────────────────────────────────
# 2. Every claim that can be checked against the installed upstream, is
# ────────────────────────────────────────────────────────────────────────────


def test_every_loader_string_is_present_in_installed_upstream_source():
    """
    The headline check. A catalog entry whose `model=` string does not exist
    upstream is a menu item that 404s — or worse, silently resolves to
    something else.
    """
    import inspect

    from mace.calculators import foundations_models as fm

    source = inspect.getsource(fm)

    for e in mc.list_entries():
        assert hasattr(fm, e.loader), f"{e.key}: no upstream loader {e.loader}()"

        # Textual: the exact literal appears in the installed source file.
        assert f'"{e.loader_model_arg}"' in source, (
            f"{e.key}: '{e.loader_model_arg}' does not occur as a literal in "
            f"the installed foundations_models.py"
        )

        # Structural: it is a thing the loader will actually accept.
        if e.loader == mc.LOADER_MACE_MP:
            assert e.loader_model_arg in fm.mace_mp_urls, (
                f"{e.key}: '{e.loader_model_arg}' is not a key of mace_mp_urls "
                f"(keys: {sorted(fm.mace_mp_urls)})"
            )
        else:
            assert e.loader_model_arg in ("small", "medium", "large"), (
                f"{e.key}: mace_off() accepts only small/medium/large, not "
                f"'{e.loader_model_arg}'"
            )


def test_upstream_default_dtypes_match_the_installed_signatures():
    """
    mace_off() defaults to float64 and mace_mp() to float32. That asymmetry is
    deliberate upstream and calculate.py's upstream_default_precision() depends
    on it, so read it back rather than trusting the comment.
    """
    import inspect

    from mace.calculators import foundations_models as fm

    assert inspect.signature(fm.mace_mp).parameters["default_dtype"].default == "float32"
    assert inspect.signature(fm.mace_off).parameters["default_dtype"].default == "float64"

    for e in mc.list_entries():
        real = inspect.signature(getattr(fm, e.loader)).parameters["default_dtype"].default
        assert e.upstream_default_dtype == real, (
            f"{e.key}: catalog says {e.upstream_default_dtype}, "
            f"{e.loader}() signature says {real!r}"
        )


def test_asl_licences_match_upstreams_own_asl_set():
    """
    The ASL/MIT split is legal, not cosmetic, and it is not uniform. Upstream
    builds ASL_checkpoint_urls inline in download_mace_mp_checkpoint(); check
    the catalog against those exact URLs rather than against four re-typed
    names.
    """
    import inspect

    from mace.calculators import foundations_models as fm

    src = inspect.getsource(fm.download_mace_mp_checkpoint)
    asl_keys = {k for k in fm.mace_mp_urls if f'mace_mp_urls["{k}"]' in src.split("ASL_checkpoint_urls")[1].split("}")[0]}
    assert asl_keys == {
        "small-omat-0", "medium-omat-0", "mace-matpes-pbe-0", "mace-matpes-r2scan-0",
    }, f"upstream ASL set changed: {sorted(asl_keys)}"

    for e in mc.list_entries():
        if e.loader != mc.LOADER_MACE_MP:
            continue
        expected = mc.LICENSE_ASL if e.loader_model_arg in asl_keys else mc.LICENSE_MIT
        assert e.license_id == expected, (
            f"{e.key}: catalog says {e.license_id}, upstream says {expected}"
        )

    # All of MACE-OFF23 is ASL — mace_off()'s docstring and download banner.
    off_src = inspect.getsource(fm.mace_off)
    assert "Academic Software License" in off_src
    for e in mc.list_entries():
        if e.family == "MACE-OFF":
            assert e.license_id == mc.LICENSE_ASL, e.key

    # And ASL must be surfaced as non-commercial wherever it appears.
    for model in mc.list_models():
        if model["license"] == mc.LICENSE_ASL:
            assert model["commercialUsePermitted"] is False, model["key"]
            assert "commercial" in model["licenseNotice"].lower(), model["key"]


def test_mace_off_really_has_no_dispersion_parameter():
    """
    The catalog says D3 must never be applied to MACE-OFF. Half of that is
    physics (wB97M-D3(BJ) training data already contains it); the other half is
    that upstream gives you nowhere to put the flag. Check the second half.
    """
    import inspect

    from mace.calculators import foundations_models as fm

    assert "dispersion" not in inspect.signature(fm.mace_off).parameters
    assert "dispersion" in inspect.signature(fm.mace_mp).parameters

    for e in mc.list_entries():
        assert e.dispersion_supported == (e.loader == mc.LOADER_MACE_MP), e.key


def test_verify_against_upstream_reports_clean():
    report = mc.verify_against_upstream()
    assert report["ok"], report["problems"]
    assert report["entriesChecked"] == len(mc.list_entries())


def test_models_refused_on_documentation_grounds_are_really_absent():
    """
    The readthedocs page lists models this mace-torch does not ship. Prove the
    refusals in _REFUSAL_HINTS are refusals of fact, not of taste.
    """
    import inspect

    from mace.calculators import foundations_models as fm

    source = inspect.getsource(fm).lower()
    assert "off24" not in source, "mace-torch now ships MACE-OFF24 — revisit the catalog"
    assert "mace_mdp" not in source, "mace-torch now ships mace_mdp — revisit the catalog"

    # mace_off() accepts exactly three names, so "large-off24" cannot resolve.
    off_src = inspect.getsource(fm.mace_off)
    assert 'model in (None, "small", "medium", "large")' in off_src

    # Each of these must produce a NAMED refusal — the specific reason from
    # _REFUSAL_HINTS, not just the generic "unsupported modelType" list. A
    # generic error would leave the user unable to tell a typo from a
    # deliberate exclusion.
    for refused, must_mention in (
        ("MACE-OFF24", "readthedocs"),
        ("mace_mdp", "does not exist in the installed"),
        ("MACE-OMOL", "422.2 MB"),
        ("mace_omol", "422.2 MB"),
        ("mh-0", "MULTI-HEAD"),
        ("mh-1", "MULTI-HEAD"),
        ("MACE-ANICC", "CPU-only"),
        ("mace_anicc", "CPU-only"),
        ("MACE-MP-0b", "superseded"),
        ("MACE-MP-0b2", "superseded"),
        ("MACE-MP", "names a family"),
    ):
        try:
            mc.resolve_model(refused)
        except ValueError as exc:
            assert must_mention in str(exc), (
                f"{refused}: refusal does not explain itself "
                f"(expected {must_mention!r}): {exc}"
            )
            # The refusal must still say what IS on the menu.
            assert "MACE-OFF23" in str(exc), refused
        else:
            raise AssertionError(f"{refused} resolved instead of raising")

    # mh-0/mh-1 are refused because they are multi-head; confirm upstream
    # really does ship them, so this is an exclusion and not a stale note.
    assert "mh-0" in fm.mace_mp_urls and "mh-1" in fm.mace_mp_urls


def test_the_mace_mp_none_fallback_is_real_and_avoided():
    """
    download_mace_mp_checkpoint() defaults an unmatched name to medium-mpa-0.
    The only name that reaches that default is None (mace_mp_names is
    [None] + keys), but if a caller ever passed None it would get MPA-0 weights
    labelled as whatever it thought it asked for. build_calculator() therefore
    always passes an explicit string.
    """
    import inspect

    from mace.calculators import foundations_models as fm

    src = inspect.getsource(fm.download_mace_mp_checkpoint)
    assert 'mace_mp_urls.get(model, mace_mp_urls["medium-mpa-0"])' in src, (
        "upstream's None-fallback changed shape; re-read foundations_models.py"
    )
    assert fm.mace_mp_names[0] is None
    assert set(fm.mace_mp_names[1:]) == set(fm.mace_mp_urls)

    for e in mc.list_entries():
        assert isinstance(e.loader_model_arg, str) and e.loader_model_arg


# ────────────────────────────────────────────────────────────────────────────
# 3. Rejection: unknown models, wrong sizes, uncovered elements
# ────────────────────────────────────────────────────────────────────────────


def _expect_value_error(fn, *args, contains=None):
    try:
        fn(*args)
    except ValueError as exc:
        if contains:
            assert contains.lower() in str(exc).lower(), (
                f"expected {contains!r} in error, got: {exc}"
            )
        return str(exc)
    raise AssertionError(f"{fn.__name__}{args} did not raise ValueError")


def test_unknown_model_types_raise():
    for bad in (
        "MACE-MP-1", "mace", "MACE-OFF25", "", "   ", "../../etc/passwd",
        "MACE-MP-0; DROP TABLE", "medium",
    ):
        _expect_value_error(mc.resolve_model, bad)

    for bad in (None, 3, 3.5, [], {}, True):
        _expect_value_error(mc.resolve_model, bad)

    # And the refusal always says what IS available.
    msg = _expect_value_error(mc.resolve_model, "MACE-MP-1")
    for offered in mc.list_model_types():
        assert offered in msg


def test_unknown_sizes_raise_rather_than_falling_back():
    # This is the dangerous one: "MACE-MPA-0 large" quietly becoming
    # "MACE-MPA-0 medium" would attribute medium's numbers to a bigger model.
    _expect_value_error(mc.resolve_model, "MACE-MPA-0", "large", contains="does not offer size")
    _expect_value_error(mc.resolve_model, "MACE-MPA-0", "small")
    _expect_value_error(mc.resolve_model, "MACE-OFF23", "extra_large")
    _expect_value_error(mc.resolve_model, "MACE-OMAT-0", "large")
    _expect_value_error(mc.resolve_model, "MACE-MP-0", "tiny")
    _expect_value_error(mc.resolve_model, "MACE-MP-0", 1)

    # A missing size is an absence, not a wrong value: it takes the default.
    assert mc.resolve_model("MACE-MP-0", None).model_size == "medium"
    assert mc.resolve_model("MACE-MP-0", "").model_size == "medium"
    assert mc.resolve_model("MACE-MP-0", "  ").model_size == "medium"


def test_custom_is_refused_with_a_pointer_not_a_shrug():
    msg = _expect_value_error(mc.resolve_model, "custom")
    assert "get_custom_calculator" in msg
    assert "uploaded" in msg.lower()


def test_aliases_resolve_to_canonical_entries():
    # "MACE-OFF" is what the existing UI and every stored MACE Link send.
    assert mc.resolve_model("MACE-OFF", "small").key == "MACE-OFF23/small"
    assert mc.resolve_model("MACE-OFF23", "small").key == "MACE-OFF23/small"
    # Case-insensitive on the key, never open-ended on the value.
    assert mc.resolve_model("mace-off", "SMALL").key == "MACE-OFF23/small"
    assert mc.resolve_model("  MACE-MPA-0  ").key == "MACE-MPA-0/medium"
    for alias, target in mc.MODEL_TYPE_ALIASES.items():
        assert mc.resolve_model(alias).model_type == target


def test_element_rejection_message_is_precise():
    off = mc.resolve_model("MACE-OFF23", "small")

    assert mc.check_elements(off, [1, 6, 8]) is None
    assert mc.unsupported_elements(off, [1, 6, 8]) == ()

    msg = mc.check_elements(off, [26, 8, 8, 26])   # Fe2O2
    assert msg is not None
    assert "MACE-OFF23 does not cover Fe" in msg, msg
    assert "H,C,N,O,F,P,S,Cl,Br,I" in msg, msg
    assert "MACE-MP" in msg, msg          # points at something that would work
    assert "O" in msg

    # Several missing elements are all named, in Z order, once each.
    msg = mc.check_elements(off, [26, 3, 26, 79])
    assert "Li, Fe, Au" in msg, msg

    mp = mc.resolve_model("MACE-MP-0", "medium")
    assert mc.check_elements(mp, [26, 8]) is None
    msg = mc.check_elements(mp, [88])     # radium: covered by nothing here
    assert "MACE-MP-0 does not cover Ra" in msg, msg
    assert "Po, At, Rn, Fr and Ra" in msg, msg

    _expect_value_error(mc.require_elements, off, [26])
    assert "Nothing was computed" in _expect_value_error(mc.require_elements, off, [26])

    # Garbage in the structure is an error, not a silent pass.
    _expect_value_error(mc.unsupported_elements, off, ["Fe"])
    _expect_value_error(mc.unsupported_elements, off, [0])
    _expect_value_error(mc.unsupported_elements, off, [-1])


def test_element_rejection_happens_before_any_download():
    """
    Proved, not asserted: the network is made to explode for the duration of
    the check. If require_elements() touched a URL — or if resolving a model
    did — this fails with RuntimeError instead of the ValueError we want.
    """
    def boom(*args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        raise RuntimeError("network was used during an element check")

    saved = (urllib.request.urlretrieve, urllib.request.urlopen)
    urllib.request.urlretrieve, urllib.request.urlopen = boom, boom
    try:
        for model_type, size, zs in (
            ("MACE-OFF23", "large", [26]),          # 55.5 MB not downloaded
            ("MACE-OFF23", "medium", [3, 26, 79]),
            ("MACE-MP-0", "large", [88]),           # 133.8 MB not downloaded
            ("MACE-MATPES-R2SCAN-0", "medium", [84]),
        ):
            entry = mc.resolve_model(model_type, size)
            _expect_value_error(mc.require_elements, entry, zs)
        # Listing the whole catalog must be offline too — it is what the
        # front-end calls on every page load.
        assert len(mc.list_models()) == len(mc.list_entries())
        mc.catalog_as_json()
    finally:
        urllib.request.urlretrieve, urllib.request.urlopen = saved


def test_dispersion_is_refused_where_it_would_double_count():
    off = mc.resolve_model("MACE-OFF23", "medium")
    mp = mc.resolve_model("MACE-MP-0", "medium")

    assert mc.check_dispersion(off, False) is None
    assert mc.check_dispersion(mp, True) is None

    reason = mc.check_dispersion(off, True)
    assert reason is not None
    assert "double-count" in reason.lower(), reason
    assert "wB97M-D3(BJ)" in reason, reason

    _expect_value_error(mc.build_calculator, off, "cpu", None, True)


def test_build_calculator_validates_before_it_loads_anything():
    """Every one of these must fail without a checkpoint being touched."""
    def boom(*args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        raise RuntimeError("network was used during argument validation")

    entry = mc.resolve_model("MACE-OFF23", "small")
    saved = (urllib.request.urlretrieve, urllib.request.urlopen)
    urllib.request.urlretrieve, urllib.request.urlopen = boom, boom
    try:
        _expect_value_error(mc.build_calculator, "MACE-OFF23", contains="ModelEntry")
        _expect_value_error(mc.build_calculator, None)
        _expect_value_error(mc.build_calculator, entry, "cpu", "float16")
        _expect_value_error(mc.build_calculator, entry, "cpu", "double")
        _expect_value_error(mc.build_calculator, entry, "", None, contains="non-empty")
        _expect_value_error(mc.build_calculator, entry, "   ")
    finally:
        urllib.request.urlretrieve, urllib.request.urlopen = saved


# ────────────────────────────────────────────────────────────────────────────
# 4. Energy bands
# ────────────────────────────────────────────────────────────────────────────


def test_expected_energy_range_is_composition_aware_for_mace_off():
    off = mc.resolve_model("MACE-OFF23", "medium")

    water = [8, 1, 1]
    lo, hi = mc.expected_energy_range(off, water)
    # E0 mean alone is -690.36 eV/atom, which is already outside CLAUDE.md's
    # -100..-600 folklore band. This is the regression that band would cause.
    assert lo < -690.36 < hi, (lo, hi)
    assert not (-600.0 <= -690.36 <= -100.0)

    ethanol = [6, 6, 8, 1, 1, 1, 1, 1, 1]
    lo, hi = mc.expected_energy_range(off, ethanol)
    assert lo < -469.04 < hi, (lo, hi)   # measured MACE-OFF23 small value

    # Bromine drags the band by four orders of magnitude, which is exactly why
    # one fixed band cannot work for this family.
    lo_br, hi_br = mc.expected_energy_range(off, [35, 35])
    assert lo_br < -70045.28 < hi_br, (lo_br, hi_br)

    # Bands are tight: ~20 eV/atom wide, not thousands.
    for zs in (water, ethanol, [35, 35]):
        lo, hi = mc.expected_energy_range(off, zs)
        assert hi - lo < 25.0, (zs, lo, hi)

    # No composition -> the composition-agnostic band, unchanged.
    assert mc.expected_energy_range(off) == off.plausible_energy_range
    # An element the model never saw cannot produce a band.
    _expect_value_error(mc.expected_energy_range, off, [26])
    _expect_value_error(mc.expected_energy_range, off, [])


def test_energy_bands_separate_the_two_reference_conventions():
    """
    The single job a composition-agnostic band can do: catch a number computed
    with one model and labelled with another.
    """
    off = mc.resolve_model("MACE-OFF23", "medium")
    mp = mc.resolve_model("MACE-MP-0", "medium")

    mp_value = -5.21      # measured, MACE-MP-0 medium on ethanol
    off_value = -469.03   # measured, MACE-OFF23 medium on ethanol

    def inside(entry, value):
        lo, hi = entry.plausible_energy_range
        return lo <= value <= hi

    assert inside(mp, mp_value) and not inside(mp, off_value)
    assert inside(off, off_value) and not inside(off, mp_value)

    # Measured MACE-MP extremes must be inside the MACE-MP band: Gd's E0 alone
    # is -18.52 eV/atom (below CLAUDE.md's -15 floor) and solid Xe is positive.
    for value in (-18.52 - 4.0, 9.85):
        assert inside(mp, value), value

    # The MACE-MP family has no E0 table, so a composition hint changes nothing
    # — documented fallback, not silent degradation.
    assert mc.expected_energy_range(mp, [26, 8]) == mp.plausible_energy_range


def test_r2scan_entry_is_flagged_as_a_different_energy_zero():
    """
    Measured: ethanol is -5.4866 eV/atom under MATPES-r2SCAN and -5.1975 under
    MATPES-PBE. Differencing the two would be meaningless, so the entry has to
    say so somewhere a reader will see it.
    """
    r2scan = mc.resolve_model("MACE-MATPES-R2SCAN-0")
    assert "r2SCAN" in r2scan.level_of_theory
    assert "meta-GGA" in r2scan.level_of_theory
    blob = " ".join(r2scan.notes).lower()
    assert "energy zero" in blob or "different level of theory" in blob, r2scan.notes

    pbe = mc.resolve_model("MACE-MATPES-PBE-0")
    assert "r2SCAN" not in pbe.level_of_theory
    assert pbe.level_of_theory != r2scan.level_of_theory


# ────────────────────────────────────────────────────────────────────────────
# 5. OPT-IN: real checkpoints, real single-points
# ────────────────────────────────────────────────────────────────────────────


def _probe_molecule():
    """Ethanol, from the repo's own demo file, or a built-in fallback."""
    from ase import Atoms
    from ase.io import read

    demo = Path(__file__).resolve().parent.parent / "public" / "demo" / "ethanol.xyz"
    if demo.is_file():
        return read(str(demo), format="extxyz")
    # Water, so the test still means something if the demo file moves.
    return Atoms("OH2", positions=[(0, 0, 0), (0.96, 0, 0), (-0.24, 0.93, 0)])


def _single_point_check(model_type, model_size):
    import numpy as np

    entry = mc.resolve_model(model_type, model_size)
    atoms = _probe_molecule()
    zs = list(atoms.get_atomic_numbers())

    mc.require_elements(entry, zs)              # must pass for this probe
    calc = mc.build_calculator(entry, device="cpu")   # also re-checks coverage

    # The coverage published in the catalog is the coverage of the weights.
    declared = tuple(sorted(entry.elements))
    actual = tuple(sorted(int(z) for z in calc.z_table.zs))
    assert actual == declared, (
        f"{entry.key}: checkpoint covers {len(actual)} elements, catalog "
        f"publishes {len(declared)}"
    )

    atoms.calc = calc
    energy = float(atoms.get_potential_energy())
    forces = np.asarray(atoms.get_forces())
    per_atom = energy / len(atoms)

    lo, hi = mc.expected_energy_range(entry, zs)
    assert lo <= per_atom <= hi, (
        f"{entry.key}: {per_atom:.4f} eV/atom outside expected band "
        f"({lo:.4f}, {hi:.4f})"
    )
    plo, phi = entry.plausible_energy_range
    assert plo <= per_atom <= phi, f"{entry.key}: outside plausible band"

    # Newton's third law: the net force on an isolated molecule is zero.
    net = float(np.linalg.norm(forces.sum(axis=0)))
    assert net < 1e-6, f"{entry.key}: net force {net:.3e} eV/A"
    assert np.isfinite(forces).all()

    dtype = str(next(calc.models[0].parameters()).dtype).rsplit(".", 1)[-1]
    assert dtype == entry.upstream_default_dtype, (
        f"{entry.key}: loaded as {dtype}, catalog says the upstream default is "
        f"{entry.upstream_default_dtype}"
    )

    print(
        f"      {entry.key:26s} {len(atoms):3d} atoms  "
        f"E = {energy:14.4f} eV  ({per_atom:11.4f} eV/atom)  "
        f"|Fnet| = {net:.2e}  band ({lo:.1f}, {hi:.1f})  dtype {dtype}"
    )
    return per_atom


def test_download_mace_off23_small_single_point():
    if not DOWNLOAD:
        raise Skip("needs a checkpoint; re-run with --download")
    per_atom = _single_point_check("MACE-OFF23", "small")
    # Regression guard against the measured value on this repo's ethanol.xyz.
    assert -470.0 < per_atom < -468.0, per_atom


def test_download_mace_mp_variant_single_point():
    if not DOWNLOAD:
        raise Skip("needs a checkpoint; re-run with --download")
    per_atom = _single_point_check("MACE-MP-0", "small")
    assert -6.0 < per_atom < -4.0, per_atom


def test_download_mace_mpa_0_single_point():
    if not DOWNLOAD:
        raise Skip("needs a checkpoint; re-run with --download")
    # MACE-MPA-0 is the entry with the mace_mp(model=None) trap in its notes:
    # if build_calculator ever stopped passing an explicit string, this is
    # still the model that would load, so the useful check here is that the
    # OTHER MACE-MP entries do not silently become this one.
    mpa = _single_point_check("MACE-MPA-0", "medium")
    mp0 = _single_point_check("MACE-MP-0", "medium")
    assert abs(mpa - mp0) > 1e-6, (
        "MACE-MPA-0 and MACE-MP-0 medium returned identical energies — one of "
        "them resolved to the other's weights"
    )


def test_download_element_rejection_precedes_a_real_load():
    if not DOWNLOAD:
        raise Skip("needs a checkpoint; re-run with --download")
    from ase import Atoms

    entry = mc.resolve_model("MACE-OFF23", "small")
    rust = Atoms("FeO", positions=[(0, 0, 0), (1.6, 0, 0)])
    _expect_value_error(mc.require_elements, entry, rust.get_atomic_numbers())

    # The same structure through a MACE-MP model does work, so the rejection
    # above was about coverage and not about the structure being malformed.
    mp = mc.resolve_model("MACE-MP-0", "small")
    mc.require_elements(mp, rust.get_atomic_numbers())
    rust.calc = mc.build_calculator(mp, device="cpu")
    assert float(rust.get_potential_energy()) < 0.0


# ────────────────────────────────────────────────────────────────────────────
# Runner
# ────────────────────────────────────────────────────────────────────────────


def main() -> int:
    tests = [
        (name, obj)
        for name, obj in sorted(globals().items())
        if name.startswith("test_") and callable(obj)
    ]
    passed = failed = skipped = 0
    failures: list[tuple[str, str]] = []

    print(f"model_catalog: {len(mc.list_entries())} entries, "
          f"{len(mc.list_model_types())} families; "
          f"downloads {'ON' if DOWNLOAD else 'OFF (--download to enable)'}\n")

    for name, fn in tests:
        try:
            fn()
        except Skip as exc:
            skipped += 1
            print(f"  SKIP  {name}  ({exc})")
        except Exception as exc:  # noqa: BLE001 — a test runner reports, never crashes
            failed += 1
            import traceback

            failures.append((name, traceback.format_exc()))
            print(f"  FAIL  {name}  {type(exc).__name__}: {exc}")
        else:
            passed += 1
            print(f"  ok    {name}")

    if failures:
        print("\n" + "=" * 76)
        for name, tb in failures:
            print(f"\n--- {name} ---\n{tb}")

    print(f"\n{passed} passed, {failed} failed, {skipped} skipped")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
