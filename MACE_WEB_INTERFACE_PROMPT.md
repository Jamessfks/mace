# MACE Web Interface Improvement Prompt

> **Purpose:** This prompt is designed for a Cursor AI code agent to systematically overhaul the MACE web interface. It covers a complete visual redesign, new scientific visualization components, external model support, a quick demo flow, and model benchmarking/comparison features.

---

## CONTEXT

You are working on the **MACE (Many-body Atomic Cluster Expansion) web interface** — a Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 application that provides a browser-based calculator for MACE machine learning interatomic potentials. The codebase lives at the project root and uses shadcn/ui components, 3Dmol.js for molecular visualization, and a Python backend (ASE + mace-torch) for calculations.

The current UI uses a "Matrix" theme (black background + `#00ff41` neon green). You will transform this into a **premium scientific computing aesthetic** inspired by leaders in MLIP (Machine Learning Interatomic Potentials) like Schrodinger.com — futuristic, authoritative, with the visual gravitas of a platform that serious computational scientists trust.

---

## PART 1: VISUAL REDESIGN — COLOR & DESIGN SYSTEM

### 1.1 New Color Palette

Replace ALL instances of the Matrix green (`#00ff41`, `--color-matrix-green`, `text-matrix-green`, `bg-matrix-green`, `border-matrix-green`) and pure black backgrounds with this new palette. Update `globals.css`, every component file, and the landing page.

| Token | Hex | OKLCH (for CSS vars) | Usage |
|---|---|---|---|
| `--color-bg-primary` | `#0B0E17` | `oklch(0.12 0.015 260)` | Main app background |
| `--color-bg-secondary` | `#111827` | `oklch(0.16 0.02 260)` | Card/panel backgrounds |
| `--color-bg-elevated` | `#1A2035` | `oklch(0.20 0.025 255)` | Modals, dropdowns, hover states |
| `--color-bg-surface` | `#1F2A42` | `oklch(0.24 0.03 250)` | Active elements, selected items |
| `--color-border-subtle` | `#2A3650` | `oklch(0.30 0.025 248)` | Subtle dividers, card borders |
| `--color-border-emphasis` | `#3B4F72` | `oklch(0.40 0.04 245)` | Emphasized borders, focus rings |
| `--color-text-primary` | `#E8ECF4` | `oklch(0.94 0.01 250)` | Main text |
| `--color-text-secondary` | `#9BA4B8` | `oklch(0.72 0.02 250)` | Labels, captions, subtle text |
| `--color-text-muted` | `#5D6A82` | `oklch(0.50 0.025 248)` | Placeholder text, disabled |
| `--color-accent-primary` | `#4A7BF7` | `oklch(0.58 0.19 265)` | Primary buttons, links, focus |
| `--color-accent-secondary` | `#00B4D8` | `oklch(0.70 0.14 210)` | Secondary highlights, gradients |
| `--color-accent-glow` | `#6C8EFF` | `oklch(0.65 0.17 265)` | Glow effects, active indicators |
| `--color-success` | `#34D399` | `oklch(0.75 0.16 160)` | Completed states, good metrics |
| `--color-warning` | `#F59E0B` | `oklch(0.78 0.16 85)` | Caution, approaching limits |
| `--color-error` | `#EF4444` | `oklch(0.63 0.23 25)` | Errors, failures |

**Scientific Data Visualization Palette** (colorblind-safe, based on Paul Tol):

| Token | Hex | Purpose |
|---|---|---|
| `--color-data-blue` | `#4477AA` | Primary data series, energy predictions |
| `--color-data-red` | `#EE6677` | Error/residual markers, force errors |
| `--color-data-green` | `#228833` | Reference/DFT values, success |
| `--color-data-yellow` | `#CCBB44` | Tertiary data series |
| `--color-data-cyan` | `#66CCEE` | Highlights, tooltips, auxiliary |
| `--color-data-purple` | `#AA3377` | Additional series, model comparison |
| `--color-data-gray` | `#BBBBBB` | Neutral, grid lines, reference lines |

