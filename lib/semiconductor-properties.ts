/**
 * Semiconductor property helpers — EOS fitting and vacancy formation energy.
 *
 * These run entirely in the browser (no backend call). They take arrays of
 * energy/volume data from multiple MACE single-point runs and compute
 * derived properties:
 *   - Bulk modulus via 3rd-order Birch–Murnaghan EOS fit
 *   - Vacancy formation energy from bulk + vacancy energies
 *
 * The EOS fitting uses a simple least-squares approach to the
 * Birch–Murnaghan equation of state, which is the standard in
 * computational materials science.
 */

// ---------------------------------------------------------------------------
// Birch–Murnaghan EOS fit → bulk modulus
// ---------------------------------------------------------------------------

/**
 * Fit a 3rd-order Birch–Murnaghan equation of state to E(V) data.
 *
 * Uses a polynomial fit: E(V) ≈ a + b*V + c*V^2 + d*V^3
 * Then computes B₀ = V₀ * d²E/dV² at the minimum.
 *
 * @param volumes  Array of volumes (ų)
 * @param energies Array of energies (eV) — same length as volumes
 * @returns { B0: bulk modulus in GPa, V0: equilibrium volume, E0: min energy }
 */
export function fitEOS(
  volumes: number[],
  energies: number[]
): { B0: number; V0: number; E0: number } | null {
  const n = volumes.length;
  if (n < 4) return null;

  // Find minimum energy point as initial guess for V0
  let minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (energies[i] < energies[minIdx]) minIdx = i;
  }

  // Polynomial fit: E = a + b*x + c*x^2 + d*x^3 where x = V
  // Use least squares with Vandermonde matrix
  const coeffs = polyFit(volumes, energies, 3);
  if (!coeffs) return null;

  const [a, b, c, d] = coeffs;

  // Minimum: dE/dV = b + 2c*V + 3d*V^2 = 0
  // Solve quadratic: 3d*V^2 + 2c*V + b = 0
  const disc = 4 * c * c - 12 * d * b;
  if (disc < 0) return null;

  const V0_1 = (-2 * c + Math.sqrt(disc)) / (6 * d);
  const V0_2 = (-2 * c - Math.sqrt(disc)) / (6 * d);

  // Pick the root closest to the data
  const vMin = Math.min(...volumes);
  const vMax = Math.max(...volumes);
  let V0 = V0_1;
  if (
    V0_2 > vMin &&
    V0_2 < vMax &&
    Math.abs(V0_2 - volumes[minIdx]) < Math.abs(V0_1 - volumes[minIdx])
  ) {
    V0 = V0_2;
  }
  if (V0 < vMin * 0.8 || V0 > vMax * 1.2) V0 = volumes[minIdx];

  const E0 = a + b * V0 + c * V0 * V0 + d * V0 * V0 * V0;

  // Bulk modulus: B = V * d²E/dV² = V * (2c + 6d*V)
  const d2EdV2 = 2 * c + 6 * d * V0;
  const B0_eV_A3 = V0 * d2EdV2; // eV/ų

  // Convert to GPa: 1 eV/ų = 160.2176634 GPa
  const B0 = B0_eV_A3 * 160.2176634;

  if (B0 < 0 || !isFinite(B0)) return null;

  return { B0, V0, E0 };
}

/**
 * Polynomial least-squares fit.
 * Returns coefficients [a0, a1, a2, ...] for y = a0 + a1*x + a2*x^2 + ...
 */
function polyFit(
  x: number[],
  y: number[],
  degree: number
): number[] | null {
  const n = x.length;
  const m = degree + 1;
  if (n < m) return null;

  // Build normal equations: A^T A c = A^T y
  const ATA: number[][] = Array.from({ length: m }, () =>
    new Array(m).fill(0)
  );
  const ATy: number[] = new Array(m).fill(0);

  for (let i = 0; i < n; i++) {
    const powers: number[] = [1];
    for (let j = 1; j < m; j++) powers.push(powers[j - 1] * x[i]);

    for (let j = 0; j < m; j++) {
      ATy[j] += powers[j] * y[i];
      for (let k = 0; k < m; k++) {
        ATA[j][k] += powers[j] * powers[k];
      }
    }
  }

  // Solve via Gaussian elimination
  return gaussianElimination(ATA, ATy);
}

