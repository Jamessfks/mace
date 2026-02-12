/**
 * Client-side structure file parser.
 *
 * Parses .xyz and basic .cif/.poscar/.pdb files to extract atom symbols and
 * positions WITHOUT a backend. Used by the "Preview Structure" feature so
 * users can inspect their upload before running a MACE calculation.
 *
 * Supported formats:
 *   - XYZ / Extended XYZ (full support)
 *   - CIF  (extracts _atom_site positions — basic support)
 *   - PDB  (extracts ATOM/HETATM records)
 *   - POSCAR/CONTCAR (extracts atom types + direct/cartesian coords)
 *
 * ARCHITECTURE NOTE:
 *   This runs entirely in the browser (no server call). It reads the uploaded
 *   File object via FileReader, parses the text, and returns a ParsedStructure.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of parsing a structure file on the client side. */
export interface ParsedStructure {
  /** Atom count */
  atomCount: number;
  /** Element symbols, one per atom (e.g. ["O", "H", "H"]) */
  symbols: string[];
  /** Cartesian positions [x, y, z] per atom (Angstroms) */
  positions: number[][];
  /** Set of unique elements (e.g. ["O", "H"]) */
  elements: string[];
  /** Per-element atom counts, e.g. { C: 9, H: 8, O: 4 } */
  elementCounts: Record<string, number>;
  /** Empirical formula string derived from atom data, e.g. "C₉H₈O₄" */
  empiricalFormula: string;
  /** Bounding box: { min: [x,y,z], max: [x,y,z], size: [dx,dy,dz] } */
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  /** Shortest distance (Å) between any two atoms; Infinity if <2 atoms */
  minNeighborDist: number;
  /** Whether all atoms lie in a single plane (z-range < 0.01 Å) */
  isPlanar: boolean;
  /** Number of frames detected (for multi-frame XYZ); we parse only frame 1 */
  frameCount: number;
  /** Original filename */
  filename: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a File object and parse it into a ParsedStructure.
 * Only the first frame is parsed for multi-frame files.
 */
export async function parseStructureFile(file: File): Promise<ParsedStructure> {
  const text = await readFileAsText(file);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  let symbols: string[];
  let positions: number[][];
  let frameCount = 1;

  if (ext === "xyz" || ext === "extxyz") {
    ({ symbols, positions, frameCount } = parseXYZ(text));
  } else if (ext === "cif") {
    ({ symbols, positions } = parseCIF(text));
  } else if (ext === "pdb") {
    ({ symbols, positions } = parsePDB(text));
  } else if (["poscar", "vasp", "contcar"].includes(ext)) {
    ({ symbols, positions } = parsePOSCAR(text));
  } else {
    // Fallback: try XYZ
    ({ symbols, positions, frameCount } = parseXYZ(text));
  }

  const elements = [...new Set(symbols)].sort();
  const elementCounts = countElements(symbols);
  const empiricalFormula = buildFormula(elementCounts);
  const boundingBox = computeBoundingBox(positions);
  const minNeighborDist = computeMinDistance(positions);
  const isPlanar = checkPlanarity(positions);

  return {
    atomCount: symbols.length,
    symbols,
    positions,
    elements,
    elementCounts,
    empiricalFormula,
    boundingBox,
    minNeighborDist,
    isPlanar,
    frameCount,
    filename: file.name,
  };
}

// ---------------------------------------------------------------------------
// Format parsers
// ---------------------------------------------------------------------------

/**
 * Parse standard or extended XYZ format.
 * First line = atom count, second line = comment, then atom lines.
 */
function parseXYZ(text: string): {
  symbols: string[];
  positions: number[][];
  frameCount: number;
} {
  const lines = text.split("\n").map((l) => l.trim());
  const symbols: string[] = [];
  const positions: number[][] = [];

  // First line must be the atom count
  const atomCount = parseInt(lines[0], 10);
  if (isNaN(atomCount) || atomCount <= 0) {
    throw new Error("Invalid XYZ file: first line must be the atom count.");
  }

  // Parse atom lines (skip line 0 = count, line 1 = comment)
  for (let i = 2; i < 2 + atomCount && i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 4) continue;

    const sym = parts[0];
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    symbols.push(sym);
    positions.push([x, y, z]);
  }

