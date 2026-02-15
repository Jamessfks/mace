"use client";

/**
 * ShareToCommunity — Opt-in button for sharing a MACE calculation result
 * to the community database.
 *
 * Displays a compact card with:
 *   1. "Share to Community" button (opt-in, not automatic)
 *   2. Optional contributor name + institution fields
 *   3. Success / error feedback
 *
 * This component extracts the relevant fields from a CalculationResult
 * and POSTs them to /api/community/share.
 *
 * SCOPE: General Calculator (/calculate) only for now.
 * Semiconductor page integration is planned for a future release.
 */

import { useState, useCallback } from "react";
import { Share2, CheckCircle2, AlertCircle, Loader2, Users } from "lucide-react";
import type { CalculationResult } from "@/types/mace";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShareToCommunityProps {
  /** The completed MACE calculation result to share */
  result: CalculationResult;
  /** Original uploaded filename (for metadata) */
  filename?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareToCommunity({ result, filename }: ShareToCommunityProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contributor, setContributor] = useState("");
  const [institution, setInstitution] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Compute derived values from the result ────────────────────────────

  const atomCount = result.symbols?.length ?? 0;

  const energyPerAtom =
    result.energy != null && atomCount > 0
      ? result.energy / atomCount
      : null;

  const rmsForce =
    result.forces && result.forces.length > 0
      ? Math.sqrt(
          result.forces.flat().reduce((s, f) => s + f * f, 0) /
            result.forces.length
        )
      : null;

  let maxForce: number | null = null;
  if (result.forces && result.forces.length > 0) {
    maxForce = 0;
    for (const f of result.forces) {
      const mag = Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2);
      if (mag > maxForce) maxForce = mag;
    }
  }

  // ── Build formula from symbols ────────────────────────────────────────

  const formula = buildFormula(result.symbols ?? []);
  const elements = [...new Set(result.symbols ?? [])].sort();

  // ── Detect file format from filename ──────────────────────────────────

  const fileFormat = detectFormat(filename ?? "structure.xyz");

  // ── Submit handler ────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");

    try {
      const payload = {
        // Structure metadata
        formula,
        elements,
        atom_count: atomCount,
        filename: filename ?? "unknown",
        file_format: fileFormat,

        // Calculation parameters
        model_type: result.params?.modelType ?? "MACE-MP-0",
        model_size: result.params?.modelSize ?? "small",
        calc_type: result.params?.calculationType ?? "single-point",
        dispersion: result.params?.dispersion ?? false,

        // Computed results
        energy_ev: result.energy ?? null,
        energy_per_atom_ev: energyPerAtom,
        rms_force_ev_a: rmsForce,
        max_force_ev_a: maxForce,
        volume_a3: result.properties?.volume ?? null,
        calc_time_s: result.timeTaken ?? null,

        // MD-specific
        md_steps: result.params?.mdSteps ?? null,
        md_ensemble: result.params?.mdEnsemble ?? null,
        md_temperature_k: result.params?.temperature ?? null,

        // Contributor metadata
        contributor: contributor.trim() || "Anonymous",
        institution: institution.trim() || null,
        notes: notes.trim() || null,
      };

      const res = await fetch("/api/community/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Share failed" }));
        throw new Error(data.error || "Share failed");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Share failed");
    }
  }, [
    formula, elements, atomCount, filename, fileFormat,
    result, energyPerAtom, rmsForce, maxForce,
    contributor, institution, notes,
  ]);

  // ── Already shared ────────────────────────────────────────────────────

  if (status === "success") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="font-mono text-xs text-emerald-400">
          Shared to community database — thank you!
        </span>
      </div>
    );
  }

  // ── Collapsed state — just the button ─────────────────────────────────

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 font-mono text-xs text-zinc-300 transition-all hover:border-matrix-green/50 hover:bg-matrix-green/5 hover:text-matrix-green"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share to Community Database
      </button>
    );
  }

  // ── Expanded state — form + submit ────────────────────────────────────

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-zinc-900/80 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-matrix-green" />
        <h3 className="font-mono text-xs font-bold text-matrix-green">
          SHARE TO COMMUNITY
        </h3>
      </div>

      <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
        Contribute this calculation to the open community database.
        Your data helps improve MACE models and benefits the research community.
        All shared data is public and openly accessible.
      </p>

      {/* Preview of what will be shared */}
      <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 space-y-1">
        <p className="font-mono text-[10px] text-zinc-400">
          <span className="text-zinc-600">Formula:</span> {formula}
          &nbsp;·&nbsp;
          <span className="text-zinc-600">Atoms:</span> {atomCount}
          &nbsp;·&nbsp;
          <span className="text-zinc-600">Type:</span> {result.params?.calculationType ?? "single-point"}
        </p>
        <p className="font-mono text-[10px] text-zinc-400">
          <span className="text-zinc-600">Energy:</span>{" "}
          {result.energy != null ? `${result.energy.toFixed(6)} eV` : "N/A"}
          &nbsp;·&nbsp;
          <span className="text-zinc-600">Model:</span>{" "}
          {result.params?.modelType ?? "MACE-MP-0"} ({result.params?.modelSize ?? "small"})
        </p>
      </div>

      {/* Optional contributor fields */}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Your name (optional)"
          value={contributor}
          onChange={(e) => setContributor(e.target.value)}
          maxLength={100}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-matrix-green/50 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Institution (optional)"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          maxLength={200}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-matrix-green/50 focus:outline-none"
        />
      </div>

      <textarea
        placeholder="Notes (optional) — e.g. 'ethanol geometry optimization test'"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={1000}
        rows={2}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-matrix-green/50 focus:outline-none resize-none"
      />

      {/* Error display */}
      {status === "error" && (
        <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/5 p-2">
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="font-mono text-[10px] text-red-400">{errorMsg}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleShare}
          disabled={status === "loading"}
          className="flex items-center gap-2 rounded-md border border-matrix-green/50 bg-matrix-green/10 px-4 py-2 font-mono text-xs font-bold text-matrix-green transition-all hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          {status === "loading" ? "Sharing…" : "Share Result"}
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-md border border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chemical formula string from an array of element symbols.
 * e.g. ["C", "C", "H", "H", "H", "H", "O", "H"] → "C2H5O"
 */
function buildFormula(symbols: string[]): string {
  const counts: Record<string, number> = {};
  for (const s of symbols) {
    counts[s] = (counts[s] || 0) + 1;
  }
  // Hill system: C first, H second, then alphabetical
  const keys = Object.keys(counts).sort((a, b) => {
    if (a === "C") return -1;
    if (b === "C") return 1;
    if (a === "H") return -1;
    if (b === "H") return 1;
    return a.localeCompare(b);
  });
  return keys.map((k) => (counts[k] > 1 ? `${k}${counts[k]}` : k)).join("");
}

/** Detect file format from extension. */
function detectFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "cif") return "cif";
  if (["poscar", "vasp", "contcar"].includes(ext)) return "poscar";
  if (ext === "pdb") return "pdb";
  return "xyz";
}