/** Simple Gaussian elimination with partial pivoting. */
function gaussianElimination(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null;

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}

// ---------------------------------------------------------------------------
// Vacancy formation energy
// ---------------------------------------------------------------------------

/**
 * Compute vacancy formation energy.
 *
 * E_vac = E_defect - E_bulk * (N-1)/N
 *
 * where:
 *   E_defect = total energy of the vacancy supercell (N-1 atoms)
 *   E_bulk   = total energy of the perfect supercell (N atoms)
 *   N        = number of atoms in the perfect supercell
 *
 * @param eBulk    Total energy of perfect supercell (eV)
 * @param eDefect  Total energy of vacancy supercell (eV)
 * @param nAtoms   Number of atoms in the perfect supercell
 * @returns Vacancy formation energy in eV
 */
export function vacancyFormationEnergy(
  eBulk: number,
  eDefect: number,
  nAtoms: number
): number {
  return eDefect - (eBulk * (nAtoms - 1)) / nAtoms;
}

// ---------------------------------------------------------------------------
// EOS volume scaling
// ---------------------------------------------------------------------------

/**
 * Generate scaled XYZ structures for EOS calculation.
 *
 * Takes an XYZ string with a Lattice tag, scales the cell uniformly by
 * a set of volume ratios, and returns new XYZ strings.
 *
 * @param xyzData    Original extended-XYZ string
 * @param ratios     Array of volume scale factors (e.g. [0.94, 0.96, ..., 1.06])
 * @returns Array of { ratio, xyzData } pairs, or null if parsing fails
 */
export function generateEOSStructures(
  xyzData: string,
  ratios: number[] = [0.94, 0.96, 0.98, 1.0, 1.02, 1.04, 1.06]
): { ratio: number; xyzData: string }[] | null {
  const lines = xyzData.trim().split("\n");
  if (lines.length < 3) return null;

  // Parse Lattice from line 2
  const headerLine = lines[1];
  const latticeMatch = headerLine.match(
    /Lattice="([^"]+)"/
  );
  if (!latticeMatch) return null;

  const latticeNums = latticeMatch[1].split(/\s+/).map(Number);
  if (latticeNums.length !== 9) return null;

  const atomCount = parseInt(lines[0].trim(), 10);
  const atomLines = lines.slice(2, 2 + atomCount);

  const results: { ratio: number; xyzData: string }[] = [];

  for (const ratio of ratios) {
    // Volume scale = ratio, so linear scale = ratio^(1/3)
    const linearScale = Math.pow(ratio, 1 / 3);

    // Scale lattice vectors
    const scaledLattice = latticeNums.map((v) => v * linearScale);
    const latticeStr = scaledLattice.map((v) => v.toFixed(6)).join(" ");

    // Scale atom positions (Cartesian)
    const scaledAtoms = atomLines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const symbol = parts[0];
      const x = parseFloat(parts[1]) * linearScale;
      const y = parseFloat(parts[2]) * linearScale;
      const z = parseFloat(parts[3]) * linearScale;
      return `${symbol} ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`;
    });

    // Reconstruct header preserving other properties
    const newHeader = headerLine.replace(
      /Lattice="[^"]+"/, 
      `Lattice="${latticeStr}"`
    );

    const newXyz = [lines[0], newHeader, ...scaledAtoms].join("\n");
    results.push({ ratio, xyzData: newXyz });
  }

  return results;
}

/**
 * Build a vacancy structure: remove atom at given index from XYZ data.
 *
 * @param xyzData   Original extended-XYZ string
 * @param atomIndex 0-based index of the atom to remove
 * @returns New XYZ string with atom removed, or null on error
 */
export function buildVacancyXYZ(
  xyzData: string,
  atomIndex: number
): string | null {
  const lines = xyzData.trim().split("\n");
  if (lines.length < 3) return null;

  const atomCount = parseInt(lines[0].trim(), 10);
  if (atomIndex < 0 || atomIndex >= atomCount) return null;

  const atomLines = lines.slice(2, 2 + atomCount);
  const newAtomLines = atomLines.filter((_, i) => i !== atomIndex);
  const newCount = atomCount - 1;

  return [String(newCount), lines[1], ...newAtomLines].join("\n");
}