### 1.2 Background Treatment

Replace the Matrix rain effect. The new background should evoke **molecular science**:

- **Primary background:** Deep navy gradient from `#0B0E17` to `#0F1423` (top to bottom).
- **Ambient glow:** Replace `neon-stable-glow` with a subtle radial gradient of `--color-accent-primary` at 3-5% opacity, positioned top-right — suggesting computational energy.
- **Subtle grid pattern:** Instead of Matrix scan lines, use a faint dot-grid pattern (dots at 24px intervals, `--color-border-subtle` at 15% opacity) that evokes graph paper / scientific plotting.
- **Remove:** `matrix-rain`, `matrix-scan`, `scan-lines`, `matrix-bg` classes entirely.

### 1.3 Glow & Effect Updates

- Replace `text-shadow-matrix` and `text-shadow-matrix-green` with `text-shadow-accent` using `--color-accent-glow` at matching opacities.
- Replace `glow-border` with a `glow-border-accent` that uses `--color-accent-primary` at 20% opacity.
- Update `.animate-glow-pulse` to pulse in `--color-accent-primary` instead of green.
- Keep all animations (`fadeInUp`, `shimmer`, `progressFill`, `glowPulse`, stagger) — they are good. Just re-color them.

### 1.4 Typography

- **Keep** `font-mono` (Geist Mono) for numerical/scientific data, code snippets, parameter labels.
- **Switch** headings and body text to `font-sans` (Geist Sans) for a cleaner, more modern feel.
- Apply letter-spacing: `tracking-tight` on large headings, `tracking-wide` on small uppercase labels.

### 1.5 Component Styling Updates

**Cards:** Change `border-matrix-green/20 bg-black/80` → `border-[--color-border-subtle] bg-[--color-bg-secondary]`. Keep the left-border accent pattern in `results-display.tsx` — it is excellent. Update the accent colors to use the new data palette.

**Buttons:**
- Primary CTA ("RUN MACE CALCULATION"): `border-[--color-accent-primary] bg-[--color-accent-primary]/10 text-[--color-accent-primary]` → hover: `bg-[--color-accent-primary] text-white`.
- Secondary buttons: Use `--color-border-emphasis` borders with `--color-bg-elevated` background.

**Form Inputs:** `border-[--color-border-subtle] bg-[--color-bg-primary]/50` → focus: `border-[--color-accent-primary]`.

**Status indicators:** Computing → `--color-warning` pulse. Done → `--color-success`. Idle → `--color-text-muted`.

---

## PART 2: LANDING PAGE REDESIGN

### 2.1 Hero Section (`components/intro-section.tsx`)

Redesign the landing page hero to project scientific authority:

- **Badge:** Keep the top badge but style it with `--color-accent-primary` border/text on `--color-bg-elevated` background. Text: `"MACHINE LEARNING INTERATOMIC POTENTIALS"`.
- **Title:** "MACE" in bold white with `text-shadow-accent`, then line break, then `"FORCE FIELDS"` in `--color-accent-primary` with `text-shadow-accent-strong`. Use `font-sans` for the title, large and commanding (text-6xl → text-8xl).
- **Subtitle:** Update to: `"Many-body Atomic Cluster Expansion — equivariant message-passing neural networks for fast, accurate interatomic potentials across the periodic table."` — styled in `--color-text-secondary`.
- **Stats row:** Expand to show 3-4 key stats in a horizontal bar:
  - `89` / `Elements Supported` (for MACE-MP-0)
  - `meV` / `Accuracy Scale`
  - `2022` / `NeurIPS Publication`
  - `10M+` / `Training Structures`
- **CTA buttons:** Two buttons side by side:
  1. Primary: `"Launch Calculator"` → links to `/calculate`
  2. Secondary/outline: `"Quick Demo"` → links to `/calculate?demo=true` (see Part 5)
- **Background element:** Behind the hero text, render a very subtle, low-opacity (5-8%) SVG of a molecular graph network (interconnected nodes and edges) to reinforce the MLIP theme. This should be a purely decorative CSS/SVG element, not a 3D viewer.

