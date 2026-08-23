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
            MACE-MP-0 &mdash; these are total energies including core
            electrons, so the magnitude is set by <em>composition</em>, not by
            a fixed band. Water sits near{" "}
            <code>&minus;694&nbsp;eV/atom</code> and bromobenzene near{" "}
            <code>&minus;6000</code>, because the single-atom references are
            H&nbsp;&minus;13.57, O&nbsp;&minus;2043.93 and
            Br&nbsp;&minus;70045.28&nbsp;eV. Never compare a MACE-OFF energy to
            a MACE-MP one; only differences <em>within</em> a single model are
            meaningful.
          </li>
        </ul>

        <h2 id="more-families">The rest of the catalog</h2>
        <p>
          MACE-MP-0 and MACE-OFF23 are the defaults, but SimpleAtom exposes
          every foundation model the installed <code>mace-torch</code> can
          actually load &mdash; twelve checkpoints across seven families and
          four levels of theory. The model picker shows each one&rsquo;s
          licence, element coverage, training level and measured CPU cost
          before you run.
        </p>
        <ul>
          <li>
            <strong>MACE-MPA-0</strong> and <strong>MACE-MP-0b3</strong> &mdash;
            later MPtrj-line models. MPA-0 adds sAlex data and is upstream&rsquo;s
            current default. MIT.
          </li>
          <li>
            <strong>MACE-OMAT-0</strong> &mdash; trained on OMat24, the strongest
            choice for phonon-adjacent work. ASL, non-commercial.
          </li>
          <li>
            <strong>MACE-MATPES-PBE-0</strong> and{" "}
            <strong>MACE-MATPES-R2SCAN-0</strong> &mdash; the r2SCAN variant is
            the only meta-GGA option here and sits on its own energy zero. ASL,
            non-commercial.
          </li>
        </ul>
        <Callout type="warning" title="Five of the twelve are ASL — non-commercial">
          MACE-OFF23, both OMAT-0 sizes and both MATPES models are released
          under the Academic Software License, which does not permit commercial
          use. The picker labels this before you run, and the licence travels
          with the result into PDF exports and shared MACE Links &mdash; because
          the person reading a shared number is often not the person who ran it.
        </Callout>

        <Callout type="note" title="Not everything upstream lists can be offered">
          Three models named in the MACE documentation are deliberately absent.{" "}
          <code>mace_anicc</code> cannot be deserialised on a CPU-only host.{" "}
          <code>mh-0</code> and <code>mh-1</code> are multi-head models carrying
          one energy reference per head, so no single level of theory could be
          attached honestly. <code>MACE-OFF24</code> and <code>mace_mdp</code>
          {" "}do not exist in the installed version at all.
        </Callout>

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
