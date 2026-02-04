import Link from "next/link";

/**
 * MACE in Practice I — Organic solvent molecules (DEC/EC, H/C/O)
 * Full-page view of the tutorial notebook as HTML
 */
export default function Tutorial1Page() {
  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-50">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="font-mono text-sm text-zinc-600 transition-colors hover:text-emerald-600"
          >
            ← Back to MACE Project
          </Link>
          <Link
            href="/tutorial1/run"
            className="rounded bg-emerald-600 px-3 py-1.5 font-mono text-sm text-white transition-colors hover:bg-emerald-700"
          >
            Run Tutorial 1
          </Link>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          MACE in Practice I • Solvent (DEC/EC) • Team 3
        </span>
      </header>

      <iframe
        src="/tutorial1_report.html"
        title="MACE in Practice I — Fitting and testing a MACE potential (organic solvents)"
        className="min-h-0 flex-1 w-full border-0"
      />
    </div>
  );
}
