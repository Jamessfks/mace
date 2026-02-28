/**
 * /r/[id] — MACE Link shared result page.
 *
 * Permanent, read-only view of a MACE calculation. Anyone with the URL
 * sees the full result (3D viewer, metrics, charts, export) — no login required.
 */

import { loadResult } from "@/lib/share";
import Link from "next/link";
import { SharedResultView } from "./shared-result-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SharedResultPage({ params }: Props) {
  const { id } = await params;
  const shared = await loadResult(id);

  if (!shared) {
    return (
      <div className="relative flex min-h-screen items-center justify-center scientific-bg">
        <div className="ambient-glow pointer-events-none fixed inset-0 z-0" />
        <div className="relative z-10 text-center space-y-4">
          <h1 className="font-sans text-2xl font-bold text-white">
            Result not found
          </h1>
          <p className="font-mono text-sm text-[var(--color-text-muted)]">
            The shared result <code className="text-[var(--color-accent-primary)]">{id}</code> does not exist or has been removed.
          </p>
          <Link
            href="/calculate"
            className="inline-block mt-4 rounded-md bg-[var(--color-accent-primary)] px-6 py-2 font-sans text-sm font-bold text-white hover:bg-[var(--color-accent-primary)]/90 transition-colors"
          >
            Run a New Calculation
          </Link>
        </div>
      </div>
    );
  }

  return <SharedResultView shared={shared} />;
}
