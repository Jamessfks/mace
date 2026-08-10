/**
 * /r/[id] — MACE Link shared result page.
 *
 * Permanent, read-only view of a MACE calculation. Anyone with the URL sees the
 * full result (3D viewer, metrics, provenance, charts, export) — no login.
 *
 * The embeddable form of the same result lives at `/r/[id]/embed`.
 *
 * `loadResult` is wrapped in React's `cache` so `generateMetadata` and the page
 * body share one database read per request instead of two.
 */

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { loadResult } from "@/lib/share";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { SharedResultView } from "./shared-result-view";
import { summarizeShared } from "./result-context";

const getShared = cache(loadResult);

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Link preview text, built from the stored payload only.
 *
 * A shared link is often read as a preview card before it is read as a page, so
 * the same facts the page leads with — calculation, structure, model, reference
 * convention — go here. Nothing is defaulted: a result stored without a model
 * gets a shorter description, not a guessed one.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const shared = await getShared(id);

  if (!shared) {
    return {
      title: "Result not found",
      robots: { index: false, follow: false },
    };
  }

  const summary = summarizeShared(shared);
  const description = [
    summary.headline,
    summary.atomCount != null ? `${summary.atomCount} atoms` : null,
    summary.energy ? `total energy ${summary.energy}` : null,
    summary.model,
    summary.convention,
    summary.computedUtc ? `computed ${summary.computedUtc}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: summary.headline,
    description,
    openGraph: { title: `${summary.headline} · SimpleAtom`, description },
  };
}

export default async function SharedResultPage({ params }: Props) {
  const { id } = await params;
  const shared = await getShared(id);

  if (!shared) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-6 py-20">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Result not found
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              The shared result{" "}
              <code className="font-mono text-[var(--color-accent-strong)]">
                {id}
              </code>{" "}
              doesn&rsquo;t exist or has been removed.
            </p>
            <Button asChild className="mt-2">
              <Link href="/calculate">Run a new calculation</Link>
            </Button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return <SharedResultView shared={shared} />;
}
