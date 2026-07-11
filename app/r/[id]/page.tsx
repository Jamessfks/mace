/**
 * /r/[id] — MACE Link shared result page.
 *
 * Permanent, read-only view of a MACE calculation. Anyone with the URL
 * sees the full result (3D viewer, metrics, charts, export) — no login required.
 */

import Link from "next/link";
import { loadResult } from "@/lib/share";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { SharedResultView } from "./shared-result-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SharedResultPage({ params }: Props) {
  const { id } = await params;
  const shared = await loadResult(id);

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
