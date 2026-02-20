#!/usr/bin/env python3
"""Preflight check for Quantum ESPRESSO pw.x used by MACE Freeze QE labeling."""

from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import sys
from pathlib import Path

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

COMMON_QE_PSEUDO_DIRS = (
    "/usr/share/espresso/pseudo",
    "/usr/local/share/espresso/pseudo",
    "/opt/homebrew/share/qe/pseudo",
    "/opt/homebrew/share/espresso/pseudo",
    "/opt/local/share/qe/pseudo",
    "/opt/local/share/espresso/pseudo",
    "/opt/conda/share/qe/pseudo",
    "/opt/conda/share/espresso/pseudo",
)


def _unique_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    unique: list[Path] = []
    for item in paths:
        expanded = item.expanduser()
        key = str(expanded)
        if key in seen:
            continue
        seen.add(key)
        unique.append(expanded)
    return unique


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
    return _unique_paths(dirs)


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
    for pattern in patterns:
        for source_root in sorted(pattern.parent.glob(pattern.name)):
            if source_root.is_dir():
                roots.append(source_root)
    return _unique_paths(roots)


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


def _has_upf_files(pseudo_dir: Path) -> bool:
    if not pseudo_dir.is_dir():
        return False
    try:
        for item in pseudo_dir.iterdir():
            if item.is_file() and item.name.lower().endswith(".upf"):
                return True
    except Exception:
        return False
    return False


def _iter_upf_files(pseudo_dir: Path) -> list[Path]:
    files: list[Path] = []
    try:
        for item in pseudo_dir.iterdir():
            if item.is_file() and item.name.lower().endswith(".upf"):
                files.append(item)
    except Exception:
        return []
    return sorted(files, key=lambda p: p.name.lower())


def _pseudo_filename_score(symbol: str, filename: str) -> int:
    sym = symbol.lower()
    stem = Path(filename).stem.lower()
    if re.match(rf"^{re.escape(sym)}($|[._\-0-9])", stem):
        return 4
    if re.search(rf"(^|[._\-]){re.escape(sym)}($|[._\-])", stem):
        return 3
    if stem.startswith(sym):
        return 2
    return 0


def _pseudo_declares_symbol(path: Path, symbol: str) -> bool:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            head = handle.read(8192)
    except Exception:
        return False
    match = re.search(r'element\s*=\s*["\']?\s*([A-Za-z]{1,2})', head, flags=re.IGNORECASE)
    return bool(match and match.group(1).capitalize() == symbol.capitalize())


def find_pseudo_for_symbol(symbol: str, pseudo_dir: Path) -> str | None:
    files = _iter_upf_files(pseudo_dir)
    if not files:
        return None
    scored: list[tuple[int, str]] = []
    for item in files:
        score = _pseudo_filename_score(symbol, item.name)
        if score > 0:
            scored.append((score, item.name))
    if scored:
        scored.sort(key=lambda t: (-t[0], t[1].lower()))
        return scored[0][1]
    declared = [item.name for item in files if _pseudo_declares_symbol(item, symbol)]
    if declared:
        return sorted(declared, key=str.lower)[0]
    return None


def _iter_env_pseudo_dirs() -> list[Path]:
    dirs: list[Path] = []
    for key in ("ESPRESSO_PSEUDO", "QE_PSEUDO_DIR", "PSEUDO_DIR"):
        raw = os.environ.get(key, "").strip()
        if raw:
            dirs.append(Path(raw))
    for key in ("QE_HOME", "ESPRESSO_HOME"):
        raw = os.environ.get(key, "").strip()
        if raw:
            dirs.append(Path(raw) / "pseudo")
    conda_prefix = os.environ.get("CONDA_PREFIX", "").strip()
    if conda_prefix:
        dirs.append(Path(conda_prefix) / "share" / "qe" / "pseudo")
        dirs.append(Path(conda_prefix) / "share" / "espresso" / "pseudo")
    return _unique_paths(dirs)


def _iter_pseudo_dirs_from_qe_exe(qe_executable: str) -> list[Path]:
    dirs: list[Path] = []
    exe_path = Path(qe_executable).expanduser()
    if exe_path.exists():
        resolved_exe = exe_path.resolve()
        for parent in list(resolved_exe.parents)[:8]:
            dirs.append(parent / "pseudo")
            dirs.append(parent / "share" / "qe" / "pseudo")
            dirs.append(parent / "share" / "espresso" / "pseudo")
            dirs.append(parent / "share" / "quantum-espresso" / "pseudo")
    for source_root in _iter_qe_source_roots():
        dirs.append(source_root / "pseudo")
    return _unique_paths(dirs)


