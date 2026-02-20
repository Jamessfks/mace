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
import re
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


# QE 7.x expects UPF pseudopotentials for stable/portable usage.
PSEUDO_SUFFIXES = (".upf",)


def _iter_pseudo_files(pseudo_dir: Path) -> list[Path]:
    files: list[Path] = []
    try:
        for item in pseudo_dir.iterdir():
            if not item.is_file():
                continue
            if item.name.lower().endswith(PSEUDO_SUFFIXES):
                files.append(item)
    except Exception:
        return []
    return sorted(files, key=lambda p: p.name.lower())


def _pseudo_filename_score(symbol: str, filename: str) -> int:
    """
    Score how confidently a pseudo filename matches an element symbol.
    Higher is better; 0 means "does not look like a match".
    """
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
    """
    Fallback matcher for unusual filenames:
    parse the UPF header and check declared element.
    """
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            head = handle.read(8192)
    except Exception:
        return False
    match = re.search(r'element\s*=\s*["\']?\s*([A-Za-z]{1,2})', head, flags=re.IGNORECASE)
    return bool(match and match.group(1).capitalize() == symbol.capitalize())


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


def _iter_pseudo_dirs_from_qe_command(qe_command: str) -> list[Path]:
    try:
        parts = shlex.split(qe_command)
    except ValueError:
        return []
    if not parts:
        return []

    dirs: list[Path] = []
    exe_path = Path(parts[0]).expanduser()
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


def resolve_pseudo_dir(raw_pseudo_dir: str, qe_command: str) -> Path:
    explicit = raw_pseudo_dir.strip()
    if explicit:
        pseudo_dir = Path(explicit).expanduser()
        if not pseudo_dir.exists():
            raise FileNotFoundError(f"pseudo_dir not found: {pseudo_dir}")
        if not _has_upf_files(pseudo_dir):
            raise ValueError(
                f"pseudo_dir contains no .UPF files: {pseudo_dir}. "
                "Provide a directory containing UPF pseudopotentials."
            )
        return pseudo_dir.resolve()

    candidates: list[Path] = []
    candidates.extend(_iter_env_pseudo_dirs())
    candidates.extend(_iter_pseudo_dirs_from_qe_command(qe_command))
    candidates.extend(Path(item) for item in COMMON_QE_PSEUDO_DIRS)
    unique_candidates = _unique_paths(candidates)

    for candidate in unique_candidates:
        if _has_upf_files(candidate):
            return candidate.resolve()

    existing_dirs = [path for path in unique_candidates if path.is_dir()]
    if existing_dirs:
        sample = ", ".join(f"`{path}`" for path in existing_dirs[:3])
        raise ValueError(
            "pseudo_dir is required for QE labeling (or set ESPRESSO_PSEUDO). "
            f"Auto-detection found directories without .UPF files: {sample}. "
            "Set pseudo_dir in the UI, set ESPRESSO_PSEUDO/QE_PSEUDO_DIR, "
            "or provide UPF files in one of those directories."
        )

    raise ValueError(
        "pseudo_dir is required for QE labeling (or set ESPRESSO_PSEUDO). "
        "Could not auto-detect a pseudopotential directory containing .UPF files. "
        "Set pseudo_dir in the UI or set ESPRESSO_PSEUDO / QE_PSEUDO_DIR."
    )


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
    pseudo_files = _iter_pseudo_files(pseudo_dir)
    if not pseudo_files:
        raise ValueError(
            f"No UPF pseudopotential files found in {pseudo_dir}. "
            "Provide QE-compatible .UPF files or pass --pseudos_json mapping."
        )

    # First: strict filename-token matching to avoid accidental O->Au/H->Rh matches.
    scored: list[tuple[int, str]] = []
    for item in pseudo_files:
        score = _pseudo_filename_score(symbol, item.name)
        if score > 0:
            scored.append((score, item.name))
    if scored:
        # Deterministic choice: highest confidence, then lexicographically smallest.
        scored.sort(key=lambda t: (-t[0], t[1].lower()))
        return scored[0][1]

    # Fallback for unconventional filenames: inspect element declared in UPF header.
    declared = [item.name for item in pseudo_files if _pseudo_declares_symbol(item, symbol)]
    if declared:
        return sorted(declared, key=str.lower)[0]

    available_preview = ", ".join(item.name for item in pseudo_files[:8])
    suffix = " ..." if len(pseudo_files) > 8 else ""
    raise ValueError(
        f"No UPF pseudopotential found for element {symbol} in {pseudo_dir}. "
        f"Available UPF files: {available_preview}{suffix}. "
        "Pass --pseudos_json for explicit mapping if filenames are non-standard."
    )


