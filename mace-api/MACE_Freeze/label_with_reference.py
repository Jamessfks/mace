#!/usr/bin/env python3
"""
label_with_reference.py — Label structures with a reference calculator.

References supported:
  - mace-mp (demo surrogate)
  - emt (demo surrogate)
  - qe / quantum-espresso (real DFT via ASE Espresso)

Usage:
  python label_with_reference.py \
    --input runs_web/xxx/to_label.xyz \
    --output runs_web/xxx/labeled_new.xyz \
    --reference qe \
    --pseudo_dir /path/to/pseudos \
    --kpts 1,1,1 \
    --device cpu
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any

from ase.io import read, write


def parse_kpts(kpts: str) -> tuple[int, int, int]:
    raw = [part.strip() for part in kpts.split(",")]
    if len(raw) != 3:
        raise ValueError(f"Invalid kpts={kpts}. Expected format: nx,ny,nz")
    return int(raw[0]), int(raw[1]), int(raw[2])


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def find_pseudo(symbol: str, pseudo_dir: Path) -> str:
    symbol_lower = symbol.lower()
    candidates: list[Path] = []
    for item in pseudo_dir.iterdir():
        if not item.is_file():
            continue
        name = item.name.lower()
        if not name.endswith(".upf"):
            continue
        if name.startswith(symbol_lower):
            candidates.append(item)
    if not candidates:
        for item in pseudo_dir.iterdir():
            if not item.is_file():
                continue
            name = item.name.lower()
            if name.endswith(".upf") and symbol_lower in name:
                candidates.append(item)
    if not candidates:
        raise ValueError(f"No UPF pseudopotential found for element {symbol} in {pseudo_dir}")
    return candidates[0].name


def build_pseudos(atoms, pseudo_dir: Path, pseudos_override: dict[str, str]) -> dict[str, str]:
    symbols = sorted(set(atoms.get_chemical_symbols()))
    pseudos: dict[str, str] = {}
    for sym in symbols:
        if sym in pseudos_override:
            pseudos[sym] = pseudos_override[sym]
        else:
            pseudos[sym] = find_pseudo(sym, pseudo_dir)
    return pseudos


def get_demo_calculator(reference: str, device: str):
    if reference in ("mace-mp", "mace_mp", "MACE-MP-0"):
        from mace.calculators import mace_mp

        return mace_mp(model="medium", device=device)
    if reference in ("emt", "EMT"):
        from ase.calculators.emt import EMT

        return EMT()
    raise ValueError(f"Unknown reference: {reference}. Use: mace-mp, emt, qe")


def build_qe_input(template_path: Path | None, ecutwfc: float, ecutrho: float) -> dict[str, Any]:
    default_input: dict[str, Any] = {
        "control": {"calculation": "scf", "tstress": True, "tprnfor": True},
        "system": {"ecutwfc": ecutwfc, "ecutrho": ecutrho},
        "electrons": {"conv_thr": 1.0e-8},
    }
    if not template_path:
        return default_input
    if not template_path.exists():
        raise FileNotFoundError(f"input_template not found: {template_path}")
    user_input = json.loads(template_path.read_text())
    if not isinstance(user_input, dict):
        raise ValueError("input_template must be a JSON object")
    return deep_merge(default_input, user_input)


def make_espresso_calc(
    pseudo_dir: Path,
    pseudos: dict[str, str],
    input_data: dict[str, Any],
    kpts: tuple[int, int, int],
    workdir: Path,
    command: str,
):
    from ase.calculators.espresso import Espresso

    workdir.mkdir(parents=True, exist_ok=True)

    # ASE has changed Espresso constructor signatures across versions.
    # Try legacy command/pseudo_dir first, then profile-based fallback.
    try:
        return Espresso(
            pseudopotentials=pseudos,
            pseudo_dir=str(pseudo_dir),
            input_data=input_data,
            kpts=kpts,
            directory=str(workdir),
            command=command,
        )
    except TypeError:
        try:
            from ase.calculators.espresso import EspressoProfile
        except Exception as exc:  # pragma: no cover - depends on ASE version
            raise RuntimeError(
                "ASE Espresso constructor mismatch and EspressoProfile is unavailable. "
                "Upgrade ASE or provide a compatible version."
            ) from exc
        profile = EspressoProfile(command=command, pseudo_dir=str(pseudo_dir))
        return Espresso(
            profile=profile,
            pseudopotentials=pseudos,
            input_data=input_data,
            kpts=kpts,
            directory=str(workdir),
        )


def label_with_qe(atoms_list, args) -> list:
    try:
        import ase.calculators.espresso  # noqa: F401
    except Exception as exc:
        raise RuntimeError(
            "ASE Quantum ESPRESSO support is unavailable. Install ASE with Espresso support."
        ) from exc

    command_bin = args.qe_command.strip().split()[0] if args.qe_command.strip() else "pw.x"
    if shutil.which(command_bin) is None:
        raise RuntimeError(
            f"Quantum ESPRESSO executable not found: {command_bin}. "
            "Install QE and ensure pw.x is on PATH."
        )

    pseudo_dir_raw = args.pseudo_dir or os.environ.get("ESPRESSO_PSEUDO", "")
    if not pseudo_dir_raw:
        raise ValueError("pseudo_dir is required for QE labeling (or set ESPRESSO_PSEUDO).")
    pseudo_dir = Path(pseudo_dir_raw).expanduser()
    if not pseudo_dir.exists():
        raise FileNotFoundError(f"pseudo_dir not found: {pseudo_dir}")

    pseudos_override: dict[str, str] = {}
    if args.pseudos_json:
        ppath = Path(args.pseudos_json).expanduser()
        if not ppath.exists():
            raise FileNotFoundError(f"pseudos_json not found: {ppath}")
        parsed = json.loads(ppath.read_text())
        if not isinstance(parsed, dict):
            raise ValueError("pseudos_json must contain an object map, e.g. {\"H\":\"H.upf\"}")
        pseudos_override = {str(k): str(v) for k, v in parsed.items()}

    input_template_path = Path(args.input_template).expanduser() if args.input_template else None
    input_data = build_qe_input(input_template_path, args.ecutwfc, args.ecutrho)
    kpts = parse_kpts(args.kpts)
    qe_work_root = Path(args.qe_workdir).expanduser() if args.qe_workdir else args.output.parent / "qe_work"
    qe_work_root.mkdir(parents=True, exist_ok=True)

    labeled = []
    for idx, atoms in enumerate(atoms_list):
        pseudos = build_pseudos(atoms, pseudo_dir, pseudos_override)
        workdir = qe_work_root / f"struct_{idx:04d}"
        calc = make_espresso_calc(
            pseudo_dir=pseudo_dir,
            pseudos=pseudos,
            input_data=input_data,
            kpts=kpts,
            workdir=workdir,
            command=args.qe_command,
        )
        atoms.calc = calc
        energy = atoms.get_potential_energy()
        forces = atoms.get_forces()
        atoms.info["TotEnergy"] = energy
        atoms.arrays["force"] = forces
        labeled.append(atoms)
    return labeled


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--reference", default="mace-mp", help="mace-mp, emt, qe, quantum-espresso")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--pseudo_dir", default="")
    ap.add_argument("--pseudos_json", default="")
    ap.add_argument("--input_template", default="")
    ap.add_argument("--qe_command", default="pw.x")
    ap.add_argument("--kpts", default="1,1,1")
    ap.add_argument("--ecutwfc", type=float, default=60.0)
    ap.add_argument("--ecutrho", type=float, default=480.0)
    ap.add_argument("--qe_workdir", default="")
    args = ap.parse_args()

    atoms_list = read(str(args.input), ":")
    ref = args.reference.lower()
    if ref in ("qe", "quantum-espresso", "quantum_espresso"):
        labeled = label_with_qe(atoms_list, args)
    else:
        calc = get_demo_calculator(args.reference, args.device)
        labeled = []
        for atoms in atoms_list:
            atoms.calc = calc
            energy = atoms.get_potential_energy()
            forces = atoms.get_forces()
            atoms.info["TotEnergy"] = energy
            atoms.arrays["force"] = forces
            labeled.append(atoms)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write(str(args.output), labeled, format="extxyz")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
