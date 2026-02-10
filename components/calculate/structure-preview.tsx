"use client";

/**
 * StructurePreview — Click-to-display 3D preview of an uploaded structure.
 *
 * PURPOSE:
 *   Let users visually inspect their uploaded structure BEFORE running a MACE
 *   calculation. This catches huge files, wrong structures, or broken
 *   geometries before the backend is involved.
 *
 * HOW IT WORKS:
 *   1. Parent passes uploaded File objects.
 *   2. User clicks "Preview Structure" → first file is parsed client-side
 *      (via lib/parse-structure.ts) into symbols + positions.
 *   3. A 3Dmol.js viewer renders the structure with ball-and-stick style.
 *   4. Stats (atom count, elements, bounding box) are shown.
 *   5. Warnings are displayed for large structures (>500 atoms).
 *
 * CLICK-TO-DISPLAY:
 *   The viewer only loads when the user clicks the button. This avoids
 *   slowing down the page for users who don't need the preview.
 *
 * VIEWER ENGINE:
 *   Uses WEAS by default (matching ml-peg). Falls back to 3Dmol.js on error.
 *   User can toggle between them via a small button.
 *
 * DEPENDENCIES:
 *   - weas (CDN via iframe) — WEAS viewer loaded at runtime
 *   - 3dmol (npm) — fallback viewer, dynamically imported
 *   - lib/parse-structure.ts — client-side XYZ/CIF/PDB/POSCAR parser
 *   - ./weas-viewer.tsx — WEAS iframe wrapper component
 */

import { useEffect, useRef, useState } from "react";
import { Eye, X, AlertTriangle } from "lucide-react";
import {
  parseStructureFile,
  type ParsedStructure,
} from "@/lib/parse-structure";
import { WeasViewer } from "./weas-viewer";

/** Viewer engine for the preview. WEAS is default (ml-peg compatible). */
type PreviewEngine = "weas" | "3dmol";

// ---------------------------------------------------------------------------
// Thresholds for warnings
// ---------------------------------------------------------------------------

