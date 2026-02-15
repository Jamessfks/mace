"use client";

/**
 * StructureLibrary — Card grid of pre-built semiconductor structures.
 *
 * Responsive grid (2 cols mobile, 3 md, 4 lg) with search/filter.
 * Clicking "Load" converts the structure to a File and passes it up.
 */

import { useState, useMemo } from "react";
import { Search, Atom } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getAllMaterials,
  structureToFile,
} from "@/lib/semiconductor-structures";
import type { MaterialCategory, SemiconductorMaterial } from "@/types/semiconductor";

// ---------------------------------------------------------------------------
// Category badge styling
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<
  MaterialCategory,
  { bg: string; text: string; border: string; label: string }
> = {
  substrate: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    label: "Substrate",
  },
  dielectric: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/30",
    label: "Dielectric",
  },
  metal: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    label: "Metal",
  },
  "iii-v": {
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/30",
    label: "III-V",
  },
  nitride: {
    bg: "bg-teal-500/10",
    text: "text-teal-400",
    border: "border-teal-500/30",
    label: "Nitride",
  },
  "2d": {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/30",
    label: "2D",
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StructureLibraryProps {
  selectedId: string | null;
  onSelect: (file: File, material: SemiconductorMaterial) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StructureLibrary({
  selectedId,
  onSelect,
}: StructureLibraryProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | "all">(
    "all"
  );

  const materials = getAllMaterials();

  const categories: MaterialCategory[] = [
    "substrate",
    "dielectric",
    "metal",
    "iii-v",
    "nitride",
  ];

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const matchesCategory =
        categoryFilter === "all" || m.category === categoryFilter;
      const matchesSearch =
        search === "" ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.formula.toLowerCase().includes(search.toLowerCase()) ||
        m.application.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [materials, categoryFilter, search]);

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Atom className="h-4 w-4 text-matrix-green" />
        <h2 className="font-mono text-sm font-bold text-matrix-green">
          STRUCTURE LIBRARY
        </h2>
        <span className="font-mono text-xs text-zinc-600">
          ({materials.length} materials)
        </span>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search materials..."
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 font-mono text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-matrix-green/50 focus:outline-none"
        />
      </div>

      {/* Category filter pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors ${
            categoryFilter === "all"
              ? "bg-matrix-green/20 text-matrix-green border border-matrix-green/50"
              : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300"
          }`}
        >
          All
        </button>
        {categories.map((cat) => {
          const style = CATEGORY_STYLES[cat];
          return (
            <button
              key={cat}
              onClick={() =>
                setCategoryFilter(categoryFilter === cat ? "all" : cat)
              }
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors border ${
                categoryFilter === cat
                  ? `${style.bg} ${style.text} ${style.border}`
                  : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
              }`}
            >
              {style.label}
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((material) => {
          const style = CATEGORY_STYLES[material.category];
          const isSelected = selectedId === material.id;

          return (
            <div
              key={material.id}
              className={`group rounded-lg border bg-zinc-900/50 p-3.5 transition-all cursor-pointer hover:border-zinc-600 ${
                isSelected
                  ? "ring-2 ring-matrix-green border-matrix-green/50"
                  : "border-zinc-800"
              }`}
              onClick={() => onSelect(structureToFile(material), material)}
            >
              {/* Header */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-white truncate">
                    {material.name}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {material.formula}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 ${style.bg} ${style.text} ${style.border} text-[9px] px-1.5 py-0`}
                >
                  {style.label}
                </Badge>
              </div>

              {/* Application */}
              <p className="mb-2 font-mono text-[10px] leading-relaxed text-zinc-500 line-clamp-2">
                {material.application}
              </p>

              {/* Stats */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-600">
                  a = {material.latticeA} Å · {material.atomCount} atoms
                </span>
                {isSelected && (
                  <span className="font-mono text-[10px] text-matrix-green font-bold">
                    LOADED
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center font-mono text-xs text-zinc-600">
          No materials match your search.
        </p>
      )}
    </div>
  );
}
