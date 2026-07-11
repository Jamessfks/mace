/**
 * SharedResultView — read-only view of a shared calculation ("MACE Link").
 *
 * Reuses MetricsDashboard for the full scientific dashboard, on the warm
 * light theme, and adds a meta bar + citation block. The shareable/citation
 * URL is derived from the live origin (see lib/site).
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Plus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MetricsDashboard } from "@/components/calculate/metrics-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSiteUrl } from "@/lib/site";
import type { SharedResult, CalculationParams } from "@/types/mace";

interface Props {
  shared: SharedResult;
}

export function SharedResultView({ shared }: Props) {
  const { id, result, params, filename, created_at } = shared;
  const [copied, setCopied] = useState<"link" | "cite" | null>(null);

  const url = `${getSiteUrl()}/r/${id}`;
  const p = params as Partial<CalculationParams>;
  const date = new Date(created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const citation =
    `${p.modelType ?? "MACE-MP-0"} (${p.modelSize ?? "medium"}) calculation via SimpleAtom — a web interface to MACE.\n` +
    `Result: ${url}\n` +
    `Accessed: ${today}`;

  function copyText(text: string, key: "link" | "cite") {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-screen-2xl space-y-6 px-6 py-6">
        {/* Title + actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Shared result
            </h1>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
              A read-only snapshot of a MACE calculation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyText(url, "link")}
            >
              {copied === "link" ? (
                <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === "link" ? "Copied!" : "Copy link"}
            </Button>
            <Button asChild size="sm">
              <Link href="/calculate">
                <Plus className="h-3.5 w-3.5" />
                New calculation
              </Link>
            </Button>
          </div>
        </div>

        {/* Meta bar */}
        <div className="flex flex-wrap items-center gap-2">
          {filename && (
            <Badge variant="secondary" className="font-mono">
              {filename}
            </Badge>
          )}
          <Badge className="bg-[var(--color-accent-soft)] font-mono text-[var(--color-accent-strong)]">
            {p.modelType ?? "MACE-MP-0"} · {p.modelSize ?? "medium"}
          </Badge>
          {p.calculationType && (
            <Badge variant="secondary" className="font-mono">
              {p.calculationType}
            </Badge>
          )}
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            Shared {date}
          </span>
        </div>

        {/* Results dashboard (reused) */}
        <MetricsDashboard result={result} filename={filename} />

        {/* Citation */}
        <div className="space-y-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-5">
          <h2 className="font-serif text-lg font-semibold text-[var(--color-text-primary)]">
            Cite this result
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-[var(--color-bg-secondary)] p-4 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {citation}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyText(citation, "cite")}
          >
            {copied === "cite" ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied === "cite" ? "Copied!" : "Copy citation"}
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
