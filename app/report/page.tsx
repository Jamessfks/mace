import Link from "next/link";

/**
 * MACE Liquid Water Report - displays in its original layout
 * Full-page view of water_results_report.html with training curves,
 * validation metrics, and 3D visualizations
 */
export default function ReportPage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-50">
      {/* Minimal header with back link */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <Link
          href="/"
          className="font-mono text-sm text-zinc-600 transition-colors hover:text-emerald-600"
        >
          ← Back to MACE Project
        </Link>
        <span className="font-mono text-xs text-zinc-400">
          Liquid Water Results • Team 3
        </span>
      </header>

      {/* Report in original layout - full viewport iframe */}
      <iframe
        src="/water_results_report.html"
        title="MACE Liquid Water — Results & Visualizations"
        className="min-h-0 flex-1 w-full border-0"
      />
    </div>
  );
}