def resolve_pseudos_for_symbols(
    symbols: list[str],
    pseudo_dir: Path,
    pseudos_override: dict[str, str],
) -> dict[str, str]:
    """
    Resolve a deterministic pseudo mapping for all required symbols before QE starts.
    Failing early here avoids expensive runs ending with opaque runtime errors.
    """
    resolved: dict[str, str] = {}
    for sym in sorted(set(symbols)):
        if sym in pseudos_override:
            candidate = pseudos_override[sym]
            cpath = Path(candidate).expanduser()
            if cpath.is_absolute():
                if not cpath.is_file():
                    raise FileNotFoundError(
                        f"pseudos_json entry for {sym} points to missing file: {cpath}"
                    )
                resolved[sym] = str(cpath.resolve())
                continue
            rel = pseudo_dir / candidate
            if not rel.is_file():
                raise FileNotFoundError(
                    f"pseudos_json entry for {sym} not found under pseudo_dir: {rel}"
                )
            resolved[sym] = candidate
            continue
        resolved[sym] = find_pseudo(sym, pseudo_dir)
    return resolved


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


def _is_espresso_api_mismatch(exc: Exception) -> bool:
    msg = str(exc)
    markers = (
        "Espresso calculator is being restructured",
        "unexpected keyword argument",
        "missing 1 required positional argument",
    )
    return any(marker in msg for marker in markers)


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
    # Try legacy command/pseudo_dir first.
    try:
        return Espresso(
            pseudopotentials=pseudos,
            pseudo_dir=str(pseudo_dir),
            input_data=input_data,
            kpts=kpts,
            directory=str(workdir),
            command=command,
        )
    except Exception as legacy_exc:
        if not _is_espresso_api_mismatch(legacy_exc):
            raise

    # Then try profile-based variants (newer ASE APIs).
    try:
        from ase.calculators.espresso import EspressoProfile
    except Exception as exc:  # pragma: no cover - depends on ASE version
        raise RuntimeError(
            "ASE Espresso constructor mismatch and EspressoProfile is unavailable. "
            "Upgrade ASE or provide a compatible version."
        ) from exc

    argv = shlex.split(command)
    profile_kwargs_candidates: list[dict[str, Any]] = [
        {"command": command, "pseudo_dir": str(pseudo_dir)},
        {"argv": argv, "pseudo_dir": str(pseudo_dir)},
        {"argv": argv},
    ]
    profile_errors: list[str] = []

    for profile_kwargs in profile_kwargs_candidates:
        try:
            profile = EspressoProfile(**profile_kwargs)
        except Exception as exc:
            profile_errors.append(f"EspressoProfile({profile_kwargs!r}) failed: {exc}")
            continue

        espresso_base = {
            "profile": profile,
            "pseudopotentials": pseudos,
            "input_data": input_data,
            "kpts": kpts,
            "directory": str(workdir),
        }
        # Some versions accept pseudo_dir in profile only; some also accept it in Espresso kwargs.
        for include_pseudo_dir in (False, True):
            espresso_kwargs = dict(espresso_base)
            if include_pseudo_dir:
                espresso_kwargs["pseudo_dir"] = str(pseudo_dir)
            try:
                return Espresso(**espresso_kwargs)
            except Exception as exc:
                profile_errors.append(
                    f"Espresso(profile=..., include_pseudo_dir={include_pseudo_dir}) failed: {exc}"
                )
                continue

    raise RuntimeError(
        "Unable to construct ASE Espresso calculator with this ASE version. "
        "Try upgrading ASE, or provide compatible QE/ASE versions. "
        + " | ".join(profile_errors[-3:])
    )


