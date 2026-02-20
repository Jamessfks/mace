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
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any

from ase.io import read, write

COMMON_QE_EXECUTABLES = (
    "/usr/bin/pw.x",
    "/usr/bin/pw",
    "/opt/local/bin/pw.x",
    "/opt/local/bin/pw",
    "/opt/homebrew/opt/quantum-espresso/bin/pw.x",
    "/usr/local/opt/quantum-espresso/bin/pw.x",
    "/opt/homebrew/bin/pw.x",
    "/usr/local/bin/pw.x",
    "/opt/conda/bin/pw.x",
    "/opt/conda/bin/pw",
    "/opt/homebrew/bin/pw",
    "/usr/local/bin/pw",
)


def _resolve_executable_path(token: str) -> str | None:
    candidate = Path(token).expanduser()
    if candidate.is_dir():
        for subdir in ("", "bin", "build/bin"):
            base_dir = candidate if not subdir else (candidate / subdir)
            for name in ("pw.x", "pw"):
                nested = base_dir / name
                if nested.is_file() and os.access(nested, os.X_OK):
                    return str(nested.resolve())
    if candidate.is_file() and os.access(candidate, os.X_OK):
        return str(candidate.resolve())
    resolved = shutil.which(token)
    if resolved:
        return resolved
    return None


def _iter_env_bin_dirs() -> list[Path]:
    dirs: list[Path] = []
    for key in ("QE_BIN_DIR", "ESPRESSO_BIN"):
        raw = os.environ.get(key, "").strip()
        if raw:
            dirs.append(Path(raw).expanduser())
    for key in ("QE_HOME", "ESPRESSO_HOME", "CONDA_PREFIX"):
        raw = os.environ.get(key, "").strip()
        if raw:
            dirs.append(Path(raw).expanduser() / "bin")
    # de-duplicate while preserving order
    seen: set[str] = set()
    unique: list[Path] = []
    for item in dirs:
        key = str(item)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _resolve_from_login_shell(token: str) -> str | None:
    shells = [os.environ.get("SHELL", "").strip(), "/bin/zsh", "/bin/bash"]
    seen: set[str] = set()
    for shell in shells:
        if not shell or shell in seen or not Path(shell).exists():
            continue
        seen.add(shell)
        try:
            proc = subprocess.run(
                [shell, "-lc", f"command -v {shlex.quote(token)}"],
                capture_output=True,
                text=True,
                timeout=3,
            )
        except Exception:
            continue
        if proc.returncode != 0:
            continue
        candidate = proc.stdout.strip().splitlines()[0] if proc.stdout.strip() else ""
        resolved = _resolve_executable_path(candidate)
        if resolved:
            return resolved
    return None


def _resolve_from_brew(tokens: list[str]) -> str | None:
    for brew_token in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew", "brew"):
        brew_path = _resolve_executable_path(brew_token)
        if not brew_path:
            continue
        try:
            proc = subprocess.run(
                [brew_path, "--prefix", "quantum-espresso"],
                capture_output=True,
                text=True,
                timeout=3,
            )
        except Exception:
            continue
        if proc.returncode != 0:
            continue
        prefix = proc.stdout.strip()
        if not prefix:
            continue
        for token in tokens:
            resolved = _resolve_executable_path(str(Path(prefix) / "bin" / token))
            if resolved:
                return resolved
    return None


def _iter_qe_source_roots() -> list[Path]:
    home = Path.home()
    patterns = [
        home / "Downloads" / "qe-*",
        home / "Downloads" / "QE-*",
        home / "Downloads" / "quantum-espresso*",
        home / "Downloads" / "Quantum-Espresso*",
        home / "Downloads" / "QuantumESPRESSO*",
        home / "qe-*",
        home / "QE-*",
        home / "quantum-espresso*",
        home / "Quantum-Espresso*",
        home / "QuantumESPRESSO*",
    ]
    roots: list[Path] = []
    seen: set[str] = set()
    for pattern in patterns:
        for source_root in sorted(pattern.parent.glob(pattern.name)):
            if not source_root.is_dir():
                continue
            key = str(source_root.resolve())
            if key in seen:
                continue
            seen.add(key)
            roots.append(source_root)
    return roots


