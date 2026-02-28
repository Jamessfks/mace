/**
 * SharedResultView — client component that renders a read-only MACE Link result.
 *
 * Reuses the existing MetricsDashboard for the full scientific dashboard,
 * and adds a header bar (model info, copy link) + citation block.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, ExternalLink, Beaker } from "lucide-react";
import { MetricsDashboard } from "@/components/calculate/metrics-dashboard";
import { Badge } from "@/components/ui/badge";
import type { SharedResult, CalculationParams } from "@/types/mace";

interface Props {
  shared: SharedResult;
}

export function SharedResultView({ shared }: Props) {
  const { id, result, params, filename, created_at } = shared;
  const [copied, setCopied] = useState<"link" | "cite" | null>(null);

  const url = `https://mace-lake.vercel.app/r/${id}`;
  const p = params as Partial<CalculationParams> & { _sketchMeta?: { smiles: string; formula: string; mw: number; numAtoms: number; svgHtml: string } };
  const sketch = p._sketchMeta ?? null;
  const date = new Date(created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  const citation =
    `MACE-${p.modelType ?? "MP-0"} (${p.modelSize ?? "medium"}) calculation via MACE Force Fields Web Interface.\n` +
    `Result: ${url}\n` +
    `Accessed: ${today}`;

  function copyText(text: string, key: "link" | "cite") {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="relative min-h-screen bg-[var(--color-bg-primary)]">
      <div className="ambient-glow pointer-events-none fixed inset-0 z-0" />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent-primary)]"
            >
              &larr; Home
            </Link>
            <div className="h-4 w-px bg-[var(--color-border-subtle)]" />
            <h1 className="font-sans text-lg font-bold text-white">
              MACE <span className="text-[var(--color-accent-primary)]">Link</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => copyText(url, "link")}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)] hover:text-white"
            >
              {copied === "link" ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "link" ? "Copied!" : "Copy Link"}
            </button>
            <Link
              href="/calculate"
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent-primary)]/10 px-3 py-1.5 font-mono text-xs text-[var(--color-accent-primary)] transition-colors hover:bg-[var(--color-accent-primary)] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              New Calculation
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-screen-2xl p-6 space-y-6">
        {/* Meta bar */}
        <div className="flex flex-wrap items-center gap-3">
          {filename && (
            <Badge variant="outline" className="border-[var(--color-border-emphasis)] text-[var(--color-text-secondary)] font-mono text-xs">
              {filename}
            </Badge>
          )}
          <Badge variant="outline" className="border-[var(--color-accent-primary)]/40 text-[var(--color-accent-primary)] font-mono text-xs">
            {p.modelType ?? "MACE-MP-0"} · {p.modelSize ?? "medium"}
          </Badge>
          {p.calculationType && (
            <Badge variant="outline" className="border-[var(--color-border-emphasis)] text-[var(--color-text-secondary)] font-mono text-xs">
              {p.calculationType}
            </Badge>
          )}
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            Shared {date}
          </span>
        </div>

        {/* Sketched molecule identity — shown when the shared result came from Draw Molecule */}
        {sketch && (
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4">
            <h2 className="mb-3 flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-widest text-[var(--color-accent-primary)]">
              <Beaker className="h-3.5 w-3.5" />
              Sketched Molecule
            </h2>
            <div className="flex items-start gap-4">
              {sketch.svgHtml && (
                <div className="shrink-0 rounded border border-[var(--color-border-subtle)] bg-white p-2">
                  <div
                    dangerouslySetInnerHTML={{ __html: sketch.svgHtml }}
                    className="[&>svg]:h-[80px] [&>svg]:w-[100px]"
                  />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="font-mono text-sm font-bold text-[var(--color-text-primary)]">
                  {sketch.formula}
                </p>
                <p className="break-all font-mono text-xs text-[var(--color-text-muted)]">
                  {sketch.smiles}
                </p>
                <div className="flex gap-3 font-mono text-xs text-[var(--color-text-secondary)]">
                  <span>MW {sketch.mw.toFixed(2)}</span>
                  <span>{sketch.numAtoms} atoms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results dashboard (reused as-is) */}
        <MetricsDashboard result={result} filename={filename} />

        {/* Citation block */}
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5 space-y-3">
          <h2 className="font-sans text-sm font-bold text-white">Cite This Result</h2>
          <pre className="overflow-x-auto rounded-md bg-[var(--color-bg-primary)] p-4 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {citation}
          </pre>
          <button
            onClick={() => copyText(citation, "cite")}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent-primary)] hover:text-white"
          >
            {copied === "cite" ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "cite" ? "Copied!" : "Copy Citation"}
          </button>
        </div>
      </main>
    </div>
  );
}