def _configure_qe_runtime_env() -> None:
    """
    Apply conservative defaults for threaded math runtimes when running QE.
    This reduces oversubscription/memory spikes on laptops while still letting
    users override via explicit environment variables.
    """
    for key in (
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
        "NUMEXPR_NUM_THREADS",
    ):
        os.environ.setdefault(key, "1")


def _collect_required_symbols(atoms_list) -> list[str]:
    symbols: set[str] = set()
    for atoms in atoms_list:
        symbols.update(atoms.get_chemical_symbols())
    return sorted(symbols)


def _read_qe_output_tail(workdir: Path, max_lines: int = 30) -> str:
    for name in ("espresso.pwo", "espresso.out", "pw.out", "espresso.err", "pw.err"):
        path = workdir / name
        if not path.exists():
            continue
        try:
            lines = path.read_text(errors="ignore").splitlines()
        except Exception:
            continue
        if not lines:
            continue
        tail = lines[-max_lines:]
        return " | ".join(line.strip() for line in tail if line.strip())
    return ""


def _format_qe_runtime_failure(
    exc: Exception,
    *,
    idx: int,
    atoms,
    workdir: Path,
    command: str,
    pseudos: dict[str, str],
) -> str:
    parts: list[str] = [
        f"QE labeling failed for structure index {idx} ({len(atoms)} atoms).",
        f"workdir={workdir}.",
        f"command={command}.",
    ]
    if isinstance(exc, subprocess.CalledProcessError):
        parts.append(f"pw.x return code={exc.returncode}.")
        if exc.returncode in (-9, 9):
            parts.append(
                "pw.x was killed by SIGKILL (likely OS memory pressure). "
                "Try fewer/lighter structures, lower cutoffs, and verify pseudo mapping."
            )
    parts.append(f"pseudopotentials={json.dumps(pseudos, sort_keys=True)}.")
    tail = _read_qe_output_tail(workdir)
    if tail:
        parts.append(f"QE output tail: {tail}")
    return " ".join(parts)


def label_with_qe(atoms_list, args) -> list:
    try:
        import ase.calculators.espresso  # noqa: F401
    except Exception as exc:
        raise RuntimeError(
            "ASE Quantum ESPRESSO support is unavailable. Install ASE with Espresso support."
        ) from exc

    qe_command = resolve_qe_command(args.qe_command)

    pseudo_dir = resolve_pseudo_dir(args.pseudo_dir, qe_command)

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
    _configure_qe_runtime_env()

    # Resolve pseudo mapping once up front so we fail fast with a clear message
    # instead of launching QE and failing deep in SCF.
    required_symbols = _collect_required_symbols(atoms_list)
    resolved_pseudos = resolve_pseudos_for_symbols(required_symbols, pseudo_dir, pseudos_override)

    labeled = []
    for idx, atoms in enumerate(atoms_list):
        pseudos = {
            sym: resolved_pseudos[sym]
            for sym in sorted(set(atoms.get_chemical_symbols()))
        }
        workdir = qe_work_root / f"struct_{idx:04d}"
        calc = make_espresso_calc(
            pseudo_dir=pseudo_dir,
            pseudos=pseudos,
            input_data=input_data,
            kpts=kpts,
            workdir=workdir,
            command=qe_command,
        )
        try:
            atoms.calc = calc
            energy = atoms.get_potential_energy()
            forces = atoms.get_forces()
        except Exception as exc:
            raise RuntimeError(
                _format_qe_runtime_failure(
                    exc,
                    idx=idx,
                    atoms=atoms,
                    workdir=workdir,
                    command=qe_command,
                    pseudos=pseudos,
                )
            ) from exc
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

    try:
        sys.exit(main())
    except Exception as exc:
        # Keep CLI/API stderr concise and structured for frontend parsing.
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