def resolve_pseudo_dir(qe_executable: str) -> tuple[Path | None, str | None]:
    candidates: list[Path] = []
    candidates.extend(_iter_env_pseudo_dirs())
    candidates.extend(_iter_pseudo_dirs_from_qe_exe(qe_executable))
    candidates.extend(Path(item) for item in COMMON_QE_PSEUDO_DIRS)
    unique_candidates = _unique_paths(candidates)

    for candidate in unique_candidates:
        if _has_upf_files(candidate):
            return candidate.resolve(), None

    existing_dirs = [path for path in unique_candidates if path.is_dir()]
    if existing_dirs:
        sample = ", ".join(str(path) for path in existing_dirs[:3])
        return None, f"Pseudo directories found but no .UPF files detected (sample: {sample})."
    return None, "No pseudopotential directory with .UPF files was auto-detected."


def resolve_qe_binary() -> tuple[str | None, str, str | None]:
    env_qe_command = os.environ.get("QE_COMMAND", "").strip()
    selected_command = env_qe_command or "pw.x"

    try:
        parts = shlex.split(selected_command)
    except ValueError:
        return None, selected_command, "QE_COMMAND is not valid shell syntax."
    if not parts:
        parts = ["pw.x"]

    resolved = _resolve_executable_path(parts[0])
    if resolved:
        return resolved, selected_command, None

    if parts[0] in ("pw.x", "pw"):
        tokens = [parts[0], "pw.x", "pw"]
        for bin_dir in _iter_env_bin_dirs():
            for token in tokens:
                resolved = _resolve_executable_path(str(bin_dir / token))
                if resolved:
                    return resolved, selected_command, None
        for item in COMMON_QE_EXECUTABLES:
            resolved = _resolve_executable_path(item)
            if resolved:
                return resolved, selected_command, None
        resolved = _resolve_from_user_locations(tokens)
        if resolved:
            return resolved, selected_command, None

    return None, selected_command, None


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Check Quantum ESPRESSO executable and pseudopotential setup."
    )
    ap.add_argument(
        "--symbols",
        default="",
        help="Optional comma/space separated element symbols to validate pseudo mapping (e.g. H,O or Si Ge).",
    )
    args = ap.parse_args()

    resolved, selected_command, error = resolve_qe_binary()
    if error:
        print("pw.x not found")
        print(f"- {error}")
        print("- See mace-api/MACE_Freeze/README.md for installing Quantum ESPRESSO.")
        return 1

    if not resolved:
        print("pw.x not found")
        print(f"- Tried command: {selected_command!r}")
        print("- Build QE with `./configure && make pw` if binaries are missing.")
        print("- Add QE bin to PATH, or set QE_COMMAND=/absolute/path/to/pw.x.")
        print("- See mace-api/MACE_Freeze/README.md for installing Quantum ESPRESSO.")
        return 1

    print("QE ready")
    print(f"- Resolved executable: {resolved}")

    pseudo_dir, pseudo_warning = resolve_pseudo_dir(resolved)
    if pseudo_dir:
        print(f"- Pseudopotentials: {pseudo_dir}")
        if not args.symbols.strip():
            print("- Note: pseudo directory presence was checked, but element coverage was not.")
            print("- Use --symbols \"...\" to validate required elements.")
    else:
        print("- Pseudopotentials: not auto-detected")
        if pseudo_warning:
            print(f"- {pseudo_warning}")
        print("- Set ESPRESSO_PSEUDO / QE_PSEUDO_DIR, or provide pseudo_dir in the UI.")
        return 0

    raw_symbols = args.symbols.replace(",", " ").split()
    symbols = sorted({sym.strip().capitalize() for sym in raw_symbols if sym.strip()})
    if symbols:
        missing: list[str] = []
        print(f"- Validating pseudo mapping for symbols: {', '.join(symbols)}")
        for sym in symbols:
            pseudo = find_pseudo_for_symbol(sym, pseudo_dir)
            if pseudo:
                print(f"  - {sym}: {pseudo}")
            else:
                missing.append(sym)
        if missing:
            print(
                "- Missing UPF files for symbols: "
                + ", ".join(missing)
                + ". Provide matching .UPF files or use pseudos_json explicit mapping."
            )
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
