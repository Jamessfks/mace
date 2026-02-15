"use client";

/**
 * Community Calculation Database — Browsing Page
 *
 * Displays publicly shared MACE calculation results in a searchable,
 * filterable table. Users can browse what others have calculated,
 * compare results, and discover trends.
 *
 * Data is fetched from /api/community/list which queries Supabase.
 *
 * Layout follows the same design language as /calculate and /semiconductor:
 *   - Sticky header with nav links
 *   - Filter bar + results table
 *   - Responsive grid for stats cards
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Database,
  Search,
  Filter,
  RefreshCw,
  Zap,
  Users,
  FlaskConical,
  ArrowUpDown,
} from "lucide-react";
import type { CommunityCalculation } from "@/types/community";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CommunityPage() {
  // ── State ──
  const [calculations, setCalculations] = useState<CommunityCalculation[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [formulaFilter, setFormulaFilter] = useState("");
  const [calcTypeFilter, setCalcTypeFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Fetch data ──

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (formulaFilter) params.set("formula", formulaFilter);
      if (calcTypeFilter) params.set("calc_type", calcTypeFilter);
      if (modelFilter) params.set("model_type", modelFilter);
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      params.set("limit", "100");

      const res = await fetch(`/api/community/list?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const json = await res.json();
      setCalculations(json.data ?? []);
      setTotalCount(json.count ?? 0);
    } catch {
      setError("Could not load community data. The database may not be configured yet.");
    } finally {
      setIsLoading(false);
    }
  }, [formulaFilter, calcTypeFilter, modelFilter, sortBy, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Stats ──

  const uniqueFormulas = new Set(calculations.map((c) => c.formula)).size;
  const uniqueContributors = new Set(calculations.map((c) => c.contributor)).size;
  const uniqueInstitutions = new Set(
    calculations.filter((c) => c.institution).map((c) => c.institution)
  ).size;

  // ── Toggle sort ──

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  };

  return (
    <div className="relative min-h-screen bg-black">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-sm text-zinc-500 transition-colors hover:text-matrix-green"
            >
              ← Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="font-mono text-lg font-bold text-white">
              Community{" "}
              <span className="text-matrix-green">Database</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/calculate"
              className="font-mono text-xs text-zinc-600 transition-colors hover:text-matrix-green"
            >
              Calculator →
            </Link>
            <Link
              href="/semiconductor"
              className="font-mono text-xs text-zinc-600 transition-colors hover:text-matrix-green"
            >
              Semiconductor →
            </Link>
            <Database className="h-4 w-4 text-matrix-green" />
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 mx-auto max-w-screen-2xl p-6">
        {/* Hero */}
        <div className="mb-6 rounded-lg border border-matrix-green/20 bg-matrix-green/5 px-6 py-4">
          <p className="font-mono text-sm text-matrix-green">
            <strong>Community Calculation Database</strong> — Browse MACE
            calculations shared by researchers worldwide. Contribute your own
            results from the{" "}
            <Link href="/calculate" className="underline hover:text-white">
              Calculator
            </Link>{" "}
            to help improve the MACE ecosystem.
          </p>
        </div>

        {/* Stats cards */}
        <div className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-4">
          <StatCard
            label="Total Calculations"
            value={totalCount}
            icon={<Zap className="h-4 w-4 text-emerald-400" />}
          />
          <StatCard
            label="Unique Formulas"
            value={uniqueFormulas}
            icon={<FlaskConical className="h-4 w-4 text-purple-400" />}
          />
          <StatCard
            label="Contributors"
            value={uniqueContributors}
            icon={<Users className="h-4 w-4 text-blue-400" />}
          />
          <StatCard
            label="Institutions"
            value={uniqueInstitutions}
            icon={<Database className="h-4 w-4 text-amber-400" />}
          />
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Formula search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search formula (e.g. Si, C2H6O)..."
              value={formulaFilter}
              onChange={(e) => setFormulaFilter(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 pl-9 pr-3 py-2 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:border-matrix-green/50 focus:outline-none"
            />
          </div>

          {/* Calc type filter */}
          <select
            value={calcTypeFilter}
            onChange={(e) => setCalcTypeFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-matrix-green/50 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="single-point">Single-point</option>
            <option value="geometry-opt">Geometry Opt</option>
            <option value="molecular-dynamics">Molecular Dynamics</option>
          </select>

          {/* Model filter */}
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-matrix-green/50 focus:outline-none"
          >
            <option value="">All Models</option>
            <option value="MACE-MP-0">MACE-MP-0</option>
            <option value="MACE-OFF">MACE-OFF</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2 font-mono text-xs text-zinc-400 transition-colors hover:border-matrix-green/50 hover:text-matrix-green disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="font-mono text-xs text-amber-400">{error}</p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              If you&apos;re running locally, make sure to run the SQL schema in your Supabase
              project and set the env vars in .env.local.
            </p>
          </div>
        )}

        {/* Results table */}
        {!error && (
          <div className="overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full font-mono text-xs">
              <thead className="bg-zinc-900 text-zinc-500">
                <tr>
                  <SortHeader
                    label="Formula"
                    column="formula"
                    current={sortBy}
                    dir={sortDir}
                    onToggle={toggleSort}
                  />
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className="px-3 py-2.5 text-left">Model</th>
                  <SortHeader
                    label="Energy (eV)"
                    column="energy_ev"
                    current={sortBy}
                    dir={sortDir}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Atoms"
                    column="atom_count"
                    current={sortBy}
                    dir={sortDir}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <th className="px-3 py-2.5 text-right">RMS Force</th>
                  <th className="px-3 py-2.5 text-left">Contributor</th>
                  <SortHeader
                    label="Date"
                    column="created_at"
                    current={sortBy}
                    dir={sortDir}
                    onToggle={toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-zinc-600">
                      Loading community calculations...
                    </td>
                  </tr>
                ) : calculations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-zinc-600">
                      No calculations found. Be the first to contribute from the{" "}
                      <Link href="/calculate" className="text-matrix-green hover:underline">
                        Calculator
                      </Link>
                      !
                    </td>
                  </tr>
                ) : (
                  calculations.map((calc) => (
                    <tr
                      key={calc.id}
                      className="border-t border-zinc-800/60 transition-colors hover:bg-zinc-800/30"
                    >
                      <td className="px-3 py-2 font-bold">{calc.formula}</td>
                      <td className="px-3 py-2">
                        <TypeBadge type={calc.calc_type} />
                      </td>
                      <td className="px-3 py-2 text-zinc-500">{calc.model_type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {calc.energy_ev != null ? calc.energy_ev.toFixed(4) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {calc.atom_count}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {calc.rms_force_ev_a != null
                          ? calc.rms_force_ev_a.toFixed(4)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-zinc-400">{calc.contributor}</span>
                        {calc.institution && (
                          <span className="ml-1 text-zinc-600">
                            ({calc.institution})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {formatDate(calc.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer note */}
        {!error && calculations.length > 0 && (
          <p className="mt-3 font-mono text-[10px] text-zinc-600">
            Showing {calculations.length} of {totalCount} calculations ·
            Data contributed by the MACE community ·
            Currently recording from the General Calculator only
          </p>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <span className="font-mono text-[10px] text-zinc-500">{label}</span>
      </div>
      <p className="font-mono text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    "single-point": { label: "SP", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    "geometry-opt": { label: "OPT", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
    "molecular-dynamics": { label: "MD", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  };
  const c = config[type] ?? { label: type, color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${c.color}`}>
      {c.label}
    </span>
  );
}

function SortHeader({
  label,
  column,
  current,
  dir,
  onToggle,
  align = "left",
}: {
  label: string;
  column: string;
  current: string;
  dir: "asc" | "desc";
  onToggle: (col: string) => void;
  align?: "left" | "right";
}) {
  const isActive = current === column;
  return (
    <th
      className={`px-3 py-2.5 text-${align} cursor-pointer select-none transition-colors hover:text-matrix-green ${
        isActive ? "text-matrix-green" : ""
      }`}
      onClick={() => onToggle(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? "opacity-100" : "opacity-30"}`} />
        {isActive && (
          <span className="text-[8px]">{dir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
