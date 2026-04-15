"use client";

/**
 * SmilesInput — SMILES string input with example molecules panel.
 *
 * Converts a SMILES string to 3D XYZ via the /api/smiles-to-xyz endpoint,
 * then feeds the resulting File into the existing upload pipeline.
 */

import { useState, useCallback } from "react";
import { Loader2, FlaskConical, Sparkles, AlertCircle } from "lucide-react";

interface SmilesInputProps {
  onFilesChange: (files: File[]) => void;
}

interface ExampleMolecule {
  name: string;
  smiles: string;
  formula: string;
}

const EXAMPLES: ExampleMolecule[] = [
  { name: "Ethanol", smiles: "CCO", formula: "C₂H₆O" },
  { name: "Water", smiles: "O", formula: "H₂O" },
  { name: "Methane", smiles: "C", formula: "CH₄" },
  { name: "Benzene", smiles: "c1ccccc1", formula: "C₆H₆" },
  { name: "Acetic acid", smiles: "CC(=O)O", formula: "C₂H₄O₂" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O", formula: "C₉H₈O₄" },
  { name: "Caffeine", smiles: "Cn1c(=O)c2c(ncn2C)n(C)c1=O", formula: "C₈H₁₀N₄O₂" },
  { name: "Alanine", smiles: "CC(N)C(=O)O", formula: "C₃H₇NO₂" },
  { name: "Glucose", smiles: "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", formula: "C₆H₁₂O₆" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O", formula: "C₁₃H₁₈O₂" },
];

export function SmilesInput({ onFilesChange }: SmilesInputProps) {
  const [smiles, setSmiles] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = useCallback(async () => {
    const trimmed = smiles.trim();
    if (!trimmed) {
      setError("Please enter a SMILES string");
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const response = await fetch("/api/smiles-to-xyz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || `Conversion failed (HTTP ${response.status})`
        );
      }

      const data = await response.json();
      if (data.error || data.status === "error") {
        throw new Error(data.error || data.message || "Conversion failed");
      }

      const filename = `smiles_${sanitizeFilename(data.smiles_canonical || trimmed)}.xyz`;
      const file = new File([data.xyz], filename, { type: "text/plain" });
      onFilesChange([file]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMILES conversion failed");
    } finally {
      setIsConverting(false);
    }
  }, [smiles, onFilesChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isConverting && smiles.trim()) {
      handleConvert();
    }
  };

  const handleExampleClick = (example: ExampleMolecule) => {
    setSmiles(example.smiles);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* SMILES text input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FlaskConical className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-accent-primary)]/50" />
          <input
            type="text"
            value={smiles}
            onChange={(e) => {
              setSmiles(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Enter SMILES (e.g., CCO for ethanol)"
            disabled={isConverting}
            className="w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] py-2.5 pl-9 pr-3 font-mono text-sm text-[var(--color-text-primary)] placeholder:text-zinc-600 transition-colors focus:border-[var(--color-accent-primary)] focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleConvert}
          disabled={isConverting || !smiles.trim()}
          className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 px-4 py-2.5 font-mono text-xs font-bold text-[var(--color-accent-primary)] transition-all hover:bg-[var(--color-accent-primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--color-accent-primary)]/10 disabled:hover:text-[var(--color-accent-primary)]"
        >
          {isConverting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Convert to 3D
            </>
          )}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-error)]" />
          <p className="font-mono text-xs text-[var(--color-error)]/90">{error}</p>
        </div>
      )}

      {/* Example molecules */}
      <div>
        <p className="mb-2 font-mono text-xs text-zinc-500">
          Common molecules — click to use:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((mol) => (
            <button
              key={mol.smiles}
              onClick={() => handleExampleClick(mol)}
              disabled={isConverting}
              title={`SMILES: ${mol.smiles}`}
              className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-2 py-1 font-mono text-xs text-zinc-400 transition-colors hover:border-[var(--color-accent-primary)]/50 hover:text-[var(--color-accent-primary)] disabled:opacity-50"
            >
              <span>{mol.name}</span>
              <span className="ml-1 text-zinc-600">{mol.formula}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9_\-()[\]=#+.@]/g, "_")
    .slice(0, 60);
}
