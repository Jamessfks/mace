#!/usr/bin/env python3
"""Preflight check for Quantum ESPRESSO pw.x used by MACE Freeze QE labeling."""

from __future__ import annotations

import os
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
    return dirs


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

    pseudo_raw = os.environ.get("ESPRESSO_PSEUDO", "").strip()
    if not pseudo_raw:
        print("- ESPRESSO_PSEUDO not set (required for QE labeling unless pseudo_dir is passed).")
        return 0

    pseudo_dir = Path(pseudo_raw).expanduser()
    if pseudo_dir.exists():
        print(f"- ESPRESSO_PSEUDO: {pseudo_dir.resolve()}")
    else:
        print(f"- ESPRESSO_PSEUDO is set but path does not exist: {pseudo_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
