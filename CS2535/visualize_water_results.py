#!/usr/bin/env python3
"""
Generate user-friendly visualizations of MACE liquid water training results:
- Training curves (loss, MAE energy, MAE forces)
- 3D atom visualizations of water configurations (interactive + static)
- HTML report with explanations

Run: python3 visualize_water_results.py
Output: results_report/ (figures + water_results_report.html)
"""

import json
import os
import sys
from pathlib import Path

import numpy as np

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent
RESULTS_FILE = PROJECT_ROOT / "results" / "water_1k_small_run-123_train.txt"
TRAIN_XYZ = PROJECT_ROOT / "water_data" / "train.xyz"
TEST_XYZ = PROJECT_ROOT / "water_data" / "test.xyz"
OUT_DIR = PROJECT_ROOT / "results_report"

# Element colors (R, G, B) and radii for 3D display
ELEMENT_STYLE = {
    1: {"name": "H", "color": "#87CEEB", "size": 0.35},   # Hydrogen - light blue
    8: {"name": "O", "color": "#E63946", "size": 0.55},   # Oxygen - red
}


def load_training_metrics():
    """Parse MACE training log (JSONL) into eval and opt metrics."""
    if not RESULTS_FILE.exists():
        return [], []
    eval_rows = []
    opt_by_epoch = {}
    with open(RESULTS_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("mode") == "eval":
                eval_rows.append(row)
            elif row.get("mode") == "opt":
                e = row.get("epoch")
                if e is not None:
                    opt_by_epoch.setdefault(e, []).append(row["loss"])
    # Sort eval: put initial (epoch None) first, then by epoch
    eval_rows.sort(key=lambda r: (r.get("epoch") is not None, r.get("epoch") or -1))
    return eval_rows, opt_by_epoch


def plot_training_curves(eval_rows, opt_by_epoch, out_dir):
    """Create training curve figures (matplotlib)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not found; skipping training curves.")
        return []
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []

    # Eval metrics over time (initial + epoch 0, 1, ...)
    epochs = []
    mae_e_per_atom_mev = []
    mae_f_mev = []
    loss_eval = []
    for r in eval_rows:
        ep = r.get("epoch")
        if ep is None:
            epochs.append(-0.5)  # "Initial"
        else:
            epochs.append(ep)
        mae_e_per_atom_mev.append(r.get("mae_e_per_atom", 0) * 1000)  # eV -> meV
        mae_f_mev.append(r.get("mae_f", 0) * 1000)  # eV/A -> meV/A
        loss_eval.append(r.get("loss", 0))
    epochs, mae_e_per_atom_mev, mae_f_mev, loss_eval = (
        np.array(epochs), np.array(mae_e_per_atom_mev), np.array(mae_f_mev), np.array(loss_eval)
    )

    fig, axes = plt.subplots(1, 3, figsize=(12, 4))
    # Loss (validation)
    ax = axes[0]
    ax.plot(epochs, loss_eval, "o-", color="steelblue", linewidth=2, markersize=8)
    ax.set_xlabel("Epoch (validation)")
    ax.set_ylabel("Loss")
    ax.set_title("Validation loss")
    ax.grid(True, alpha=0.3)
    if len(epochs) > 1 and epochs[0] < 0:
        ax.set_xticks(list(epochs))
        ax.set_xticklabels(["Initial"] + [str(int(e)) for e in epochs[1:]])
    paths.append(out_dir / "curve_loss.png")
    fig.savefig(paths[-1], dpi=150, bbox_inches="tight")
    plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    # MAE Energy per atom (meV)
    ax = axes[0]
    ax.plot(epochs, mae_e_per_atom_mev, "s-", color="darkgreen", linewidth=2, markersize=8)
    ax.set_xlabel("Epoch (validation)")
    ax.set_ylabel("MAE energy per atom (meV)")
    ax.set_title("Energy error (per atom)")
    ax.grid(True, alpha=0.3)
    if len(epochs) > 1 and epochs[0] < 0:
        ax.set_xticks(list(epochs))
        ax.set_xticklabels(["Initial"] + [str(int(e)) for e in epochs[1:]])
    # MAE Forces (meV/Å)
    ax = axes[1]
    ax.plot(epochs, mae_f_mev, "^-", color="coral", linewidth=2, markersize=8)
    ax.set_xlabel("Epoch (validation)")
    ax.set_ylabel("MAE forces (meV/Å)")
    ax.set_title("Forces error")
    ax.grid(True, alpha=0.3)
    if len(epochs) > 1 and epochs[0] < 0:
        ax.set_xticks(list(epochs))
        ax.set_xticklabels(["Initial"] + [str(int(e)) for e in epochs[1:]])
    paths.append(out_dir / "curve_energy_forces.png")
    fig.savefig(paths[-1], dpi=150, bbox_inches="tight")
    plt.close(fig)

    # Optimizer loss per epoch (mean over batches)
    if opt_by_epoch:
        fig, ax = plt.subplots(figsize=(6, 4))
        ep_list = sorted(opt_by_epoch.keys())
        mean_loss = [np.mean(opt_by_epoch[e]) for e in ep_list]
        ax.plot(ep_list, mean_loss, "o-", color="purple", linewidth=1.5, markersize=5)
        ax.set_xlabel("Epoch")
        ax.set_ylabel("Mean training loss (batch)")
        ax.set_title("Training loss (optimizer)")
        ax.grid(True, alpha=0.3)
        paths.append(out_dir / "curve_train_loss.png")
        fig.savefig(paths[-1], dpi=150, bbox_inches="tight")
        plt.close(fig)
    return paths


def get_bonds(positions, numbers, cutoff=1.2):
    """Simple O-H bond list: pairs within cutoff (Å)."""
    from numpy.linalg import norm
    bonds = []
    n = len(numbers)
    for i in range(n):
        for j in range(i + 1, n):
            if (numbers[i] == 8 and numbers[j] == 1) or (numbers[i] == 1 and numbers[j] == 8):
                d = norm(positions[i] - positions[j])
                if d <= cutoff:
                    bonds.append((i, j))
    return bonds


def build_3d_atom_figure(positions, numbers, cell=None, title="Liquid water configuration"):
    """Build plotly Figure for 3D atoms (O and H) with optional bonds."""
    try:
        import plotly.graph_objects as go
    except ImportError:
        return None
    # Normalize positions into [0,1] for periodic cell for cleaner view (optional)
    pos = np.array(positions, dtype=float)
    if cell is not None and np.any(cell):
        cell = np.array(cell).reshape(3, 3)
        # optional: wrap into cell for visualization
        pass
    traces = []
    for z in ELEMENT_STYLE:
        mask = np.array(numbers) == z
        if not np.any(mask):
            continue
        x, y, z_ = pos[mask, 0], pos[mask, 1], pos[mask, 2]
        style = ELEMENT_STYLE[z]
        traces.append(
            go.Scatter3d(
                x=x, y=y, z=z_,
                mode="markers",
                name=style["name"],
                marker=dict(
                    size=style["size"] * 12,
                    color=style["color"],
                    line=dict(width=1, color="gray"),
                    opacity=0.95,
                ),
            )
        )
    bonds = get_bonds(pos, list(numbers))
    if bonds:
        all_x, all_y, all_z = [], [], []
        for i, j in bonds:
            for ind in [i, j]:
                all_x.append(pos[ind, 0])
                all_y.append(pos[ind, 1])
                all_z.append(pos[ind, 2])
            all_x.append(None)
            all_y.append(None)
            all_z.append(None)
        traces.append(
            go.Scatter3d(
                x=all_x, y=all_y, z=all_z,
                mode="lines",
                name="O–H bonds",
                line=dict(color="gray", width=2, dash="dot"),
            )
        )
    fig = go.Figure(data=traces)
    fig.update_layout(
        title=title,
        scene=dict(
            xaxis_title="x (Å)",
            yaxis_title="y (Å)",
            zaxis_title="z (Å)",
            aspectmode="data",
            bgcolor="white",
        ),
        showlegend=True,
        margin=dict(l=0, r=0, b=0, t=40),
        legend=dict(yanchor="top", y=0.99, xanchor="left", x=0.01),
    )
    return fig


def save_3d_static(atoms, path):
    """Save a single 3D view as PNG using matplotlib."""
    try:
        from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return False
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        pos = atoms.get_positions()
        numbers = atoms.get_atomic_numbers()
        fig = plt.figure(figsize=(8, 8))
        ax = fig.add_subplot(111, projection="3d")
        for z in (8, 1):
            mask = numbers == z
            if not np.any(mask):
                continue
            style = ELEMENT_STYLE.get(z, {"name": str(z), "color": "gray", "size": 0.4})
            ax.scatter(
                pos[mask, 0], pos[mask, 1], pos[mask, 2],
                c=style["color"], s=style["size"] * 400, alpha=0.9,
                label=style["name"], edgecolors="darkgray", linewidths=0.5,
            )
        ax.set_xlabel("x (Å)")
        ax.set_ylabel("y (Å)")
        ax.set_zlabel("z (Å)")
        ax.legend()
        ax.set_title("Liquid water — 3D atomic positions (O red, H blue)")
        plt.savefig(path, dpi=150, bbox_inches="tight")
        plt.close()
        return True
    except Exception as e:
        print(f"Warning: could not save static 3D image: {e}")
        plt.close("all")
        return False


def write_html_report(eval_rows, opt_by_epoch, curve_paths, plotly_html_path, static_3d_path):
    """Write a single HTML report with explanations and embedded visuals."""
    out_dir = Path(plotly_html_path).parent
    curve_rel = [Path(p).name for p in curve_paths] if curve_paths else []
    plotly_name = Path(plotly_html_path).name
    static_name = Path(static_3d_path).name if static_3d_path else None

    # Summary numbers
    initial = next((r for r in eval_rows if r.get("epoch") is None), None)
    epoch0 = next((r for r in eval_rows if r.get("epoch") == 0), None)
    mae_e_init = initial.get("mae_e_per_atom", 0) * 1000 if initial else None
    mae_f_init = initial.get("mae_f", 0) * 1000 if initial else None
    mae_e_0 = epoch0.get("mae_e_per_atom", 0) * 1000 if epoch0 else None
    mae_f_0 = epoch0.get("mae_f", 0) * 1000 if epoch0 else None

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MACE Liquid Water — Results &amp; Visualizations</title>
  <style>
    body {{ font-family: 'Segoe UI', system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; background: #f8f9fa; }}
    h1 {{ color: #1a1a2e; border-bottom: 2px solid #e63946; padding-bottom: 8px; }}
    h2 {{ color: #16213e; margin-top: 32px; }}
    .card {{ background: white; border-radius: 12px; padding: 20px; margin: 16px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }}
    .metric {{ display: inline-block; margin: 8px 16px 8px 0; padding: 10px 16px; background: #e8f4f8; border-radius: 8px; }}
    .metric strong {{ color: #0d47a1; }}
    img {{ max-width: 100%; height: auto; border-radius: 8px; }}
    .figure {{ margin: 20px 0; }}
    .figure figcaption {{ color: #555; font-size: 0.95em; margin-top: 8px; }}
    iframe {{ width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 8px; }}
    ul {{ line-height: 1.7; }}
    code {{ background: #eee; padding: 2px 6px; border-radius: 4px; }}
  </style>
</head>
<body>
  <h1>MACE Liquid Water — Results &amp; Visualizations</h1>
  <p>User-friendly summary of the MACE training run on the liquid water dataset (BingqingCheng/ab-initio-thermodynamics-of-water).</p>

  <div class="card">
    <h2>What the output means</h2>
    <ul>
      <li><strong>Training</strong>: MACE (a machine-learning potential) was trained to predict <em>energy</em> and <em>forces</em> of bulk liquid water from atomic positions (H and O). The reference data are DFT energies and forces.</li>
      <li><strong>Validation metrics</strong>: After each epoch, the model is evaluated on a held-out validation set. We report:
        <ul>
          <li><strong>Loss</strong>: Combined error the optimizer minimizes (energy and force terms). Lower is better.</li>
          <li><strong>MAE energy per atom (meV)</strong>: Mean absolute error in predicted energy per atom. 1 meV = 0.001 eV. Lower is better.</li>
          <li><strong>MAE forces (meV/Å)</strong>: Mean absolute error in predicted forces on atoms. Important for molecular dynamics. Lower is better.</li>
        </ul>
      </li>
      <li><strong>Findings</strong>: Forces typically improve quickly; energy per atom can be noisier early in training. Longer training (e.g. 800 epochs as in the MACE docs) improves both.</li>
    </ul>
  </div>

  <div class="card">
    <h2>Validation metrics (this run)</h2>
"""
    if mae_e_init is not None:
        html += f'    <p class="metric"><strong>Initial</strong> — MAE E/atom: {mae_e_init:.2f} meV, MAE F: {mae_f_init:.2f} meV/Å</p>\n'
    if mae_e_0 is not None:
        html += f'    <p class="metric"><strong>After epoch 0</strong> — MAE E/atom: {mae_e_0:.2f} meV, MAE F: {mae_f_0:.2f} meV/Å</p>\n'
    html += "  </div>\n"

    if curve_rel:
        html += '  <div class="card figure"><h2>Training curves</h2>\n'
        for p in curve_rel:
            html += f'    <img src="{p}" alt="curve" style="max-width:100%; margin:8px 0;">\n'
        html += '    <figcaption>Validation and training metrics vs epoch.</figcaption></div>\n'
    if static_name:
        html += f'  <div class="card figure"><h2>3D atomic structure (static)</h2><p>One snapshot of liquid water from the training set. Red = oxygen, blue = hydrogen.</p><img src="{static_name}" alt="3D water"></div>\n'
    if plotly_html_path and Path(plotly_html_path).exists():
        html += f'  <div class="card"><h2>3D atomic structure (interactive)</h2><p>Rotate and zoom in your browser. Red = oxygen (O), light blue = hydrogen (H).</p><iframe src="{plotly_name}" title="3D water"></iframe></div>\n'

    html += """  <div class="card">
    <h2>How to read the 3D view</h2>
    <ul>
      <li>Each sphere is an <strong>atom</strong> (position in space in Ångströms).</li>
      <li><strong>Oxygen (O)</strong> is shown in red; <strong>hydrogen (H)</strong> in light blue.</li>
      <li>Dotted lines indicate approximate O–H bonds (pairs within ~1.2 Å).</li>
      <li>This is one configuration (snapshot) of 64 water molecules in a periodic box from the dataset.</li>
    </ul>
  </div>
</body>
</html>
"""
    report_path = out_dir / "water_results_report.html"
    with open(report_path, "w") as f:
        f.write(html)
    return report_path


def main():
    try:
        from ase.io import read
    except ImportError:
        print("ASE (atomic simulation environment) is required: pip install ase")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load metrics
    eval_rows, opt_by_epoch = load_training_metrics()
    print(f"Loaded {len(eval_rows)} validation eval points, {len(opt_by_epoch)} epochs of optimizer loss.")

    # Training curves
    curve_paths = plot_training_curves(eval_rows, opt_by_epoch, OUT_DIR)
    for p in curve_paths:
        print(f"Saved: {p}")

    # 3D: load one config from train or test
    xyz_path = TRAIN_XYZ if TRAIN_XYZ.exists() else TEST_XYZ
    if not xyz_path.exists():
        print("No train/test.xyz found; skipping 3D visualization.")
        plotly_html_path = None
        static_3d_path = None
    else:
        configs = read(str(xyz_path), index=":")
        atoms = configs[0]
        positions = atoms.get_positions()
        numbers = atoms.get_atomic_numbers()
        try:
            cell = np.array(atoms.get_cell()) if hasattr(atoms, "get_cell") else None
        except TypeError:
            cell = None
        if cell is not None and hasattr(cell, "__array__"):
            cell = np.array(cell)
        else:
            cell = None

        # Static 3D (matplotlib)
        static_3d_path = OUT_DIR / "water_3d_static.png"
        if save_3d_static(atoms, static_3d_path):
            print(f"Saved: {static_3d_path}")
        else:
            static_3d_path = None

        # Interactive 3D (plotly)
        fig = build_3d_atom_figure(positions, numbers, cell, title="Liquid water — 3D view (rotate/zoom)")
        plotly_html_path = None
        if fig is not None:
            plotly_html_path = OUT_DIR / "water_3d_interactive.html"
            fig.write_html(str(plotly_html_path))
            print(f"Saved: {plotly_html_path}")
        else:
            print("Plotly not found; skipping interactive 3D.")

    # HTML report
    report_path = write_html_report(
        eval_rows, opt_by_epoch,
        curve_paths,
        plotly_html_path or "",
        str(static_3d_path) if static_3d_path else None,
    )
    report_abs = report_path.resolve()
    print(f"Report: {report_abs}")
    print("Done. Open the report in a browser to see all visualizations and explanations.")
    try:
        import webbrowser
        webbrowser.open(f"file://{report_abs}")
    except Exception:
        pass


if __name__ == "__main__":
    main()