### 2.2 Add a Features Section Below the Hero

Below the hero, before the footer, add a section with 3-4 feature cards in a horizontal grid:

1. **"Foundation Models"** — Icon: layers/stack. Description: "Run MACE-MP-0, MACE-OFF, or upload your own fine-tuned .model files."
2. **"Scientific Visualization"** — Icon: chart/bar-chart. Description: "Parity plots, error distributions, and force correlation graphs with publication-quality exports."
3. **"Model Benchmarking"** — Icon: compare/git-compare. Description: "Compare your fine-tuned model against MACE foundation models on standard benchmarks."
4. **"3D Structure Viewer"** — Icon: cube. Description: "Interactive molecular visualization with force vectors, trajectory animation, and dual rendering engines."

Style these cards with `--color-bg-secondary` background, `--color-border-subtle` borders, and icon circles using `--color-accent-primary` at 10% opacity background.

---

## PART 3: EXTERNAL MODEL SUPPORT

### 3.1 Type System Updates (`types/mace.ts`)

Extend the type system to support external/custom MACE models:

```typescript
export type ModelSize = "small" | "medium" | "large" | "custom";
export type ModelType = "MACE-MP-0" | "MACE-OFF" | "custom";

export interface CalculationParams {
  // ... existing fields ...
  
  // Custom model support
  customModelFile?: File;
  customModelName?: string; // user-provided label
  customModelDescription?: string;
}
```

### 3.2 Parameter Panel — Custom Model Upload (`components/calculate/parameter-panel.tsx`)

Add a new "Custom Model" option to the Model Type selector. When "Custom Model" is selected:

1. **Show a file upload zone** (similar to the structure file upload) that accepts `.model` files (PyTorch saved MACE models).
2. **Display model info** after upload: filename, file size.
3. **Add a text input** for "Model Label" so users can name their custom model (used in charts/reports).
4. **Show an info callout:** "Upload a MACE-compatible .model file. This can be a fine-tuned model trained with `mace_run_train` or any MACE architecture checkpoint."
5. When a custom model is selected, **disable the "Model Size" selector** (since custom models have fixed architecture) and grey it out with a tooltip explaining why.

### 3.3 Backend Support (`mace-api/calculate_local.py` and `app/api/calculate/route.ts`)

Update the API route and Python backend to handle custom model files:

- In `route.ts`: Accept a `model` field in the FormData. If present, save it to a temporary directory and pass its path to the Python script.
- In `calculate_local.py`: Accept a `--model-path` argument. If provided, load the model from that path using `torch.load()` instead of using `mace_mp()` or `mace_off()`.
- Add proper error handling for invalid model files (not a valid PyTorch model, wrong architecture, etc.).
- Clean up temporary model files after calculation completes.

---

## PART 4: SCIENTIFIC VISUALIZATION & METRICS DASHBOARD

This is the most critical section. The current results display shows basic property cards. Transform it into a **comprehensive scientific analysis dashboard** that MACE researchers actually need.

### 4.1 Install Plotly.js for Scientific Charts

```bash
npm install react-plotly.js plotly.js-dist-min
```

Use `react-plotly.js` with `plotly.js-dist-min` (partial bundle, ~500KB) for all scientific charts. This gives us publication-quality parity plots, scatter plots with annotations, error histograms, and built-in PNG/SVG export.

### 4.2 New Component: `components/calculate/metrics-dashboard.tsx`

Create a new tabbed metrics dashboard that appears in the results section. This component replaces the simple property cards with a rich, tabbed interface.

**Tab 1: "Summary" (default)**

Show the key metrics in an enhanced card grid (keep the existing left-border accent pattern). Display:

- **Energy per atom** (eV/atom) — large, prominent
- **RMS Force** (eV/A) — with atom count
- **Max Force** (eV/A) — with atom index and element
- **Cell Volume** (A^3) — if periodic
- **Force MAE** (if reference data is provided) — see below
- **Energy MAE** (if reference data is provided) — see below

