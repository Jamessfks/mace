/**
 * Semiconductor Structure Library — Pre-built structures for microchip materials.
 *
 * Each entry contains a valid extended-XYZ string with Lattice and pbc tags
 * so the existing MACE backend and 3D viewer work without modification.
 *
 * Lattice parameters are from Materials Project / experiment.
 * Structures use conventional unit cells for clear 3D rendering.
 *
 * Pattern mirrors lib/mlpeg-catalog.ts: array of objects + helper functions.
 */

import type { SemiconductorMaterial } from "@/types/semiconductor";

// ---------------------------------------------------------------------------
// Structure Library
// ---------------------------------------------------------------------------

export const SEMICONDUCTOR_LIBRARY: SemiconductorMaterial[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // SUBSTRATES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "si-diamond",
    name: "Silicon (diamond)",
    formula: "Si",
    category: "substrate",
    application: "Primary semiconductor substrate for CMOS logic and memory",
    latticeA: 5.431,
    atomCount: 8,
    elements: ["Si"],
    xyzData: `8
Lattice="5.431 0.0 0.0 0.0 5.431 0.0 0.0 0.0 5.431" Properties=species:S:1:pos:R:3 pbc="T T T"
Si 0.000000 0.000000 0.000000
Si 2.715500 2.715500 0.000000
Si 2.715500 0.000000 2.715500
Si 0.000000 2.715500 2.715500
Si 1.357750 1.357750 1.357750
Si 4.073250 4.073250 1.357750
Si 4.073250 1.357750 4.073250
Si 1.357750 4.073250 4.073250`,
  },
  {
    id: "ge-diamond",
    name: "Germanium (diamond)",
    formula: "Ge",
    category: "substrate",
    application: "High-mobility channel material for advanced CMOS nodes",
    latticeA: 5.658,
    atomCount: 8,
    elements: ["Ge"],
    xyzData: `8
Lattice="5.658 0.0 0.0 0.0 5.658 0.0 0.0 0.0 5.658" Properties=species:S:1:pos:R:3 pbc="T T T"
Ge 0.000000 0.000000 0.000000
Ge 2.829000 2.829000 0.000000
Ge 2.829000 0.000000 2.829000
Ge 0.000000 2.829000 2.829000
Ge 1.414500 1.414500 1.414500
Ge 4.243500 4.243500 1.414500
Ge 4.243500 1.414500 4.243500
Ge 1.414500 4.243500 4.243500`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // III-V SEMICONDUCTORS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "gaas-zincblende",
    name: "Gallium Arsenide (zincblende)",
    formula: "GaAs",
    category: "iii-v",
    application: "High-frequency RF amplifiers, optoelectronics, solar cells",
    latticeA: 5.653,
    atomCount: 8,
    elements: ["Ga", "As"],
    xyzData: `8
Lattice="5.653 0.0 0.0 0.0 5.653 0.0 0.0 0.0 5.653" Properties=species:S:1:pos:R:3 pbc="T T T"
Ga 0.000000 0.000000 0.000000
Ga 2.826500 2.826500 0.000000
Ga 2.826500 0.000000 2.826500
Ga 0.000000 2.826500 2.826500
As 1.413250 1.413250 1.413250
As 4.239750 4.239750 1.413250
As 4.239750 1.413250 4.239750
As 1.413250 4.239750 4.239750`,
  },
  {
    id: "inp-zincblende",
    name: "Indium Phosphide (zincblende)",
    formula: "InP",
    category: "iii-v",
    application: "Photonic integrated circuits, high-speed transistors",
    latticeA: 5.869,
    atomCount: 8,
    elements: ["In", "P"],
    xyzData: `8
Lattice="5.869 0.0 0.0 0.0 5.869 0.0 0.0 0.0 5.869" Properties=species:S:1:pos:R:3 pbc="T T T"
In 0.000000 0.000000 0.000000
In 2.934500 2.934500 0.000000
In 2.934500 0.000000 2.934500
In 0.000000 2.934500 2.934500
P  1.467250 1.467250 1.467250
P  4.401750 4.401750 1.467250
P  4.401750 1.467250 4.401750
P  1.467250 4.401750 4.401750`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DIELECTRICS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "sio2-quartz",
    name: "Silicon Dioxide (α-quartz)",
    formula: "SiO₂",
    category: "dielectric",
    application: "Gate oxide, shallow trench isolation (STI), passivation",
    latticeA: 4.916,
    atomCount: 9,
    elements: ["Si", "O"],
    xyzData: `9
Lattice="4.916 0.0 0.0 -2.458 4.257 0.0 0.0 0.0 5.405" Properties=species:S:1:pos:R:3 pbc="T T T"
Si 2.281100 1.316900 1.801700
Si -0.177200 2.940400 3.603300
Si 0.354300 1.316900 5.405000
O  2.104400 0.000000 1.081000
O  0.353700 2.454200 2.882700
O  -0.000200 1.803000 0.720700
O  0.177600 2.940400 4.684300
O  2.458000 1.453400 3.603300
O  -0.177600 4.257100 4.324000`,
  },
  {
    id: "hfo2-monoclinic",
    name: "Hafnium Dioxide (monoclinic)",
    formula: "HfO₂",
    category: "dielectric",
    application: "High-k gate dielectric replacing SiO₂ in advanced CMOS",
    latticeA: 5.117,
    atomCount: 12,
    elements: ["Hf", "O"],
    xyzData: `12
Lattice="5.117 0.0 0.0 0.0 5.175 0.0 -0.862 0.0 5.292" Properties=species:S:1:pos:R:3 pbc="T T T"
Hf 1.285700 2.080200 1.302500
Hf 3.831300 3.094800 3.989500
Hf 3.831300 0.492700 3.948200
Hf 1.285700 4.682300 1.343800
O  0.470000 1.361000 3.355600
O  4.647000 3.814000 1.936400
O  2.088500 0.920000 0.108100
O  3.028500 4.255000 5.183900
O  3.028500 2.507500 1.790400
O  2.088500 2.667500 3.501600
O  4.647000 1.361000 5.247600
O  0.470000 3.814000 0.044400`,
  },
  {
    id: "al2o3-corundum",
    name: "Aluminium Oxide (corundum)",
    formula: "Al₂O₃",
    category: "dielectric",
    application: "Insulating layers, passivation, ALD barrier coatings",
    latticeA: 4.759,
    atomCount: 10,
    elements: ["Al", "O"],
    xyzData: `10
Lattice="4.759 0.0 0.0 -2.380 4.121 0.0 0.0 0.0 12.993" Properties=species:S:1:pos:R:3 pbc="T T T"
Al 0.000000 0.000000 4.571000
Al 0.000000 0.000000 8.422000
Al 2.379500 1.374000 2.372800
Al 2.379500 1.374000 6.223800
O  1.441400 0.000000 3.376700
O  -0.721300 1.249100 5.575200
O  1.659300 2.498100 5.575200
O  0.938100 2.747100 1.268500
O  3.258900 1.249100 1.268500
O  -0.938100 1.498000 7.427600`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NITRIDES
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "si3n4-beta",
    name: "Silicon Nitride (β-Si₃N₄)",
    formula: "Si₃N₄",
    category: "nitride",
    application: "Etch stop layers, spacers, stress liners in CMOS",
    latticeA: 7.608,
    atomCount: 14,
    elements: ["Si", "N"],
    xyzData: `14
Lattice="7.608 0.0 0.0 -3.804 6.589 0.0 0.0 0.0 2.911" Properties=species:S:1:pos:R:3 pbc="T T T"
Si 1.257300 2.177800 0.000000
Si 5.093400 1.482200 0.000000
Si 2.546700 4.411200 1.455500
Si -0.032300 5.107200 1.455500
Si -1.289300 4.411200 0.000000
Si 2.546700 2.177800 1.455500
N  3.271300 3.400700 0.000000
N  0.532400 3.188300 1.455500
N  2.079200 0.268700 0.000000
N  1.724800 6.320300 0.000000
N  -0.839200 3.400700 1.455500
N  1.724800 0.268700 1.455500
N  -0.839200 6.320300 0.000000
N  3.271300 3.188300 0.000000`,
  },
  {
    id: "tin-rocksalt",
    name: "Titanium Nitride (rocksalt)",
    formula: "TiN",
    category: "nitride",
    application: "Metal gate electrode, diffusion barrier in interconnects",
    latticeA: 4.240,
    atomCount: 8,
    elements: ["Ti", "N"],
    xyzData: `8
Lattice="4.240 0.0 0.0 0.0 4.240 0.0 0.0 0.0 4.240" Properties=species:S:1:pos:R:3 pbc="T T T"
Ti 0.000000 0.000000 0.000000
Ti 2.120000 2.120000 0.000000
Ti 2.120000 0.000000 2.120000
Ti 0.000000 2.120000 2.120000
N  2.120000 0.000000 0.000000
N  0.000000 2.120000 0.000000
N  0.000000 0.000000 2.120000
N  2.120000 2.120000 2.120000`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // METALS (interconnects / gates)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "cu-fcc",
    name: "Copper (FCC)",
    formula: "Cu",
    category: "metal",
    application: "Interconnect wiring (damascene process) in all CMOS nodes",
    latticeA: 3.615,
    atomCount: 4,
    elements: ["Cu"],
    xyzData: `4
Lattice="3.615 0.0 0.0 0.0 3.615 0.0 0.0 0.0 3.615" Properties=species:S:1:pos:R:3 pbc="T T T"
Cu 0.000000 0.000000 0.000000
Cu 0.000000 1.807500 1.807500
Cu 1.807500 0.000000 1.807500
Cu 1.807500 1.807500 0.000000`,
  },
  {
    id: "w-bcc",
    name: "Tungsten (BCC)",
    formula: "W",
    category: "metal",
    application: "Contact plugs, via fill, gate metal in advanced nodes",
    latticeA: 3.165,
    atomCount: 2,
    elements: ["W"],
    xyzData: `2
Lattice="3.165 0.0 0.0 0.0 3.165 0.0 0.0 0.0 3.165" Properties=species:S:1:pos:R:3 pbc="T T T"
W 0.000000 0.000000 0.000000
W 1.582500 1.582500 1.582500`,
  },
];

// ---------------------------------------------------------------------------
// Helper functions (mirrors lib/mlpeg-catalog.ts pattern)
// ---------------------------------------------------------------------------

/** Get all materials in the library. */
export function getAllMaterials(): SemiconductorMaterial[] {
  return SEMICONDUCTOR_LIBRARY;
}

/** Find a material by ID. */
export function getMaterialById(
  id: string
): SemiconductorMaterial | undefined {
  return SEMICONDUCTOR_LIBRARY.find((m) => m.id === id);
}

/** Get total count. */
export function getLibrarySize(): number {
  return SEMICONDUCTOR_LIBRARY.length;
}

/**
 * Convert a SemiconductorMaterial's xyzData into a File object.
 * Mirrors catalogEntryToFile() from lib/mlpeg-catalog.ts.
 */
export function structureToFile(material: SemiconductorMaterial): File {
  const blob = new Blob([material.xyzData], { type: "chemical/x-xyz" });
  return new File([blob], `${material.id}.xyz`, { type: "chemical/x-xyz" });
}
