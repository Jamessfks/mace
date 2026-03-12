"use client";

/**
 * MoleculeSketcher — Draw-a-molecule UI for MACE-OFF calculations.
 *
 * LAYOUT:
 *   Single-column stacked layout designed to work inside the parent's
 *   full-width area (page.tsx switches to a single-column grid when
 *   draw mode is active so the sketcher gets the full viewport width).
 *
 *   Stack order:
 *     1. JSME editor (full width, 480px tall — needs room for toolbar)
 *     2. Info bar: 2D SVG preview + descriptors + SMILES (horizontal row)
 *     3. Validation/error messages
 *     4. Generate button
 *
 * DATA FLOW:
 *   JSME → SMILES → RDKit.js validation + 2D SVG → /api/smiles-to-xyz
 *   → File object → parent page (same as uploaded file)
 *
 * MACE-OFF ELEMENT CONSTRAINT (arXiv:2312.15211):
 *   Only H, C, N, O, F, P, S, Cl, Br, I are supported.
 *
 * DEPENDENCIES:
 *   - @loschmidt/jsme-react (JSME molecule editor, BSD)
 *   - @rdkit/rdkit (WASM cheminformatics, BSD-3-Clause)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertTriangle, Beaker, Atom, ArrowRight } from "lucide-react";
import type { RDKitModule, JSMol } from "@rdkit/rdkit";

const MACE_OFF_ELEMENTS = new Set([
  "H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I",
]);

const FORMULA_ELEMENT_RE = /([A-Z][a-z]?)(\d*)/g;

function extractElementsFromFormula(formula: string): Set<string> {
  const elements = new Set<string>();
  let match;
  while ((match = FORMULA_ELEMENT_RE.exec(formula)) !== null) {
    if (match[1]) elements.add(match[1]);
  }
  return elements;
}

export interface SketchMetadata {
  smiles: string;
  formula: string;
  mw: number;
  numAtoms: number;
  svgHtml: string;
}

interface MoleculeSketcherProps {
  onFileGenerated: (file: File, metadata: SketchMetadata) => void;
}

export function MoleculeSketcher({ onFileGenerated }: MoleculeSketcherProps) {
  const [smiles, setSmiles] = useState("");
  const [svgPreview, setSvgPreview] = useState<string | null>(null);
  const [descriptors, setDescriptors] = useState<{
    formula: string;
    mw: number;
    numAtoms: number;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [rdkitModule, setRdkitModule] = useState<RDKitModule | null>(null);
  const [rdkitLoading, setRdkitLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load RDKit WASM from public/ via script tag to avoid Turbopack bundling issues.
  // The .wasm and .js files are copied from node_modules/@rdkit/rdkit/dist/ to public/.
  useEffect(() => {
    let cancelled = false;

    function loadViaScript(): Promise<RDKitModule> {
      return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.initRDKitModule) {
          return window.initRDKitModule({
            locateFile: () => "/RDKit_minimal.wasm",
          }).then(resolve, reject);
        }

        const script = document.createElement("script");
        script.src = "/RDKit_minimal.js";
        script.onload = () => {
          if (!window.initRDKitModule) {
            return reject(new Error("initRDKitModule not found after script load"));
          }
          window.initRDKitModule({
            locateFile: () => "/RDKit_minimal.wasm",
          }).then(resolve, reject);
        };
        script.onerror = () => reject(new Error("Failed to load RDKit_minimal.js"));
        document.head.appendChild(script);
      });
    }

    loadViaScript()
      .then((mod) => {
        if (!cancelled) {
          setRdkitModule(mod);
          setRdkitLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load RDKit WASM:", err);
        if (!cancelled) setRdkitLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const validateSmiles = useCallback(
    (smi: string) => {
      if (!rdkitModule) return;

      setSvgPreview(null);
      setDescriptors(null);
      setValidationError(null);
      setGenerationError(null);

      if (!smi || !smi.trim()) return;

      let mol: JSMol | null = null;
      try {
        mol = rdkitModule.get_mol(smi);
        if (!mol || !mol.is_valid()) {
          setValidationError("Invalid molecule structure");
          return;
        }

        const descJson = JSON.parse(mol.get_descriptors());
        const formula: string = descJson.MolecularFormula || descJson.formula || "";
        const mw: number = parseFloat(descJson.exactMW || descJson.amw || "0");
        const numAtoms: number = parseInt(descJson.NumHeavyAtoms || "0", 10);

        const elements = extractElementsFromFormula(formula);
        const unsupported = [...elements].filter((e) => !MACE_OFF_ELEMENTS.has(e));
        if (unsupported.length > 0) {
          setValidationError(
            `MACE-OFF does not support: ${unsupported.join(", ")}. ` +
            "Only H, C, N, O, F, P, S, Cl, Br, I are supported."
          );
        }

        const svg = mol.get_svg(200, 160);
        setSvgPreview(svg);
        setDescriptors({ formula, mw, numAtoms });
      } finally {
        mol?.delete();
      }
    },
    [rdkitModule]
  );

  const handleSmilesChange = useCallback(
    (newSmiles: string) => {
      setSmiles(newSmiles);
      // Clear preview immediately so we never show a molecule that doesn't match current input.
      // validateSmiles (debounced) will set the correct values when it runs.
      setSvgPreview(null);
      setDescriptors(null);
      setValidationError(null);
      setGenerationError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => validateSmiles(newSmiles), 300);
    },
    [validateSmiles]
  );

  const handleGenerate = useCallback(async () => {
    if (!smiles.trim() || validationError) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const res = await fetch("/api/smiles-to-xyz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: smiles.trim() }),
      });

      const data = await res.json();

      if (data.status === "error") {
        setGenerationError(data.message || "3D generation failed");
        return;
      }

      // Generate SVG from the actual molecule we sent (canonical SMILES from API).
      // Never use svgPreview here — it can be stale if user edited quickly before Generate.
      let svgHtml = "";
      const canonicalSmiles = data.smiles || smiles.trim();
      if (rdkitModule && canonicalSmiles) {
        try {
          const mol = rdkitModule.get_mol(canonicalSmiles);
          if (mol && mol.is_valid()) {
            svgHtml = mol.get_svg(200, 160);
            mol.delete();
          }
        } catch {
          // RDKit failed; svgHtml stays empty
        }
      }

      const file = new File(
        [data.xyz],
        "sketched-molecule.xyz",
        { type: "text/plain" }
      );
      onFileGenerated(file, {
        smiles: canonicalSmiles,
        formula: data.formula || descriptors?.formula || "",
        mw: data.molecularWeight || descriptors?.mw || 0,
        numAtoms: data.atomCount ?? 0,
        svgHtml,
      });
    } catch (err) {
      setGenerationError(
        err instanceof Error ? err.message : "Network error during 3D generation"
      );
    } finally {
      setIsGenerating(false);
    }
  }, [smiles, validationError, onFileGenerated, rdkitModule, descriptors]);

  const [JsmeComponent, setJsmeComponent] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import("@loschmidt/jsme-react").then((mod) => {
      setJsmeComponent(() => mod.Jsme);
    });
  }, []);

  // JSME requires exact pixel dimensions — it can't handle "100%" or CSS sizing.
  // Measure the container and re-measure on resize so the editor fills the card.
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorSize, setEditorSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setEditorSize({ w: Math.floor(rect.width), h: 480 });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasValidMolecule = smiles.trim().length > 0 && !validationError;

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5">
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-bold text-[var(--color-accent-primary)]">
        <Beaker className="h-4 w-4" />
        DRAW A MOLECULE
      </h2>

      {/* ── JSME Editor — container measured, pixel dims passed to JSME ── */}
      <div
        ref={editorContainerRef}
        className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-white"
        style={{ height: 480 }}
      >
        {JsmeComponent && editorSize ? (
          // @ts-ignore — JSME types target React 17/18, runtime works with React 19
          <JsmeComponent
            height={editorSize.h}
            width={editorSize.w}
            onChange={handleSmilesChange}
            options="oldlook,star"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[var(--color-bg-primary)]">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--color-accent-primary)]" />
              <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
                Loading molecule editor...
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
        Click atoms &amp; bonds to draw. Right-click for element menu. Scroll to zoom.
      </p>

      {/* ── Info bar: SVG preview + descriptors side by side ── */}
      {(svgPreview || smiles) && (
        <div className="mt-4 flex items-start gap-4">
          {/* 2D preview thumbnail */}
          {svgPreview && (
            <div className="shrink-0 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-2">
              <div
                dangerouslySetInnerHTML={{ __html: svgPreview }}
                className="[&>svg]:h-[100px] [&>svg]:w-[130px]"
              />
            </div>
          )}

          {/* Descriptors + SMILES */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {descriptors && (
              <div className="flex flex-wrap gap-2">
                <InfoChip label="Formula" value={descriptors.formula} />
                <InfoChip label="MW" value={descriptors.mw.toFixed(2)} />
                <InfoChip label="Heavy atoms" value={String(descriptors.numAtoms)} />
              </div>
            )}
            {smiles && (
              <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-2.5 py-1.5">
                <p className="font-mono text-[10px] text-[var(--color-text-muted)]">SMILES</p>
                <p className="break-all font-mono text-xs text-[var(--color-text-secondary)]">
                  {smiles}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RDKit loading indicator (only when no preview yet) */}
      {rdkitLoading && !svgPreview && (
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--color-accent-primary)]" />
          Initializing RDKit validation engine...
        </div>
      )}

      {/* Validation Warning */}
      {validationError && (
        <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="font-mono text-xs text-amber-300">{validationError}</p>
        </div>
      )}

      {/* Generation Error */}
      {generationError && (
        <div className="mt-3 flex items-start gap-2 rounded border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-error)]" />
          <p className="font-mono text-xs text-[var(--color-error)]/80">{generationError}</p>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!hasValidMolecule || isGenerating || rdkitLoading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border-2 border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 px-6 py-3 font-sans text-sm font-bold text-[var(--color-accent-primary)] transition-all hover:bg-[var(--color-accent-primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--color-accent-primary)]/10 disabled:hover:text-[var(--color-accent-primary)]"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating 3D coordinates...
          </>
        ) : (
          <>
            <Atom className="h-4 w-4" />
            Generate 3D &amp; Load Structure
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="mt-2 font-mono text-[10px] text-[var(--color-text-muted)]">
        Generates 3D coordinates via RDKit (MMFF94), then loads for MACE-OFF calculation.
      </p>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-2.5 py-1.5">
      <p className="font-mono text-[10px] text-[var(--color-text-muted)]">{label}</p>
      <p className="font-mono text-xs font-bold text-[var(--color-text-primary)]">{value}</p>
    </div>
  );
}