If the user provides reference data (DFT forces/energies in their input file — extxyz files often contain `REF_energy` and `REF_forces` properties), compute and prominently display:

| Metric | How to Compute | Display |
|---|---|---|
| **Force MAE** | Mean of |F_pred - F_ref| across all atoms and components | `XX.X meV/A` |
| **Force RMSE** | sqrt(mean((F_pred - F_ref)^2)) | `XX.X meV/A` |
| **Energy MAE** | |E_pred - E_ref| / n_atoms | `XX.X meV/atom` |
| **Energy RMSE** | sqrt(mean((E_pred/atom - E_ref/atom)^2)) (for multi-structure) | `XX.X meV/atom` |
| **Energy R^2** | 1 - SS_res/SS_tot for energy predictions | `0.XXXX` |

Display these in a highlighted "Model Accuracy" card with a `--color-accent-primary` left border.

**Tab 2: "Force Analysis"**

- **Parity Plot (Forces):** Scatter plot of predicted vs. reference force components (Fx, Fy, Fz all on same plot, distinguished by subtle color). X-axis: "Reference Force (eV/A)", Y-axis: "Predicted Force (eV/A)". Include:
  - Dashed y=x diagonal line (perfect prediction)
  - Point opacity at 0.3 for density visualization
  - Color points by element type
  - Annotate R^2, MAE, RMSE in a text box in the upper-left corner
  - Square aspect ratio (1:1)
  - Plotly toolbar for zoom, pan, export PNG/SVG
  
- **Force Error Distribution:** Histogram of per-component force errors (F_pred - F_ref) with a KDE overlay. Show mean and standard deviation in annotation.

- **Force Magnitude vs. Error:** Scatter plot of |F_ref| (x-axis) vs. |F_pred - F_ref| (y-axis) to detect scale-dependent errors. Color by element.

- If no reference data is available, show the atomic forces table (the existing one from `results-display.tsx`) and a force magnitude bar chart sorted by atom index.

**Tab 3: "Energy Analysis"**

- **Energy Parity Plot:** Predicted vs. reference energy per atom. Same styling as force parity plot but with energy units. Only shown when reference data is available.
  
- **Energy Convergence:** For geometry optimization — plot energy vs. optimization step. For MD — plot energy vs. MD step (the existing `energy-chart.tsx` data, but rendered in Plotly for consistency and export capability).

- **Energy Distribution:** For MD trajectories — histogram of energies across frames with mean and standard deviation annotated.

**Tab 4: "Structure"**

- Move the existing 3D structure viewer here.
- Move the trajectory animation here (for MD).
- Add a "Force Vectors" toggle that overlays force arrows on the 3D structure (already partially implemented in `molecule-viewer-3d.tsx`).

**Tab 5: "Raw Data"**

- The existing atomic forces table.
- JSON viewer/download.
- PDF report download.
- CSV export of forces table.

### 4.3 Chart Styling Rules

All Plotly charts must follow these visual rules:

```javascript
const CHART_LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',        // transparent
  plot_bgcolor: '#111827',                // --color-bg-secondary
  font: {
    family: 'Geist Mono, monospace',
    color: '#9BA4B8',                     // --color-text-secondary
    size: 11
  },
  xaxis: {
    gridcolor: '#2A3650',                 // --color-border-subtle
    zerolinecolor: '#3B4F72',             // --color-border-emphasis
    linecolor: '#2A3650',
    tickfont: { size: 10 }
  },
  yaxis: {
    gridcolor: '#2A3650',
    zerolinecolor: '#3B4F72',
    linecolor: '#2A3650',
    tickfont: { size: 10 }
  },
  margin: { l: 60, r: 20, t: 40, b: 50 },
  showlegend: true,
  legend: {
    bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#9BA4B8', size: 10 }
  }
};
```

Use the Paul Tol data palette for all data series. Include Plotly's modebar for built-in PNG/SVG download.

### 4.4 Reference Data Parsing

Update `lib/parse-structure.ts` to extract reference data from extended XYZ files:

- Parse `energy=` or `REF_energy=` from the comment line (line 2 of XYZ blocks).
- Parse `REF_forces` or `forces` from per-atom extended properties.
- Store these as `referenceEnergy?: number` and `referenceForces?: number[][]` in the parsed structure, and pass them through to the results display.

When reference data is detected, show a prominent info badge: "Reference data detected — accuracy metrics will be computed."

---

## PART 5: QUICK DEMO FLOW

### 5.1 Demo Mode

When the user navigates to `/calculate?demo=true` (or clicks "Quick Demo" on the landing page):

1. **Auto-load a demo structure:** Use a small, interesting molecule from the ml-peg catalog. Good candidates:
   - Ethanol (C2H5OH) — small, fast to compute, organic molecule
   - Diamond unit cell — small periodic system, showcases materials capability
   - Water molecule — the simplest, fastest demo

2. **Auto-populate parameters:** Set model to MACE-MP-0, medium size, float32, CPU, single-point energy.

3. **Show a guided overlay/tooltip sequence** (3 steps, dismissible):
   - Step 1: "Your structure is loaded. You can also upload your own .xyz, .cif, .poscar, or .pdb file."
   - Step 2: "Choose your model and calculation type. Try Molecular Dynamics for trajectory animations."
   - Step 3: "Click 'Run Calculation' to compute energies and forces with MACE."

4. **Do NOT auto-run the calculation.** Let the user click "Run" themselves so they understand the flow.

5. **After results appear:** Show a toast notification: "Explore the Force Analysis and Energy tabs for deeper insights. Upload reference data for accuracy metrics."

### 5.2 Demo Structure Files

Include 2-3 small demo structure files as static assets in `public/demo/`:

- `public/demo/ethanol.xyz` — Ethanol molecule (9 atoms)
- `public/demo/diamond.cif` — Diamond conventional cell (8 atoms)
- `public/demo/water.xyz` — Water molecule (3 atoms)

These should be valid, well-formatted files. Embed them as strings in the code if necessary, or fetch them from `public/demo/`.

---

## PART 6: MODEL COMPARISON / BENCHMARKING

### 6.1 New Component: `components/calculate/model-comparison.tsx`

When a user uploads a **custom model** (Part 3) and runs a calculation, offer a "Compare with Foundation Model" button. When clicked:

1. **Run the same structure** through the corresponding foundation model (MACE-MP-0 or MACE-OFF, same size if applicable).
2. **Display side-by-side comparison:**
   - Two-column layout showing custom model results vs. foundation model results.
   - Difference in energy (delta E).
   - Force difference visualization: a bar chart showing per-atom force magnitude difference.
   - If reference data is present: comparative MAE/RMSE for both models.

3. **Radar Chart Comparison:** If reference data is available, show a radar/spider chart with axes for:
   - Energy MAE
   - Force MAE
   - Energy R^2
   - Force RMSE
   - Max Force Error
   Each model gets its own polygon on the chart with colors from the data palette.

### 6.2 Comparison Results Card

Style the comparison as a special card with a gradient left border (blue to purple: `--color-data-blue` to `--color-data-purple`). Header: "Model Comparison — [Custom Model Name] vs. [Foundation Model]".

---

## PART 7: IMPLEMENTATION SEQUENCE

Follow this exact order to minimize breakage:

1. **Phase 1 — Color system:** Update `globals.css` with new CSS custom properties. Create new utility classes. DO NOT touch component files yet.
2. **Phase 2 — Landing page:** Update `intro-section.tsx` and `app/page.tsx` with new colors and layout. Test visually.
3. **Phase 3 — Calculator page chrome:** Update `app/calculate/page.tsx` header, progress bar, skeleton. Update `parameter-panel.tsx` and `file-upload-section.tsx` colors.
4. **Phase 4 — External model support:** Add custom model upload UI and type changes. Update API route.
5. **Phase 5 — Metrics dashboard:** Install plotly. Build `metrics-dashboard.tsx`. Build parity plot, error histogram, energy chart components. Integrate into results flow.
6. **Phase 6 — Results display migration:** Migrate from `results-display.tsx` flat layout to tabbed `metrics-dashboard.tsx`. Keep old component as fallback.
7. **Phase 7 — Quick demo:** Add demo structures, URL parameter handling, guided overlay.
8. **Phase 8 — Model comparison:** Add comparison logic and UI.
9. **Phase 9 — Polish:** Check all components for missed Matrix green references. Verify dark mode. Test responsive layout. Fix linter errors.

