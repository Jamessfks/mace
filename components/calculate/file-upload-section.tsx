"use client";

/**
 * FileUploadSection — Drag-and-drop file upload with optional structure preview.
 *
 * FEATURES:
 *   - Drag & drop or click-to-browse for .xyz, .cif, .poscar, .contcar, .pdb
 *   - Single file upload only (new upload replaces the previous one)
 *   - "Preview Structure" button (click-to-display) that parses the file
 *     client-side and renders a 3D viewer with atom stats and size warnings
 *
 * ARCHITECTURE:
 *   The preview is handled by the StructurePreview child component. It only
 *   activates when the user clicks the button, so it doesn't slow down the
 *   page for users who don't need it.
 *
 * SEE ALSO:
 *   - lib/parse-structure.ts   — client-side XYZ/CIF/PDB/POSCAR parser
 *   - components/calculate/structure-preview.tsx — 3D preview + warnings
 */

import { useCallback } from "react";
import { Upload, X, File } from "lucide-react";
import { MlPegCatalog } from "./mlpeg-catalog";
import { StructureInfo } from "./structure-info";
import { StructurePreview } from "./structure-preview";

interface FileUploadSectionProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const ACCEPTED_FORMATS = [".xyz", ".cif", ".poscar", ".contcar", ".pdb"];

export function getTotalFilesSize(files: File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

export function FileUploadSection({
  files,
  onFilesChange,
}: FileUploadSectionProps) {
  // Only one file at a time — new upload replaces the previous one
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onFilesChange([droppedFiles[0]]);
      }
    },
    [onFilesChange]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesChange([e.target.files[0]]);
      }
    },
    [onFilesChange]
  );

  const removeFile = () => {
    onFilesChange([]);
  };

  return (
    <div className="space-y-6">
      {/* ── Option A: Upload your own file ── */}
      <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
        <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
          OPTION A — UPLOAD YOUR FILE
        </h2>

        {/* Drag & Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="group relative cursor-pointer rounded-lg border-2 border-dashed border-matrix-green/30 bg-matrix-green/5 p-12 text-center transition-colors hover:border-matrix-green/50 hover:bg-matrix-green/10"
        >
          <input
            type="file"
            accept={ACCEPTED_FORMATS.join(",")}
            onChange={handleFileInput}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <Upload className="mx-auto mb-3 h-12 w-12 text-matrix-green/60" />
          <p className="mb-1 font-mono text-sm text-zinc-300">
            Drag & drop a structure file here
          </p>
          <p className="font-mono text-xs text-zinc-500">
            or click to browse
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Supported: {ACCEPTED_FORMATS.join(", ")}
          </p>
        </div>
      </div>

      {/* ── "OR" divider ── */}
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-matrix-green/20" />
        <span className="font-mono text-xs text-zinc-500">OR</span>
        <div className="h-px flex-1 bg-matrix-green/20" />
      </div>

      {/* ── Option B: Browse ml-peg benchmark structures ── */}
      <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
        <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
          OPTION B — BROWSE ML-PEG STRUCTURES
        </h2>
        <p className="mb-3 font-mono text-xs text-zinc-500">
          Select a benchmark structure from the{" "}
          <a
            href="https://github.com/ddmms/ml-peg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-matrix-green/70 underline hover:text-matrix-green"
          >
            ml-peg
          </a>{" "}
          catalog — no file needed.
        </p>

        {/* ml-peg catalog browser */}
        <MlPegCatalog onSelect={(file) => onFilesChange([file])} />
      </div>

      {/* ── Selected file + info + preview (shown after upload or catalog selection) ── */}
      {files.length > 0 && (
        <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
          <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
            SELECTED STRUCTURE
          </h2>

          {/* File card */}
          <div className="flex items-center justify-between rounded border border-matrix-green/20 bg-black/50 p-3">
            <div className="flex items-center gap-3">
              <File className="h-4 w-4 text-matrix-green/80" />
              <div>
                <p className="font-mono text-xs text-zinc-300">
                  {files[0].name}
                </p>
                <p className="font-mono text-xs text-zinc-600">
                  {(files[0].size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button
              onClick={removeFile}
              className="text-zinc-500 transition-colors hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Structure Info (auto, shown immediately) ──
               See: components/calculate/structure-info.tsx */}
          <StructureInfo file={files[0]} />

          {/* ── Structure Preview (click-to-display 3D viewer) ──
               See: components/calculate/structure-preview.tsx */}
          <StructurePreview files={files} />
        </div>
      )}
    </div>
  );
}