  // Estimate frame count: each frame = atomCount + 2 lines
  const linesPerFrame = atomCount + 2;
  const nonEmptyLines = lines.filter((l) => l.length > 0).length;
  const frameCount = Math.max(1, Math.floor(nonEmptyLines / linesPerFrame));

  return { symbols, positions, frameCount };
}

/**
 * Parse basic CIF: extract _atom_site_type_symbol and fract/Cartn coords.
 * This handles common CIF output from materials databases.
 */
function parseCIF(text: string): { symbols: string[]; positions: number[][] } {
  const symbols: string[] = [];
  const positions: number[][] = [];
  const lines = text.split("\n");

  // Find _atom_site loop
  let inLoop = false;
  let headers: string[] = [];
  let symIdx = -1;
  let xIdx = -1;
  let yIdx = -1;
  let zIdx = -1;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "loop_") {
      inLoop = true;
      headers = [];
      continue;
    }

    if (inLoop && trimmed.startsWith("_atom_site")) {
      headers.push(trimmed);
      // Track column indices
      const h = trimmed.toLowerCase();
      const idx = headers.length - 1;
      if (h === "_atom_site_type_symbol" || h === "_atom_site_label") {
        if (symIdx === -1) symIdx = idx;
      }
      if (h.includes("fract_x") || h.includes("cartn_x")) xIdx = idx;
      if (h.includes("fract_y") || h.includes("cartn_y")) yIdx = idx;
      if (h.includes("fract_z") || h.includes("cartn_z")) zIdx = idx;
      continue;
    }

    // Data row inside the atom_site loop
    if (inLoop && headers.length > 0 && !trimmed.startsWith("_") && trimmed.length > 0 && !trimmed.startsWith("#")) {
      if (trimmed.startsWith("loop_") || trimmed.startsWith("data_")) {
        inLoop = false;
        continue;
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length < headers.length) continue;

      if (symIdx >= 0 && xIdx >= 0 && yIdx >= 0 && zIdx >= 0) {
        // Strip digits from symbol (e.g. "O1" -> "O")
        const sym = parts[symIdx].replace(/[0-9]+$/, "");
        const x = parseFloat(parts[xIdx]);
        const y = parseFloat(parts[yIdx]);
        const z = parseFloat(parts[zIdx]);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          symbols.push(sym);
          positions.push([x, y, z]);
        }
      }
    }
  }

  return { symbols, positions };
}

/**
 * Parse PDB format: extract ATOM / HETATM records.
 */
function parsePDB(text: string): { symbols: string[]; positions: number[][] } {
  const symbols: string[] = [];
  const positions: number[][] = [];

  for (const line of text.split("\n")) {
    if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;

    // PDB fixed-width columns: x=30-38, y=38-46, z=46-54, element=76-78
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));

    // Element symbol: columns 76-78, or fallback to atom name cols 12-16
    let sym = line.substring(76, 78).trim();
    if (!sym) {
      sym = line.substring(12, 16).trim().replace(/[0-9]/g, "");
    }

    if (sym && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
      symbols.push(sym);
      positions.push([x, y, z]);
    }
  }

  return { symbols, positions };
}

/**
 * Parse POSCAR / CONTCAR (VASP format).
 * Line layout: comment, scale, 3x lattice, elements, counts, coord type, positions.
 */