---

## PART 8: FILES TO MODIFY

Here is the complete list of files that need changes, with the nature of changes:

| File | Changes |
|---|---|
| `app/globals.css` | New color system, remove Matrix classes, add new utility classes |
| `app/page.tsx` | Remove Matrix bg/scanlines, apply new background |
| `app/layout.tsx` | Verify dark mode class, update metadata if needed |
| `app/calculate/page.tsx` | Re-color header, progress bar, buttons, skeleton |
| `components/intro-section.tsx` | Full redesign with new hero, stats, feature cards |
| `components/calculate/parameter-panel.tsx` | Re-color, add custom model upload section |
| `components/calculate/file-upload-section.tsx` | Re-color borders, backgrounds, hover states |
| `components/calculate/results-display.tsx` | Integrate with metrics-dashboard, update accent colors |
| `components/calculate/molecule-viewer-3d.tsx` | Update border/background colors |
| `components/calculate/structure-info.tsx` | Re-color |
| `components/calculate/structure-preview.tsx` | Re-color |
| `components/calculate/mlpeg-catalog.tsx` | Re-color |
| `components/calculate/pdf-report.tsx` | Update report colors/branding |
| `components/calculate/trajectory/trajectory-viewer.tsx` | Re-color |
| `components/calculate/trajectory/energy-chart.tsx` | Re-color or replace with Plotly |
| `components/Footer.tsx` | Re-color |
| `types/mace.ts` | Add custom model fields |
| `lib/parse-structure.ts` | Add reference data extraction |
| `app/api/calculate/route.ts` | Handle custom model file upload |
| `mace-api/calculate_local.py` | Handle `--model-path` for custom models |
| **NEW** `components/calculate/metrics-dashboard.tsx` | Tabbed metrics dashboard |
| **NEW** `components/calculate/charts/parity-plot.tsx` | Reusable parity plot component |
| **NEW** `components/calculate/charts/error-histogram.tsx` | Error distribution chart |
| **NEW** `components/calculate/charts/energy-convergence.tsx` | Energy vs. step chart |
| **NEW** `components/calculate/charts/radar-comparison.tsx` | Model comparison radar |
| **NEW** `components/calculate/model-comparison.tsx` | Side-by-side model comparison |
| **NEW** `public/demo/ethanol.xyz` | Demo structure |
| **NEW** `public/demo/water.xyz` | Demo structure |

---

## CRITICAL RULES

1. **Never break existing functionality.** Every calculation type (single-point, geometry-opt, MD) must continue working exactly as before.
2. **Preserve the two-panel layout** (4-col input / 8-col results on large screens). It is a good pattern.
3. **Preserve the progress stepper, phase tracking, and skeleton loading.** These are excellent UX patterns — just re-color them.
4. **All charts must be exportable** as PNG and SVG via Plotly's built-in modebar.
5. **All numerical values must include units.** Never display a bare number without its unit (eV, eV/A, meV/atom, A, A^3, K, GPa, fs, etc.).
6. **Use colorblind-safe colors** for all data visualization. The Paul Tol palette specified above is mandatory.
7. **Keep the monospace font for data.** Only switch headings and prose to sans-serif.
8. **No emoji in the UI.** This is a scientific tool.
9. **Maintain responsive design.** The tabbed dashboard should collapse gracefully on mobile (tabs become a dropdown or scrollable tab bar).
10. **Every Plotly chart** should have a transparent `paper_bgcolor`, use the `--color-bg-secondary` for `plot_bgcolor`, and use `--color-text-secondary` for all label/tick text.
11. **keep the ml-peg structure preview**

be flexible when you find out a better alternative.