"use client";

/**
 * MlPegCatalog — Browse and select benchmark structures from ml-peg.
 *
 * PURPOSE:
 *   As the MACE founder suggested: "it could be really fun to connect the
 *   two tools, so that users could select a structure directly from the
 *   ml-peg menu instead of uploading a new one."
 *
 *   This component provides a browsable catalog of benchmark structures from
 *   ml-peg (https://github.com/ddmms/ml-peg). Users can pick a structure
 *   (e.g. "Silicon diamond", "Ethanol") and it's auto-loaded into the
 *   calculator — no file upload needed.
 *
 * HOW IT WORKS:
 *   1. User clicks "Browse ml-peg structures" to open the catalog.
 *   2. Structures are organized by category (Bulk Crystals, Molecules, etc.)
 *      matching ml-peg's folder structure.
 *   3. User clicks a structure → it's converted to a File object and passed
 *      to the parent's onSelect callback.
 *   4. The parent (file-upload-section) sets it as the uploaded file, and the
 *      rest of the pipeline (info, preview, calculation) works as normal.
 *
 * DATA SOURCE:
 *   Structures are embedded in lib/mlpeg-catalog.ts as XYZ strings. This
 *   avoids CORS issues and network dependency. The catalog mirrors the
 *   categories in ml-peg's app/ directory.
 *
 * DEPENDENCIES:
 *   - lib/mlpeg-catalog.ts — Catalog data and helper functions
 *
 * SEE ALSO:
 *   - ml-peg repository: https://github.com/ddmms/ml-peg
 *   - ml-peg live guide:  https://ml-peg.stfc.ac.uk
 */

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, X, Atom } from "lucide-react";
import {
  getCategories,
  catalogEntryToFile,
  getCatalogSize,
  type CatalogEntry,
  type CatalogCategory,
} from "@/lib/mlpeg-catalog";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MlPegCatalogProps {
  /**
   * Called when the user selects a structure from the catalog.
   * Receives a File object (XYZ format) that can be used like an upload.
   */
  onSelect: (file: File) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MlPegCatalog({ onSelect }: MlPegCatalogProps) {
  // Whether the catalog panel is open
  const [isOpen, setIsOpen] = useState(false);
  // Which categories are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const categories = getCategories();
  const totalStructures = getCatalogSize();

  // Toggle a category's expanded state
  const toggleCategory = (categoryId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  // Handle structure selection
  const handleSelect = (entry: CatalogEntry) => {
    const file = catalogEntryToFile(entry);
    onSelect(file);
    setIsOpen(false); // Close catalog after selection
  };

  return (
    <div className="mt-3">
      {/* ── Toggle button ── */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded border border-matrix-green/40 bg-matrix-green/5 px-4 py-2 font-mono text-xs text-matrix-green transition-colors hover:bg-matrix-green/15 hover:border-matrix-green/60"
        >
          <BookOpen className="h-4 w-4" />
          Browse ml-peg structures ({totalStructures})
        </button>
      ) : (
        /* ── Catalog panel ── */
        <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-4">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-matrix-green" />
              <h3 className="font-mono text-sm font-bold text-matrix-green">
                ML-PEG BENCHMARK STRUCTURES
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Close catalog"
              className="text-zinc-500 transition-colors hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-4 font-mono text-xs text-zinc-500">
            Select a benchmark structure from the{" "}
            <a
              href="https://github.com/ddmms/ml-peg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-matrix-green/70 underline hover:text-matrix-green"
            >
              ml-peg
            </a>{" "}
            catalog. Click a structure to load it into the calculator.
          </p>

          {/* ── Category list ── */}
          <div className="space-y-1">
            {categories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                isExpanded={expanded.has(category.id)}
                onToggle={() => toggleCategory(category.id)}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Footer */}
          <p className="mt-4 font-mono text-[10px] text-zinc-600">
            Structures from{" "}
            <a
              href="https://github.com/ddmms/ml-peg"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ml-peg v0.2.2
            </a>
            {" · "}
            {totalStructures} structures · GPL-3.0 license
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category Section (expandable)
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  isExpanded,
  onToggle,
  onSelect,
}: {
  category: CatalogCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (entry: CatalogEntry) => void;
}) {
  return (
    <div className="rounded border border-matrix-green/10 bg-black/40">
      {/* Category header (click to expand) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 font-mono text-xs transition-colors hover:bg-matrix-green/5"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-matrix-green" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-500" />
        )}
        <span className="font-bold text-zinc-300">{category.name}</span>
        <span className="text-zinc-600">
          ({category.entries.length})
        </span>
      </button>

      {/* Expanded: show entries */}
      {isExpanded && (
        <div className="border-t border-matrix-green/10 px-2 py-1">
          {category.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onSelect={() => onSelect(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry Row (clickable structure)
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  onSelect,
}: {
  entry: CatalogEntry;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-matrix-green/10"
    >
      <Atom className="h-3.5 w-3.5 shrink-0 text-matrix-green/60" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-200">{entry.name}</span>
          <span className="rounded bg-matrix-green/10 px-1.5 py-0.5 text-[10px] text-matrix-green/70">
            {entry.formula}
          </span>
          <span className="text-zinc-600">
            {entry.atomCount} atoms
          </span>
        </div>
        <p className="mt-0.5 truncate text-zinc-500">{entry.description}</p>
      </div>
      <span className="shrink-0 rounded border border-matrix-green/30 px-1.5 py-0.5 text-[10px] text-matrix-green/60">
        {entry.recommendedModel === "MACE-MP-0" ? "MP" : "OFF"}
      </span>
    </button>
  );
}

/*
 * ============================================================================
 * DOCUMENTATION: ml-peg Catalog Integration
 * ============================================================================
 *
 * WHAT THIS DOES:
 *   Provides a "Browse ml-peg structures" button in the upload section.
 *   When opened, users see a categorized list of benchmark structures from
 *   the ml-peg project. Clicking a structure loads it into the calculator.
 *
 * CATEGORIES (matching ml-peg app/ folders):
 *   | Category               | ml-peg path                          | Examples          |
 *   |------------------------|--------------------------------------|-------------------|
 *   | Bulk Crystals          | ml_peg/app/bulk_crystal/             | Si, Cu, NaCl, Fe  |
 *   | Molecular Systems      | ml_peg/app/molecular/                | H2O, ethanol, C6H6 |
 *   | Non-Covalent           | ml_peg/app/non_covalent_interactions | Water dimer       |
 *   | Surfaces               | ml_peg/app/surfaces/                 | Cu(111), Si(111)  |
 *
 * HOW SELECTION WORKS:
 *   1. User clicks a structure entry.
 *   2. catalogEntryToFile() (from lib/mlpeg-catalog.ts) converts the XYZ
 *      string into a File object.
 *   3. The File is passed to onSelect → parent sets it as the uploaded file.
 *   4. StructureInfo auto-parses it, StructurePreview can show it in 3D,
 *      and the calculator button becomes active.
 *
 * MODEL RECOMMENDATIONS:
 *   Each entry has a recommendedModel field:
 *   - "MACE-MP-0" for bulk crystals and surfaces (materials)
 *   - "MACE-OFF" for molecules and non-covalent systems (organics)
 *   Shown as "MP" or "OFF" badge in the UI.
 *
 * FILES INVOLVED:
 *   - lib/mlpeg-catalog.ts              — Catalog data + helper functions
 *   - components/calculate/mlpeg-catalog.tsx — This file (browser UI)
 *   - components/calculate/file-upload-section.tsx — Parent integration
 *
 * EXTENDING THE CATALOG:
 *   1. Open lib/mlpeg-catalog.ts
 *   2. Add a new entry to the appropriate category:
 *      {
 *        id: "unique-id",
 *        name: "Display Name",
 *        description: "What this structure is",
 *        formula: "Chemical formula",
 *        atomCount: N,
 *        elements: ["El1", "El2"],
 *        recommendedModel: "MACE-MP-0" or "MACE-OFF",
 *        xyzData: `N\nComment\nEl1 x y z\n...`,
 *      }
 *   3. The entry will automatically appear in the UI.
 *
 * FUTURE IMPROVEMENTS:
 *   - Dynamic fetching from ml-peg's S3 bucket when CORS is available
 *   - Search/filter across all structures
 *   - Auto-set the model type based on recommendedModel when a structure is
 *     selected (currently just shown as a badge)
 *   - Preview thumbnail for each structure
 *   - More structures from ml-peg's conformers, supramolecular, lanthanides
 *     categories as they become available
 *
 * REFERENCE:
 *   - ml-peg repository: https://github.com/ddmms/ml-peg
 *   - ml-peg live guide: https://ml-peg.stfc.ac.uk
 *   - ml-peg categories: ml_peg/app/{bulk_crystal,molecular,conformers,
 *     surfaces,non_covalent_interactions,supramolecular,...}
 * ============================================================================
 */
