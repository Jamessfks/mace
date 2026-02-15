"use client";

/**
 * ConfidenceIndicator — Traffic-light gauge for MACE-MP-0 prediction reliability.
 *
 * Heuristic based on: elements, element count, structure type.
 * Well-represented elemental and binary bulks in MP training set → HIGH.
 * Surfaces, defects, ternaries → MEDIUM.
 * Complex interfaces, amorphous, under-represented elements → LOW/UNCERTAIN.
 */

import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield } from "lucide-react";
import type { ConfidenceLevel } from "@/types/semiconductor";

// ---------------------------------------------------------------------------
// Well-represented elements in MPTrj training set (common ones)
// ---------------------------------------------------------------------------

const MP_CORE_ELEMENTS = new Set([
  "H", "Li", "Be", "B", "C", "N", "O", "F", "Na", "Mg", "Al", "Si", "P",
  "S", "Cl", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni",
  "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Rb", "Sr", "Y", "Zr", "Nb",
  "Mo", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Cs",
  "Ba", "La", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Pb", "Bi",
]);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConfidenceIndicatorProps {
  /** Unique elements in the structure */
  elements: string[];
  /** Optional tag for structure type */
  structureType?: "bulk" | "surface" | "defect" | "interface";
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

function assessConfidence(
  elements: string[],
  structureType?: string
): { level: ConfidenceLevel; reason: string } {
  // Check if all elements are in MP core set
  const allKnown = elements.every((el) => MP_CORE_ELEMENTS.has(el));
  const nElements = elements.length;

  if (!allKnown) {
    return {
      level: "uncertain",
      reason: `Contains element(s) not well-represented in MPTrj: ${elements
        .filter((el) => !MP_CORE_ELEMENTS.has(el))
        .join(", ")}`,
    };
  }

  if (structureType === "interface") {
    return {
      level: "low",
      reason: "Complex interfaces are far from the bulk training data.",
    };
  }

  if (structureType === "surface" || structureType === "defect") {
    return {
      level: "medium",
      reason:
        "Surfaces and defects are partially covered; predictions are usually reasonable but less reliable than bulk.",
    };
  }

  if (nElements <= 2) {
    return {
      level: "high",
      reason:
        "Elemental or binary bulk — well-represented in the Materials Project training set.",
    };
  }

  if (nElements <= 3) {
    return {
      level: "medium",
      reason: "Ternary compound — moderate coverage in training data.",
    };
  }

  return {
    level: "low",
    reason: "Complex multi-element system — limited training coverage.",
  };
}

// ---------------------------------------------------------------------------
// Styles per confidence level
// ---------------------------------------------------------------------------

const LEVEL_CONFIG: Record<
  ConfidenceLevel,
  {
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
    border: string;
    barWidth: string;
  }
> = {
  high: {
    icon: <ShieldCheck className="h-4 w-4" />,
    label: "HIGH CONFIDENCE",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    barWidth: "w-full",
  },
  medium: {
    icon: <ShieldAlert className="h-4 w-4" />,
    label: "MEDIUM CONFIDENCE",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    barWidth: "w-2/3",
  },
  low: {
    icon: <Shield className="h-4 w-4" />,
    label: "LOW CONFIDENCE",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    barWidth: "w-1/3",
  },
  uncertain: {
    icon: <ShieldQuestion className="h-4 w-4" />,
    label: "UNCERTAIN",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    barWidth: "w-1/6",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfidenceIndicator({
  elements,
  structureType,
}: ConfidenceIndicatorProps) {
  const { level, reason } = assessConfidence(elements, structureType);
  const config = LEVEL_CONFIG[level];

  return (
    <div
      className={`rounded-lg border ${config.border} ${config.bg} p-4`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={config.color}>{config.icon}</span>
        <span className={`font-mono text-xs font-bold ${config.color}`}>
          {config.label}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${config.barWidth} ${
            level === "high"
              ? "bg-emerald-500"
              : level === "medium"
                ? "bg-amber-500"
                : level === "low"
                  ? "bg-orange-500"
                  : "bg-red-500"
          }`}
        />
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-zinc-400">
        {reason}
      </p>

      <a
        href="https://mace-docs.readthedocs.io/en/latest/guide/foundation_models.html"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block font-mono text-[10px] text-matrix-green hover:underline"
      >
        Learn about MACE foundation models →
      </a>
    </div>
  );
}
