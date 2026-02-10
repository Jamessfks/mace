"use client";

/**
 * StructureInfo — Auto-parsed structure summary shown immediately after upload.
 *
 * PURPOSE:
 *   As suggested by the MACE founder, users should see key structure info and
 *   warnings IMMEDIATELY after uploading a file — without clicking anything.
 *   This catches huge or unexpected structures before the backend is involved.
 *
 * WHAT IT SHOWS:
 *   - Atom count (with color-coded badge: green/amber/red)
 *   - Unique elements list
 *   - Bounding box dimensions (Angstroms)
 *   - Frame count (for multi-frame XYZ files)
 *   - File name and size
 *   - Warnings for large structures:
 *       >500 atoms  → amber warning (slow calculation)
 *       >2000 atoms → red warning (may timeout)
 *
 * HOW IT WORKS:
 *   1. Parent passes the uploaded File.
 *   2. On mount (or when file changes), the file is parsed client-side
 *      using lib/parse-structure.ts — NO backend call.
 *   3. Info and warnings are rendered immediately.
 *   4. If parsing fails, a parse error is shown instead.
 *
 * THIS IS NOT THE 3D VIEWER:
 *   The 3D viewer (structure-preview.tsx) is still click-to-display.
 *   This component shows text-based info + warnings only. Both appear
 *   in the file upload section but serve different purposes:
 *     - StructureInfo  → always visible, lightweight, catches problems fast
 *     - StructurePreview → click-to-display, renders 3D viewer
 *
 * DEPENDENCIES:
 *   - lib/parse-structure.ts — client-side file parser
 *
 * THRESHOLDS (adjustable):
 *   - LARGE_THRESHOLD  = 500 atoms  → amber warning
 *   - VLARGE_THRESHOLD = 2000 atoms → red critical warning
 *   - HUGE_BOX_THRESHOLD = 100 Å   → warning about very large simulation box
 *
 * EXTENDING:
 *   To add new checks (e.g. missing elements, overlapping atoms), add them
 *   in the warnings section below. Each warning follows the same pattern:
 *   condition → icon + colored border + message.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Info, CheckCircle } from "lucide-react";
import {
  parseStructureFile,
  type ParsedStructure,
} from "@/lib/parse-structure";

// ---------------------------------------------------------------------------
// Warning thresholds
// ---------------------------------------------------------------------------

/** Atom count above this triggers an amber warning. */
const LARGE_THRESHOLD = 500;
/** Atom count above this triggers a red critical warning. */
const VLARGE_THRESHOLD = 2000;
/** Bounding box dimension (any axis) above this triggers a box size warning. */
const HUGE_BOX_THRESHOLD = 100; // Angstroms

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StructureInfoProps {
  /** The uploaded file to parse and display info for. */
  file: File;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StructureInfo({ file }: StructureInfoProps) {
  const [parsed, setParsed] = useState<ParsedStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(true);

  // Auto-parse when the file changes
  useEffect(() => {
    let cancelled = false;
    setParsing(true);
    setError(null);
    setParsed(null);

    parseStructureFile(file)
      .then((result) => {
        if (cancelled) return;
        if (result.atomCount === 0) {
          setError("No atoms found. Check the file format.");
        } else {
          setParsed(result);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to parse file.");
      })
      .finally(() => {
        if (!cancelled) setParsing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  // ── Loading state ──
  if (parsing) {
    return (
      <div className="mt-3 flex items-center gap-2 font-mono text-xs text-zinc-500">
        <div className="h-3 w-3 animate-spin rounded-full border border-matrix-green/30 border-t-matrix-green" />
        Parsing structure...
      </div>
    );
  }

  // ── Parse error ──
  if (error) {
    return (
      <div className="mt-3 rounded border border-red-500/50 bg-red-500/10 p-3 font-mono text-xs text-red-400">
        <strong>Parse error:</strong> {error}
      </div>
    );
  }

  if (!parsed) return null;

  // ── Compute warnings ──
  const atomCount = parsed.atomCount;
  const isVeryLarge = atomCount > VLARGE_THRESHOLD;
  const isLarge = atomCount > LARGE_THRESHOLD && !isVeryLarge;
  const boxSize = parsed.boundingBox.size;
  const isHugeBox =
    boxSize[0] > HUGE_BOX_THRESHOLD ||
    boxSize[1] > HUGE_BOX_THRESHOLD ||
    boxSize[2] > HUGE_BOX_THRESHOLD;

  // Atom count badge color
  const countColor = isVeryLarge
    ? "text-red-400 border-red-500/50 bg-red-500/10"
    : isLarge
      ? "text-amber-400 border-amber-500/50 bg-amber-500/10"
      : "text-matrix-green border-matrix-green/50 bg-matrix-green/10";

  return (
    <div className="mt-3 space-y-2">
      {/* ── Structure info grid ── */}
      <div className="rounded border border-matrix-green/20 bg-black/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-matrix-green/70" />
          <span className="font-mono text-xs font-bold text-matrix-green/80">
            STRUCTURE INFO
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
          {/* Atom count with color badge */}
          <span className="text-zinc-500">Atoms</span>
          <span className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 font-bold ${countColor}`}>
            {atomCount.toLocaleString()}
          </span>

          {/* Elements */}
          <span className="text-zinc-500">Elements</span>
          <span className="text-white">{parsed.elements.join(", ")}</span>

          {/* Bounding box */}
          <span className="text-zinc-500">Bounding box</span>
          <span className="text-white">
            {boxSize[0].toFixed(1)} x {boxSize[1].toFixed(1)} x{" "}
            {boxSize[2].toFixed(1)} A
          </span>

          {/* Frames (multi-frame files) */}
          {parsed.frameCount > 1 && (
            <>
              <span className="text-zinc-500">Frames</span>
              <span className="text-white">
                {parsed.frameCount} (first frame used)
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Warnings ── */}

      {/* Very large structure (>2000 atoms) — red critical */}
      {isVeryLarge && (
        <div className="flex items-start gap-2 rounded border border-red-500/50 bg-red-500/10 p-3 font-mono text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Very large structure ({atomCount.toLocaleString()} atoms).</strong>{" "}
            Calculations will be very slow or may timeout on the server.
            Consider using a smaller subset of your system.
          </div>
        </div>
      )}

      {/* Large structure (>500 atoms) — amber warning */}
      {isLarge && (
        <div className="flex items-start gap-2 rounded border border-amber-500/50 bg-amber-500/10 p-3 font-mono text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Large structure ({atomCount.toLocaleString()} atoms).</strong>{" "}
            Calculation may take several minutes. Single-point energy is
            recommended for large systems.
          </div>
        </div>
      )}

      {/* Huge bounding box — may indicate periodic system or error */}
      {isHugeBox && (
        <div className="flex items-start gap-2 rounded border border-amber-500/50 bg-amber-500/10 p-3 font-mono text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>
              Very large simulation box ({boxSize[0].toFixed(0)} x{" "}
              {boxSize[1].toFixed(0)} x {boxSize[2].toFixed(0)} A).
            </strong>{" "}
            This may be a periodic system with a large cell. Ensure coordinates
            are correct.
          </div>
        </div>
      )}

      {/* All clear — small structure */}
      {!isLarge && !isVeryLarge && !isHugeBox && (
        <div className="flex items-center gap-2 font-mono text-xs text-matrix-green/70">
          <CheckCircle className="h-3.5 w-3.5" />
          Structure looks good. Ready to calculate.
        </div>
      )}
    </div>
  );
}

/*
 * ============================================================================
 * DOCUMENTATION: StructureInfo — Automatic Structure Warnings
 * ============================================================================
 *
 * MOTIVATION (from MACE founder):
 *   "One idea that could make the tool even more useful is to include an
 *   optional visualisation of the uploaded structure. This would help users
 *   quickly catch any huge or unexpected structures before the site gets
 *   overwhelmed."
 *
 * This component addresses that by auto-parsing the uploaded file and showing:
 *   - Atom count (color-coded: green = fine, amber = large, red = very large)
 *   - Element list (to verify it's the right structure)
 *   - Bounding box (to check system size)
 *   - Warnings for large structures or huge simulation boxes
 *   - A "looks good" confirmation for small/normal structures
 *
 * ARCHITECTURE:
 *   StructureInfo is a child of FileUploadSection. It receives a single File
 *   prop and auto-parses it on mount using lib/parse-structure.ts. No user
 *   action is needed — the info appears the moment a file is uploaded.
 *
 *   The 3D viewer (StructurePreview) remains click-to-display, so there are
 *   two levels of inspection:
 *     Level 1: StructureInfo (auto, text-only, instant)
 *     Level 2: StructurePreview (click, 3D viewer, heavier)
 *
 * WARNING THRESHOLDS:
 *   | Condition            | Threshold     | Severity | Color  |
 *   |----------------------|---------------|----------|--------|
 *   | Large structure      | >500 atoms    | Warning  | Amber  |
 *   | Very large structure | >2000 atoms   | Critical | Red    |
 *   | Huge bounding box    | >100 A (axis) | Warning  | Amber  |
 *
 *   These are defined at the top of this file and can be adjusted.
 *
 * FILES INVOLVED:
 *   - lib/parse-structure.ts            — Parser (XYZ/CIF/PDB/POSCAR)
 *   - components/calculate/structure-info.tsx  — This file (auto info + warnings)
 *   - components/calculate/structure-preview.tsx — 3D viewer (click-to-display)
 *   - components/calculate/file-upload-section.tsx — Parent that renders both
 *
 * EXTENDING:
 *   To add new warnings, add a condition check after the existing warnings
 *   section. Follow the pattern:
 *     {condition && (
 *       <div className="... border-COLOR ...">
 *         <AlertTriangle /> <strong>Title.</strong> Description.
 *       </div>
 *     )}
 *
 *   Examples of future warnings:
 *   - Overlapping atoms (distance < 0.5 A)
 *   - Missing hydrogen atoms
 *   - Unsupported elements for selected model
 *   - Very small structures (< 3 atoms)
 *
 * FUTURE (ml-peg integration):
 *   When loading structures from the ml-peg catalog, StructureInfo can
 *   display the same stats. The ParsedStructure format is the same
 *   regardless of how the structure was obtained (file upload or catalog).
 * ============================================================================
 */