/*
 * ============================================================================
 * DOCUMENTATION: Upload, Info & Preview Pipeline
 * ============================================================================
 *
 * This file orchestrates a two-level inspection system for uploaded structures,
 * directly addressing the MACE founder's feedback about catching huge or
 * unexpected structures before overwhelming the backend.
 *
 * LEVEL 1 — StructureInfo (automatic, instant)
 *   Shown IMMEDIATELY after file upload. No user action needed.
 *   - Atom count (color-coded badge: green / amber / red)
 *   - Element list
 *   - Bounding box size (Angstroms)
 *   - Frame count (multi-frame XYZ)
 *   - Warnings:
 *       >500 atoms   → amber ("calculation may be slow")
 *       >2000 atoms  → red ("may timeout")
 *       >100 A box   → amber ("very large simulation box")
 *   - "Structure looks good" confirmation for normal structures
 *   File: components/calculate/structure-info.tsx
 *
 * LEVEL 2 — StructurePreview (click-to-display, 3D viewer)
 *   Shown only when user clicks "Preview Structure" button.
 *   - WEAS viewer (ml-peg compatible) or 3Dmol.js (toggle)
 *   - Ball-and-stick rendering
 *   - Stats row (duplicates Level 1, but inside the viewer panel)
 *   File: components/calculate/structure-preview.tsx
 *
 * WHY TWO LEVELS:
 *   Level 1 is lightweight (text only, parses in ~10ms for most files).
 *   Level 2 loads a full 3D viewer (WEAS or 3Dmol.js) which is heavier.
 *   Keeping them separate means users always see warnings fast, and only
 *   load the 3D viewer when they want visual inspection.
 *
 * RENDER ORDER (inside the upload card):
 *   1. Drop zone (drag & drop or click to browse)
 *   2. ml-peg Catalog — "Browse ml-peg structures" button → catalog browser
 *   3. Uploaded file card (name, size, remove button)
 *   4. StructureInfo — auto-parsed info + warnings
 *   5. StructurePreview — "Preview Structure" button → 3D viewer
 *
 * SUPPORTED FORMATS:
 *   | Format       | Extensions               | Parser details          |
 *   |-------------|--------------------------|-------------------------|
 *   | XYZ          | .xyz, .extxyz             | Full support, frame 1   |
 *   | CIF          | .cif                      | _atom_site loop parsing |
 *   | PDB          | .pdb                      | ATOM/HETATM records     |
 *   | POSCAR/VASP  | .poscar, .vasp, .contcar  | Direct + Cartesian      |
 *
 * FILES INVOLVED:
 *   - lib/parse-structure.ts              — Client-side file parser
 *   - lib/mlpeg-catalog.ts                — ml-peg structure catalog data
 *   - components/calculate/mlpeg-catalog.tsx     — Catalog browser UI
 *   - components/calculate/structure-info.tsx     — Level 1 (auto info)
 *   - components/calculate/structure-preview.tsx  — Level 2 (3D viewer)
 *   - components/calculate/weas-viewer.tsx        — WEAS iframe wrapper
 *   - components/calculate/file-upload-section.tsx — This file (parent)
 *
 * EXTENDING:
 *   - New file formats: add parser in lib/parse-structure.ts
 *   - New warnings: add conditions in structure-info.tsx
 *   - New viewer features: edit structure-preview.tsx or weas-viewer.tsx
 *   - New catalog structures: add entries in lib/mlpeg-catalog.ts
 *   - New catalog categories: add CatalogCategory in lib/mlpeg-catalog.ts
 *
 * ML-PEG CATALOG:
 *   The "Browse ml-peg structures" button connects this tool to the MACE
 *   team's ml-peg benchmark catalog (https://github.com/ddmms/ml-peg).
 *   Users can pick structures like "Silicon diamond", "Ethanol", or "Water
 *   dimer" and run calculations without uploading any file.
 *   Structures are embedded as XYZ strings in lib/mlpeg-catalog.ts.
 *   See components/calculate/mlpeg-catalog.tsx for the browser UI.
 * ============================================================================
 */