def _resolve_from_user_locations(tokens: list[str]) -> str | None:
    for source_root in _iter_qe_source_roots():
        for bin_dir in (source_root / "bin", source_root / "build" / "bin"):
            if not bin_dir.is_dir():
                continue
            for token in tokens:
                resolved = _resolve_executable_path(str(bin_dir / token))
                if resolved:
                    return resolved
    return None


def _qe_install_hint() -> str:
    for source_root in _iter_qe_source_roots():
        if (source_root / "PW" / "src").exists():
            pw_candidates = [
                source_root / "bin" / "pw.x",
                source_root / "bin" / "pw",
                source_root / "build" / "bin" / "pw.x",
                source_root / "build" / "bin" / "pw",
            ]
            for candidate in pw_candidates:
                if candidate.is_file():
                    if os.access(candidate, os.X_OK):
                        return (
                            f"QE binaries detected at `{candidate.parent}`; set QE command to "
                            f"`{candidate.resolve()}` (or add that directory to PATH)."
                        )
                    return f"QE binary exists but is not executable: `{candidate}`."
            return (
                f"QE source tree detected at `{source_root}`; build binaries there "
                "(for example: `./configure && make pw`)."
            )

    brew_path = _resolve_executable_path("/opt/homebrew/bin/brew") or _resolve_executable_path("brew")
    if brew_path:
        try:
            proc = subprocess.run(
                [brew_path, "list", "--versions", "quantum-espresso"],
                capture_output=True,
                text=True,
                timeout=3,
            )
            if not proc.stdout.strip():
                return "Install with Homebrew: `brew install quantum-espresso`."
        except Exception:
            pass
    return ""


def resolve_qe_command(raw_command: str) -> str:
    """
    Resolve a runnable QE command string.
    Priority:
    1) explicit qe_command argument
    2) QE_COMMAND env when qe_command is empty/default ("pw.x")
    3) default "pw.x"
    """
    env_override = os.environ.get("QE_COMMAND", "").strip()
    selected = raw_command.strip()
    if env_override and selected in ("", "pw.x"):
        selected = env_override
    if not selected:
        selected = "pw.x"

    try:
        parts = shlex.split(selected)
    except ValueError as exc:
        raise ValueError(f"Invalid qe_command: {selected!r}") from exc
    if not parts:
        parts = ["pw.x"]

    resolved_exe = _resolve_executable_path(parts[0])
    if resolved_exe is None and parts[0] in ("pw.x", "pw"):
        tokens = [parts[0], "pw.x", "pw"]
        # Check QE-specific env directories first.
        for bin_dir in _iter_env_bin_dirs():
            for token in tokens:
                resolved = _resolve_executable_path(str(bin_dir / token))
                if resolved:
                    resolved_exe = resolved
                    break
            if resolved_exe:
                break
        # Try common install paths.
        if resolved_exe is None:
            for item in COMMON_QE_EXECUTABLES:
                resolved = _resolve_executable_path(item)
                if resolved:
                    resolved_exe = resolved
                    break
        # Try Homebrew prefix if brew exists.
        if resolved_exe is None:
            resolved_exe = _resolve_from_brew(tokens)
        # Try common user install/source locations.
        if resolved_exe is None:
            resolved_exe = _resolve_from_user_locations(tokens)
        # Last attempt: ask login shell PATH (covers GUI app PATH mismatch).
        if resolved_exe is None:
            for token in tokens:
                resolved_exe = _resolve_from_login_shell(token)
                if resolved_exe:
                    break
    if resolved_exe is None:
        install_hint = _qe_install_hint()
        suffix = f" {install_hint}" if install_hint else ""
        raise RuntimeError(
            f"Quantum ESPRESSO executable not found: {parts[0]}. "
            "Set QE command in the UI (absolute path), set QE_COMMAND/QE_BIN_DIR/ESPRESSO_BIN, "
            f"or add the QE bin directory to PATH.{suffix}"
        )

    parts[0] = resolved_exe
    return shlex.join(parts)


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

    qe_command = resolve_qe_command(args.qe_command)

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
            command=qe_command,
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
