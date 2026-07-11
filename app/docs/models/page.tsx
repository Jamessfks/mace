import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/docs/callout";
import { DocsPager } from "@/components/docs/docs-nav";

export const metadata: Metadata = {
  title: "Foundation models",
  description:
    "MACE foundation models in SimpleAtom: MACE-MP-0 for materials (PBE+U, 89 elements), MACE-OFF for organic molecules (ωB97M-D3BJ), model sizes, custom checkpoints, and energy-reference conventions.",
};

export default function ModelsPage() {
  return (
    <>
      <header className="mb-8">
        <p className="text-sm font-medium text-[var(--color-accent-strong)]">
          Science
        </p>
        <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          Foundation models
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-[var(--color-text-secondary)]">
          MACE ships pre-trained potentials for distinct chemical domains.
          Choosing the right one — and understanding its level of theory — is
          the single most important decision for a meaningful result.
        </p>
      </header>

      <article className="docs-prose">
        <h2 id="mace-mp-0">MACE-MP-0</h2>
        <ul>
          <li>
            <strong>Scope:</strong> materials, crystals, surfaces, and bulk
            systems — 89 elements across the periodic table.
          </li>
          <li>
            <strong>Training data:</strong> Materials Project DFT calculations
            (PBE+U functional).
          </li>
          <li>
            <strong>Accuracy:</strong> PBE-level. Expect roughly 0.1–0.5 eV/atom
            overbinding relative to experiment.
          </li>
          <li>
            <strong>D3 dispersion:</strong> supported and recommended for van
            der Waals systems (layered materials, molecular crystals).
          </li>
          <li>
            <strong>Energy reference:</strong> isolated-atom energies. Typical
            range <code>−1 to −15 eV/atom</code>.
          </li>
        </ul>

        <h2 id="mace-off">MACE-OFF</h2>
        <ul>
          <li>
            <strong>Scope:</strong> organic molecules and drug-like compounds.
          </li>
          <li>
            <strong>Supported elements:</strong> H, C, N, O, F, P, S, Cl, Br, I
            (10 elements).
          </li>
          <li>
            <strong>Training data:</strong> ωB97M-D3BJ reference data
            (near coupled-cluster quality for organic chemistry).
          </li>
          <li>
            <strong>Energy reference:</strong> a different convention from
            MACE-MP-0. Typical range <code>−100 to −600 eV/atom</code>.
          </li>
        </ul>

        <Callout type="warning" title="Do not enable D3 with MACE-OFF">
          MACE-OFF is trained on ωB97M-<strong>D3BJ</strong> data — dispersion
          is already included. Enabling the D3 correction double-counts
          dispersion interactions. SimpleAtom disables the D3 toggle
          automatically when MACE-OFF is selected.
        </Callout>

        <h2 id="sizes">Model sizes</h2>
        <p>Each foundation model is available in three sizes:</p>
        <table>
          <thead>
            <tr>
              <th>Size</th>
              <th>Speed</th>
              <th>Accuracy</th>
              <th>Use case</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>small</code>
              </td>
              <td>Fastest</td>
              <td>Least accurate</td>
              <td>Quick screening, large systems</td>
            </tr>
            <tr>
              <td>
                <code>medium</code>
              </td>
              <td>Balanced</td>
              <td>Good</td>
              <td>General use (default)</td>
            </tr>
            <tr>
              <td>
                <code>large</code>
              </td>
              <td>Slowest</td>
              <td>Best</td>
              <td>Production results, publication</td>
            </tr>
          </tbody>
        </table>

        <h2 id="custom">Custom models</h2>
        <p>
          You can upload your own <code>.model</code> checkpoint trained with{" "}
          <code>mace-torch</code> (for example, a model fine-tuned with{" "}
          <code>mace_run_train</code>). SimpleAtom loads it with{" "}
          <code>MACECalculator</code>, runs the calculation identically to the
          foundation models, and can compare your model against a foundation
          model with agreement metrics (MAE, RMSE, R²).
        </p>

        <h2 id="choosing">Choosing a model</h2>
        <pre>
          <code>{`Is your system purely organic (only H, C, N, O, F, P, S, Cl, Br, I)?
  ├─ Yes → MACE-OFF
  └─ No  → MACE-MP-0

Do you need van der Waals / dispersion corrections?
  ├─ MACE-MP-0 → enable D3 dispersion
  └─ MACE-OFF  → do nothing (already included)`}</code>
        </pre>

        <Callout type="note" title="Reference conventions differ">
          MACE-MP-0 and MACE-OFF use different energy-reference conventions, so
          their absolute energies differ by an order of magnitude. Never compare
          absolute energies across the two models — see{" "}
          <Link href="/docs/units">Units &amp; conventions</Link>.
        </Callout>
      </article>

      <DocsPager pathname="/docs/models" />
    </>
  );
}