/** Structures above this atom count trigger a warning. */
const LARGE_STRUCTURE_THRESHOLD = 500;
/** Structures above this count show a "very large" critical warning. */
const VERY_LARGE_THRESHOLD = 2000;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StructurePreviewProps {
  /** The uploaded files (first file is previewed). */
  files: File[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StructurePreview({ files }: StructurePreviewProps) {
  // Whether the preview panel is open (click-to-display)
  const [isOpen, setIsOpen] = useState(false);
  // Parsed structure data (null until parsed)
  const [parsed, setParsed] = useState<ParsedStructure | null>(null);
  // Raw file text (needed for WEAS which takes string input)
  const [rawXYZ, setRawXYZ] = useState<string>("");
  // Parsing / loading state
  const [loading, setLoading] = useState(false);
  // Parse error message
  const [error, setError] = useState<string | null>(null);
  // Viewer engine toggle
  const [engine, setEngine] = useState<PreviewEngine>("weas");

  // 3Dmol viewer refs (only used when engine === "3dmol")
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Reset when files change
  useEffect(() => {
    setIsOpen(false);
    setParsed(null);
    setRawXYZ("");
    setError(null);
  }, [files]);

  // Parse the first file when the user clicks "Preview Structure"
  const handlePreview = async () => {
    if (files.length === 0) return;

    setIsOpen(true);
    setLoading(true);
    setError(null);
    setParsed(null);

    try {
      const structure = await parseStructureFile(files[0]);

      if (structure.atomCount === 0) {
        throw new Error("No atoms found in file. Check the file format.");
      }

      // Build XYZ string for WEAS viewer
      let xyz = `${structure.atomCount}\nPreview\n`;
      structure.symbols.forEach((sym, i) => {
        const [x, y, z] = structure.positions[i];
        xyz += `${sym} ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
      });
      setRawXYZ(xyz);

      setParsed(structure);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse structure file."
      );
    } finally {
      setLoading(false);
    }
  };

  // Close preview
  const handleClose = () => {
    setIsOpen(false);
    setParsed(null);
    setRawXYZ("");
    setError(null);
    viewerInstance.current?.clear?.();
  };

  // Render 3Dmol viewer when parsed structure is available AND engine is 3dmol
  useEffect(() => {
    if (engine !== "3dmol") return;
    if (!viewerRef.current || !parsed) return;

    const resize = () => {
      viewerInstance.current?.resize?.();
      viewerInstance.current?.render?.();
    };

    import("3dmol").then(($3Dmol) => {
      if (!viewerRef.current || !parsed) return;

      viewerRef.current.innerHTML = "";
      viewerInstance.current = $3Dmol.createViewer(viewerRef.current, {
        backgroundColor: "black",
      });
      const viewer = viewerInstance.current;

      viewer.addModel(rawXYZ, "xyz");
      viewer.setStyle({}, { stick: { radius: 0.25 }, sphere: { scale: 0.3 } });
      viewer.enableFog(false);
      viewer.zoomTo();
      viewer.render();

      resize();
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(viewerRef.current);
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      viewerInstance.current?.clear?.();
    };
  }, [parsed, engine]);

  // Don't render anything if no files uploaded
  if (files.length === 0) return null;

  // Determine warning level
  const atomCount = parsed?.atomCount ?? 0;
  const isVeryLarge = atomCount > VERY_LARGE_THRESHOLD;
  const isLarge = atomCount > LARGE_STRUCTURE_THRESHOLD;

  return (
    <div className="mt-4">
      {/* ── "Preview Structure" button (click-to-display) ── */}
      {!isOpen && (
        <button
          type="button"
          onClick={handlePreview}
          className="flex items-center gap-2 rounded border border-matrix-green/40 bg-matrix-green/10 px-4 py-2 font-mono text-xs text-matrix-green transition-colors hover:bg-matrix-green/20 hover:border-matrix-green/60"
        >
          <Eye className="h-4 w-4" />
          Preview Structure
        </button>
      )}

      {/* ── Preview panel (shown after click) ── */}
      {isOpen && (
        <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-4">
          {/* Header with engine toggle and close button */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-mono text-sm font-bold text-matrix-green">
                STRUCTURE PREVIEW
              </h3>
              {/* Engine toggle (only visible when structure is loaded) */}
              {parsed && (
                <div className="flex rounded border border-matrix-green/40 bg-black/60">
                  <button
                    type="button"
                    onClick={() => setEngine("weas")}
                    title="WEAS viewer (ml-peg compatible)"
                    className={`flex h-6 items-center px-2 font-mono text-[10px] transition-colors ${
                      engine === "weas"
                        ? "bg-matrix-green/20 text-matrix-green"
                        : "text-zinc-400 hover:text-matrix-green"
                    }`}
                  >
                    WEAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngine("3dmol")}
                    title="3Dmol.js viewer"
                    className={`flex h-6 items-center px-2 font-mono text-[10px] transition-colors ${
                      engine === "3dmol"
                        ? "bg-matrix-green/20 text-matrix-green"
                        : "text-zinc-400 hover:text-matrix-green"
                    }`}
                  >
                    3Dmol
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              title="Close preview"
              className="text-zinc-500 transition-colors hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-matrix-green/30 border-t-matrix-green" />
            </div>
          )}

          {/* Parse error */}
          {error && (
            <div className="rounded border border-red-500/50 bg-red-500/10 p-3 font-mono text-xs text-red-400">
              <strong>Parse error:</strong> {error}
            </div>
          )}

          {/* Parsed structure: stats + warnings + viewer */}
          {parsed && !loading && (
            <>
              {/* ── Stats row ── */}
              <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
                <span className="text-zinc-400">
                  Atoms:{" "}
                  <span className="text-white">{parsed.atomCount}</span>
                </span>
                <span className="text-zinc-400">
                  Elements:{" "}
                  <span className="text-white">
                    {parsed.elements.join(", ")}
                  </span>
                </span>
                <span className="text-zinc-400">
                  Box:{" "}
                  <span className="text-white">
                    {parsed.boundingBox.size[0].toFixed(1)} x{" "}
                    {parsed.boundingBox.size[1].toFixed(1)} x{" "}
                    {parsed.boundingBox.size[2].toFixed(1)} A
                  </span>
                </span>
                {parsed.frameCount > 1 && (
                  <span className="text-zinc-400">
                    Frames:{" "}
                    <span className="text-white">
                      {parsed.frameCount} (showing first)
                    </span>
                  </span>
                )}
              </div>

              {/* ── Warnings ── */}
              {isVeryLarge && (
                <div className="mb-3 flex items-start gap-2 rounded border border-red-500/50 bg-red-500/10 p-3 font-mono text-xs text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Very large structure ({atomCount} atoms).</strong>{" "}
                    Calculations will be very slow or may timeout. Consider
                    using a smaller subset.
                  </div>
                </div>
              )}
              {isLarge && !isVeryLarge && (
                <div className="mb-3 flex items-start gap-2 rounded border border-amber-500/50 bg-amber-500/10 p-3 font-mono text-xs text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Large structure ({atomCount} atoms).</strong>{" "}
                    Calculation may take several minutes. Single-point energy
                    is recommended for large systems.
                  </div>
                </div>
              )}

              {/* ── Viewer (WEAS or 3Dmol based on engine toggle) ── */}
              <div className="relative overflow-hidden rounded-lg border border-matrix-green/20 bg-black shadow-inner">
                {/* WEAS viewer (default — ml-peg compatible) */}
                {engine === "weas" && rawXYZ && (
                  <WeasViewer structureData={rawXYZ} format="xyz" height={500} />
                )}

                {/* 3Dmol.js viewer (fallback / alternative) */}
                {engine === "3dmol" && (
                  <div
                    ref={viewerRef}
                    className="w-full"
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 500,
                      minHeight: 500,
                    }}
                  />
                )}
              </div>

              <p className="mt-2 font-mono text-xs text-zinc-600">
                {engine === "weas"
                  ? "WEAS viewer (ml-peg compatible) · Drag to rotate · Scroll to zoom"
                  : "3Dmol.js · Drag to rotate · Scroll to zoom"
                }
                {" · Preview only — no forces shown"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
