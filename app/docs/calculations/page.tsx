import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/docs/callout";
import { DocsPager } from "@/components/docs/docs-nav";

export const metadata: Metadata = {
  title: "Calculations & parameters",
  description:
    "Single-point energy, geometry optimization (BFGS/FIRE, fmax), and molecular dynamics (NVE/NVT/NPT) in SimpleAtom — parameters, precision, device, D3 dispersion, and the Web UI to MACE parameter mapping.",
};

export default function CalculationsPage() {
  return (
    <>
      <header className="mb-8">
        <p className="text-sm font-medium text-[var(--color-accent-strong)]">
          Science
        </p>
        <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          Calculations &amp; parameters
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-[var(--color-text-secondary)]">
          SimpleAtom exposes three calculation types, each a thin,
          browser-friendly layer over ASE and the underlying{" "}
          <code>MACECalculator</code>. This page explains what each type
          computes, which parameters control it, and how those parameters
          map onto the MACE Python API.
        </p>
      </header>

      <article className="docs-prose">
        <h2 id="single-point">Single-point energy &amp; forces</h2>
        <p>
          Computes the total energy and the per-atom forces at the current
          geometry, with no optimization or dynamics. This is the fastest
          calculation type and the natural first step for any new structure
          — use it to sanity-check a structure before committing to a longer
          optimization or MD run.
        </p>

        <h2 id="optimization">Geometry optimization</h2>
        <p>
          Relaxes atomic positions to a nearby local minimum by iteratively
          moving atoms in the direction of the forces until the maximum
          force component drops below a threshold, <code>fmax</code>.
        </p>
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Default</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Optimizer</td>
              <td>BFGS</td>
              <td>Switch to FIRE if BFGS struggles to converge.</td>
            </tr>
            <tr>
              <td>
                <code>fmax</code> (eV/Å)
              </td>
              <td>0.05</td>
              <td>
                0.01 for production results; 0.005 before running a
                vibrational/frequency analysis.
              </td>
            </tr>
            <tr>
              <td>
                <code>maxOptSteps</code>
              </td>
              <td>500</td>
              <td>
                Always set a limit to prevent an infinite loop; increase for
                large or difficult-to-converge systems.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Only atomic positions are optimized — cell optimization is not yet
          supported. Watch the RMS force during optimization: it should
          decrease monotonically as the structure approaches a minimum.
        </p>

        <h2 id="md">Molecular dynamics</h2>
        <p>
          Propagates a trajectory over time under one of three ensembles.
          Initial velocities are always drawn from a Maxwell&ndash;Boltzmann
          distribution at the target temperature.
        </p>
        <table>
          <thead>
            <tr>
              <th>Ensemble</th>
              <th>Thermostat / barostat</th>
              <th>Requires</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NVE</td>
              <td>None (microcanonical)</td>
              <td>Any system. Total energy should stay conserved.</td>
            </tr>
            <tr>
              <td>NVT</td>
              <td>Langevin thermostat (friction parameter)</td>
              <td>
                Target temperature (K). Energy fluctuates around the target
                temperature rather than staying fixed.
              </td>
            </tr>
            <tr>
              <td>NPT</td>
              <td>Barostat</td>
              <td>
                Temperature (K), pressure (GPa), and a periodic system with a
                defined cell.
              </td>
            </tr>
          </tbody>
        </table>
        <ul>
          <li>
            <strong>Timestep:</strong> typically 0.5&ndash;2.0 fs; use a
            smaller timestep for systems containing light elements such as
            hydrogen.
          </li>
          <li>
            <strong>Steps:</strong> total number of MD steps to run.
          </li>
          <li>
            <strong>Temperature (K):</strong> the target for the initial
            Maxwell&ndash;Boltzmann velocity distribution and for the NVT/NPT
            thermostat.
          </li>
          <li>
            <strong>Langevin friction:</strong> controls how strongly the
            NVT thermostat couples the system to the target temperature.
          </li>
          <li>
            <strong>Pressure (GPa):</strong> the NPT target pressure,
            entered in GPa and converted internally — see{" "}
            <Link href="/docs/units">Units &amp; conventions</Link>.
          </li>
        </ul>
        <Callout type="note" title="Phonon spectrum — planned">
          Phonon spectrum calculation is on the roadmap but not yet
          supported in SimpleAtom. For now, vibrational analysis must be
          performed on a fully converged geometry using an external
          workflow.
        </Callout>

        <h2 id="dispersion">D3 dispersion correction</h2>
        <p>
          Adds Grimme&rsquo;s semi-empirical DFT-D3 van der Waals correction
          on top of MACE-MP-0 predictions. It matters for layered materials,
          molecular adsorption, and molecular crystals where dispersion
          forces are significant.
        </p>
        <Callout type="warning" title="D3 is MACE-MP-0 only">
          D3 dispersion is only meaningful for MACE-MP-0. MACE-OFF is
          trained on &omega;B97M-D3BJ reference data, which already includes
          dispersion — enabling D3 on top of it double-counts the
          correction. SimpleAtom disables the D3 toggle automatically when
          MACE-OFF is selected.
        </Callout>

        <h2 id="precision">Precision</h2>
        <p>
          Two floating-point precisions are available:
        </p>
        <ul>
          <li>
            <strong>float32</strong> — the default. Fast, and sufficient for
            energies, forces, and standard optimization or MD.
          </li>
          <li>
            <strong>float64</strong> — required for Hessian and vibrational
            frequency calculations, and recommended when preparing a
            structure for such an analysis (converge to{" "}
            <code>fmax</code> &lt; 0.005 eV/Å first).
          </li>
        </ul>

        <h2 id="device">Device</h2>
        <p>
          Calculations run on <code>cpu</code> by default. If a CUDA GPU is
          available it can significantly speed up larger systems or longer
          MD trajectories; SimpleAtom falls back to CPU automatically if
          CUDA is unavailable or runs out of memory.
        </p>

        <h2 id="mapping">Web UI &rarr; MACE parameter mapping</h2>
        <p>
          Under the hood, SimpleAtom drives the same{" "}
          <code>MACECalculator</code> and <code>mace_mp()</code> /{" "}
          <code>mace_off()</code> factory functions you would use from a
          Python script. The web parameters map directly onto that API:
        </p>
        <table>
          <thead>
            <tr>
              <th>Web UI parameter</th>
              <th>Maps to</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Model Type</td>
              <td>
                <code>mace_mp()</code> / <code>mace_off()</code> / custom
                upload
              </td>
              <td>Selects the foundation model or a user checkpoint.</td>
            </tr>
            <tr>
              <td>Model Size</td>
              <td>
                <code>model</code> argument
              </td>
              <td>
                <code>&quot;small&quot;</code>, <code>&quot;medium&quot;</code>
                , <code>&quot;large&quot;</code>.
              </td>
            </tr>
            <tr>
              <td>Precision</td>
              <td>
                <code>default_dtype</code>
              </td>
              <td>
                <code>&quot;float32&quot;</code> or{" "}
                <code>&quot;float64&quot;</code>.
              </td>
            </tr>
            <tr>
              <td>Device</td>
              <td>
                <code>device</code>
              </td>
              <td>
                <code>&quot;cpu&quot;</code> or <code>&quot;cuda&quot;</code>.
              </td>
            </tr>
            <tr>
              <td>D3 Dispersion</td>
              <td>
                <code>dispersion</code>
              </td>
              <td>On/off toggle; MACE-MP-0 only.</td>
            </tr>
            <tr>
              <td>Custom Model Upload</td>
              <td>
                <code>model_paths</code>
              </td>
              <td>User-supplied <code>.model</code> checkpoint file.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Lower-level parameters — <code>compile_mode</code>,{" "}
          <code>enable_cueq</code>, <code>charges_key</code>,{" "}
          <code>info_keys</code>, and the unit-conversion factors — are
          handled automatically by the backend and are not exposed in the
          UI, since they require no configuration for standard workflows.
        </p>
      </article>

      <DocsPager pathname="/docs/calculations" />
    </>
  );
}
