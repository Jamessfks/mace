"use client";

/**
 * DatasetUpload — Single-file upload for MACE training datasets (.xyz / .extxyz).
 *
 * Mirrors the calculator page UX: drag-and-drop, accepted formats, structure
 * summary (atom count, elements, frame count), and size/warning messages.
 * Uses lib/parse-structure for client-side parsing; no backend call.
 *
 * Validation:
 *   - Only .xyz and .extxyz accepted (training data format per MACE_Freeze README).
 *   - Large files (>500 frames or >50k atoms in first frame) show a warning.
 */

import { useCallback, useState, useEffect } from "react";
import { Upload, X, File, AlertTriangle } from "lucide-react";
import { parseStructureFile, type ParsedStructure } from "@/lib/parse-structure";

const ACCEPTED = [".xyz", ".extxyz"];
const ACCEPT_ATTR = ".xyz,.extxyz";

/** Atom count in first frame above which we show a "large dataset" warning. */
const LARGE_ATOMS = 50_000;
/** Frame count above which we suggest splitting or using a smaller sample. */
const LARGE_FRAMES = 500;

interface DatasetUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Callback when parse fails (e.g. invalid format). */
  onError?: (message: string) => void;
}

export function DatasetUpload({
  file,
  onFileChange,
  onError,
}: DatasetUploadProps) {
  const [parsed, setParsed] = useState<ParsedStructure | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setParsed(null);
      setParseError(null);
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "xyz" && ext !== "extxyz") {
      setParseError("Only .xyz and .extxyz are supported for training data.");
      setParsed(null);
      onError?.("Only .xyz / .extxyz supported.");
      return;
    }
    setParseError(null);
    parseStructureFile(file)
      .then((p) => {
        setParsed(p);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to parse file.";
        setParseError(msg);
        setParsed(null);
        onError?.(msg);
      });
  }, [file, onError]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) onFileChange(f);
    },
    [onFileChange]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      onFileChange(f ?? null);
    },
    [onFileChange]
  );

  const removeFile = useCallback(() => {
    onFileChange(null);
  }, [onFileChange]);

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
      <h3 className="mb-4 font-mono text-sm font-bold text-matrix-green">
        OPTION B — UPLOAD YOUR OWN DATASET
      </h3>
      <p className="mb-3 font-mono text-xs text-zinc-500">
        One structure file in .xyz or .extxyz format (multi-frame allowed).
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="relative cursor-pointer rounded-lg border-2 border-dashed border-matrix-green/30 bg-matrix-green/5 p-8 text-center transition-colors hover:border-matrix-green/50 hover:bg-matrix-green/10"
      >
        <input
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleInput}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Choose dataset file (.xyz or .extxyz)"
        />
        <Upload className="mx-auto mb-2 h-10 w-10 text-matrix-green/60" />
        <p className="font-mono text-sm text-zinc-300">
          Drag & drop or click to browse
        </p>
        <p className="mt-1 font-mono text-xs text-zinc-600">
          Supported: {ACCEPTED.join(", ")}
        </p>
      </div>

      {parseError && (
        <div className="mt-3 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="font-mono text-xs text-red-400">{parseError}</p>
        </div>
      )}

      {file && parsed && !parseError && (
        <div className="mt-4 rounded border border-matrix-green/20 bg-black/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <File className="h-4 w-4 text-matrix-green/80" />
              <div>
                <p className="font-mono text-xs text-zinc-300">{file.name}</p>
                <p className="font-mono text-xs text-zinc-600">
                  {(file.size / 1024).toFixed(1)} KB · {parsed.atomCount} atoms
                  (first frame) · {parsed.frameCount} frame
                  {parsed.frameCount !== 1 ? "s" : ""}
                </p>
                <p className="font-mono text-xs text-zinc-500">
                  Elements: {parsed.elements.join(", ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={removeFile}
              className="text-zinc-500 hover:text-red-400"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {(parsed.atomCount > LARGE_ATOMS || parsed.frameCount > LARGE_FRAMES) && (
            <div className="mt-2 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <p className="font-mono text-[11px] text-amber-400/90">
                Large dataset: training may be slow or run out of memory. Consider
                splitting or using a smaller sample for a quick demo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