function parsePOSCAR(text: string): {
  symbols: string[];
  positions: number[][];
} {
  const lines = text.split("\n").map((l) => l.trim());
  const symbols: string[] = [];
  const positions: number[][] = [];

  if (lines.length < 8) return { symbols, positions };

  const scale = parseFloat(lines[1]) || 1.0;

  // Lattice vectors (lines 2-4)
  const lattice: number[][] = [];
  for (let i = 2; i < 5; i++) {
    const parts = lines[i].split(/\s+/).map(Number);
    lattice.push(parts.map((v) => v * scale));
  }

  // Element names (line 5) and counts (line 6)
  const elementNames = lines[5].split(/\s+/);
  const counts = lines[6].split(/\s+/).map(Number);

  // Build symbol list from element names and counts
  elementNames.forEach((el, i) => {
    const count = counts[i] || 0;
    for (let j = 0; j < count; j++) symbols.push(el);
  });

  // Coordinate type: line 7 (may be "Selective dynamics", then line 8)
  let coordLineIdx = 7;
  if (lines[7].toLowerCase().startsWith("s")) {
    coordLineIdx = 8; // Skip "Selective dynamics"
  }
  const isDirect = lines[coordLineIdx].toLowerCase().startsWith("d");

  // Parse positions
  const totalAtoms = counts.reduce((s, c) => s + c, 0);
  for (let i = 0; i < totalAtoms; i++) {
    const lineIdx = coordLineIdx + 1 + i;
    if (lineIdx >= lines.length) break;
    const parts = lines[lineIdx].split(/\s+/).map(Number);
    if (parts.length < 3) continue;

    let [x, y, z] = parts;

    // Convert fractional to Cartesian
    if (isDirect) {
      const cx =
        x * lattice[0][0] + y * lattice[1][0] + z * lattice[2][0];
      const cy =
        x * lattice[0][1] + y * lattice[1][1] + z * lattice[2][1];
      const cz =
        x * lattice[0][2] + y * lattice[1][2] + z * lattice[2][2];
      x = cx;
      y = cy;
      z = cz;
    }

    positions.push([x, y, z]);
  }

  return { symbols, positions };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a File as text using FileReader (returns a Promise). */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/** Count atoms per element, e.g. { C: 9, H: 8, O: 4 }. */
function countElements(symbols: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sym of symbols) {
    counts[sym] = (counts[sym] || 0) + 1;
  }
  return counts;
}

/** Unicode subscript digits for formula rendering. */
const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

/**
 * Build empirical formula from element counts using Hill system order:
 * C first, H second, then all others alphabetically. Counts of 1 are omitted.
 * Example: { C: 9, H: 8, O: 4 } → "C₉H₈O₄"
 */
function buildFormula(counts: Record<string, number>): string {
  // Hill system: C first, H second, then alphabetical
  const keys = Object.keys(counts).sort((a, b) => {
    if (a === "C") return -1;
    if (b === "C") return 1;
    if (a === "H") return -1;
    if (b === "H") return 1;
    return a.localeCompare(b);
  });

  return keys
    .map((el) => {
      const n = counts[el];
      if (n === 1) return el;
      // Convert count digits to unicode subscripts
      const sub = String(n)
        .split("")
        .map((d) => SUBSCRIPTS[d] || d)
        .join("");
      return `${el}${sub}`;
    })
    .join("");
}

/**
 * Find the shortest distance (Å) between any two atoms.
 * Returns Infinity if fewer than 2 atoms. Uses O(n²) — fine for <10k atoms.
 */
function computeMinDistance(positions: number[][]): number {
  if (positions.length < 2) return Infinity;

  let minDist = Infinity;
  // Cap at first 2000 atoms to keep UI responsive
  const n = Math.min(positions.length, 2000);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[i][0] - positions[j][0];
      const dy = positions[i][1] - positions[j][1];
      const dz = positions[i][2] - positions[j][2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minDist) minDist = d2;
    }
  }
  return Math.sqrt(minDist);
}

/**
 * Check if the structure is essentially flat (all atoms in the same plane).
 * Returns true if the z-range is < 0.01 Å AND the structure has >3 atoms
 * (a water molecule being planar is fine; a 21-atom "aspirin" being flat is not).
 */
function checkPlanarity(positions: number[][]): boolean {
  if (positions.length <= 3) return false;

  // Check z-range (most common case: all z=0)
  let minZ = Infinity, maxZ = -Infinity;
  for (const [, , z] of positions) {
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (maxZ - minZ < 0.01) return true;

  // Also check x-range and y-range (flat in other planes)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of positions) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX - minX < 0.01) return true;
  if (maxY - minY < 0.01) return true;

  return false;
}

/** Compute axis-aligned bounding box from positions. */
function computeBoundingBox(positions: number[][]): ParsedStructure["boundingBox"] {
  if (positions.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [0, 0, 0],
    };
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const [x, y, z] of positions) {
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}
