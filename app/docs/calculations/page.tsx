import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/docs/callout";
import { DocsPager } from "@/components/docs/docs-nav";

export const metadata: Metadata = {
  title: "Calculations & parameters",
  description:
    "Single-point energy, geometry optimization (BFGS, fmax), and molecular dynamics (NVE/NVT/NPT) in SimpleAtom — parameters, precision, device, D3 dispersion, and the Web UI to MACE parameter mapping.",
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
              <td>
                Fixed &mdash; BFGS is the only optimizer, and it is not
                selectable. If it struggles to converge, loosen{" "}
                <code>fmax</code>, raise <code>maxOptSteps</code>, or start
                from a cleaner geometry.
              </td>
            </tr>
            <tr>
              <td>
                <code>fmax</code> (eV/Å)
              </td>
              <td>0.05</td>
              <td>
                0.01 for production results; 0.005 if the relaxed geometry will
                be handed to an external vibrational analysis.
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
              <td>
                Any system. Total energy (potential + kinetic) should stay
                conserved; potential energy alone should not, and does not.
              </td>
            </tr>
            <tr>
              <td>NVT</td>
              <td>Langevin thermostat (friction parameter)</td>
              <td>
                Target temperature (K). The thermostat exchanges energy with a
                heat bath, so temperature fluctuates around the target rather
                than holding fixed, and total energy is not conserved.
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
          <li>
            <strong>Random seed:</strong> MD has two stochastic sources — the
            initial Maxwell&ndash;Boltzmann velocities and the Langevin random
            forces. Both are driven by a single seed, which defaults to{" "}
            <code>42</code>, so a run is reproducible bit-for-bit. The seed
            used is recorded in the result message and parameters, so a shared
            trajectory can always be re-run exactly. Change it to generate
            independent replicas of the same system.
          </li>
          <li>
            <strong>What a trajectory records:</strong> potential energy,
            kinetic energy, total energy and the instantaneous temperature at
            every frame. The Energy tab plots total energy and potential energy
            as separate, named series, so the NVE claim above is one you can
            check on the chart rather than take on trust; the Summary tab
            reports the total-energy drift over the run and the mean
            temperature against your target.
          </li>
        </ul>
        <h2 id="vibrations">Vibrational analysis</h2>
        <p>
          Builds the mass-weighted Hessian by finite displacement and
          diagonalises it, giving harmonic frequencies in cm<sup>&minus;1</sup>,
          animatable normal modes, the zero-point energy and full ideal-gas
          thermochemistry (U, H, S and G) at a chosen temperature and pressure.
        </p>
        <ul>
          <li>
            <strong>It refuses a non-stationary geometry.</strong> A Hessian is
            only meaningful where the gradient vanishes; away from a stationary
            point the eigenvalues mix curvature with slope and the
            imaginary-mode count stops meaning anything. Enable{" "}
            <em>Optimize first</em> and the structure is relaxed to
            0.005&nbsp;eV/&Aring; before the Hessian is built, with the
            before/after forces recorded.
          </li>
          <li>
            <strong>Imaginary modes are the diagnosis.</strong> Zero means a
            local minimum; exactly one means a first-order saddle, i.e. a
            transition state. The result states which in plain language rather
            than leaving you to count.
          </li>
          <li>
            <strong>Cost is 6N force evaluations.</strong> A 9-atom molecule is
            54 MACE calls. The limit is 50 atoms, plus a timing gate that
            measures one force call on your actual structure and refuses if the
            full Hessian would not fit the time budget.
          </li>
          <li>
            <strong>Frequencies are harmonic.</strong> Experimental
            fundamentals are anharmonic and sit several percent lower; on water,
            MACE-OFF23 lands within 0.2&ndash;1.0% of the experimentally derived{" "}
            <em>harmonic</em> values, but roughly +5% against the fundamentals.
            Compare like with like.
          </li>
        </ul>
        <Callout type="warning" title="No IR intensities">
          SimpleAtom reports frequencies but not IR intensities, because MACE
          cannot produce them. Intensities come from dipole derivatives, and the
          calculators built by <code>mace_mp()</code> and{" "}
          <code>mace_off()</code> do not implement{" "}
          <code>get_dipole_moment()</code> &mdash; <code>dipole</code> is absent
          from their <code>implemented_properties</code>. The stick spectrum
          therefore draws every mode at uniform height and says so on the chart.
          Stick heights are <em>not</em> intensities.
        </Callout>

        <h2 id="coordinate-scan">Coordinate scan</h2>
        <p>
          Steps one internal coordinate &mdash; a bond, angle or dihedral &mdash;
          across a range, relaxing every other degree of freedom at each point,
          and returns the energy profile. This is how you measure a rotation
          barrier or map a bond-breaking curve.
        </p>
        <ul>
          <li>
            <strong>The scan is sequential.</strong> Each point starts from the
            previous point&rsquo;s relaxed geometry, which is what makes it
            affordable. The cost is hysteresis: where the surface bifurcates,
            scanning the range in the opposite direction can land on a different
            branch. The result says so rather than hiding it.
          </li>
          <li>
            <strong>The constraint is verified, not assumed.</strong> Every
            point reports how far the achieved coordinate drifted from the
            requested one.
          </li>
        </ul>

        <h2 id="irc">Intrinsic reaction coordinate</h2>
        <p>
          Starts from a transition state, displaces along the imaginary normal
          mode in both directions and follows the path downhill in mass-weighted
          coordinates, connecting a saddle point to the minima on either side.
        </p>
        <Callout type="note" title="It checks that your structure is a saddle">
          An IRC from a geometry that is not a first-order saddle produces
          output that looks entirely reasonable and means nothing. SimpleAtom
          verifies there is exactly one imaginary frequency before it runs.
        </Callout>

        <Callout type="note" title="Phonon spectrum — still not supported">
          Periodic phonon band structures remain unimplemented, and{" "}
          <em>vibrational analysis is not a substitute</em>: a molecular Hessian
          is not a force-constant mesh over q-points. A phonon request is
          rejected with a message pointing molecules at vibrational analysis.
          Nudged elastic band is implemented in the engine but not yet reachable
          from this page, because it needs a second structure upload.
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
          Precision is the <code>default_dtype</code> handed to MACE. The
          default setting is <strong>Auto</strong>, which applies upstream
          MACE&rsquo;s own choice rather than a SimpleAtom opinion:
        </p>
        <ul>
          <li>
            <strong>float32</strong> — faster, less accurate. Upstream
            recommends it for molecular dynamics.
          </li>
          <li>
            <strong>float64</strong> — slower, more accurate. Upstream
            recommends it for geometry optimization, and{" "}
            <code>mace_off()</code> defaults to it for the whole MACE-OFF
            family.
          </li>
        </ul>
        <p>
          Both <code>mace_mp()</code> and <code>mace_off()</code> print this
          guidance at construction time, on every run:{" "}
          <em>
            float32 &hellip; faster but less accurate. Recommended for MD. Use
            float64 for geometry optimization.
          </em>{" "}
          Auto follows it: float64 for MACE-OFF and for geometry optimization,
          float32 otherwise.
        </p>
        <Callout type="note" title="An explicit choice is honoured, and reported">
          Picking float32 or float64 explicitly overrides Auto — upstream
          honours whatever <code>default_dtype</code> it is handed, and so does
          SimpleAtom. When the choice lands below upstream&rsquo;s
          recommendation, the result carries a warning saying so. A custom
          <code>.model</code> checkpoint is a special case: it keeps the dtype
          it was saved in, because MACE adopts the checkpoint&rsquo;s own dtype
          when no <code>default_dtype</code> is passed. Either way, the
          precision shown in a result is the dtype the loaded model was
          actually running in, read back off the model — not the dtype that was
          requested.
        </Callout>

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
                <code>&quot;float64&quot;</code>. Auto passes no{" "}
                <code>default_dtype</code>, so upstream&rsquo;s own default
                applies.
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
