"use client";

/**
 * FrequencyTable — vibrational mode list + the stationary-point verdict.
 *
 * Every field rendered here exists in docs/schemas/sample-vibrations-water.json
 * (vibrations.modes[], vibrations.stationaryPointType/Statement). No
 * "symmetry label" or "degeneracy" column is shown — the backend does not
 * compute point-group symmetry labels, and inventing one would be exactly
 * the kind of fabricated field CLAUDE.md's honesty rules forbid. Where two
 * frequencies are numerically close, that is visible from the numbers
 * themselves without a label claiming a symmetry assignment nobody computed.
 */

import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import type { VibrationsBlock, VibrationMode } from "@/types/mace-results-ext";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface FrequencyTableProps {
  vibrations: VibrationsBlock;
  /** Index into vibrations.modes (not the raw mode.index) currently animated, if any. */
  selectedModeIndex?: number;
  onSelectMode?: (index: number) => void;
}

function stationaryPointTone(type: string): {
  icon: React.ReactNode;
  className: string;
} {
  if (type === "minimum") {
    return {
      icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />,
      className:
        "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]",
    };
  }
  if (type === "transition-state") {
    return {
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />,
      className:
        "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
    };
  }
  return {
    icon: <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />,
    className:
      "border-[var(--color-error)]/40 bg-[var(--color-error)]/10 text-[var(--color-error)]",
  };
}

export function FrequencyTable({
  vibrations,
  selectedModeIndex,
  onSelectMode,
}: FrequencyTableProps) {
  const tone = stationaryPointTone(vibrations.stationaryPointType);

  return (
    <div className="space-y-4">
      {/* ── The single most useful thing on the page ── */}
      <div className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-sm leading-relaxed ${tone.className}`}>
        {tone.icon}
        <div>
          <p className="font-semibold">{vibrations.stationaryPointStatement}</p>
          <p className="mt-1 font-mono text-xs opacity-90">
            {vibrations.modeCountFormula} vibrational modes ·{" "}
            {vibrations.nImaginary} imaginary
            {vibrations.nImaginary > 0 &&
              ` (threshold ${vibrations.imaginaryThresholdCm1} cm⁻¹)`}{" "}
            · ZPE {vibrations.zeroPointEnergyEv.toFixed(4)} eV
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">#</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Frequency (cm⁻¹)</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Energy (eV)</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Reduced mass (amu)</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Force constant (eV/Å²)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vibrations.modes.map((mode: VibrationMode, i: number) => {
              const selected = selectedModeIndex === i;
              return (
                <TableRow
                  key={mode.index}
                  onClick={() => onSelectMode?.(i)}
                  className={
                    onSelectMode
                      ? `cursor-pointer ${selected ? "bg-[var(--color-accent-soft)]" : ""}`
                      : undefined
                  }
                >
                  <TableCell className="font-mono text-xs text-[var(--color-text-muted)]">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <span
                      className={
                        mode.imaginary
                          ? "font-bold text-[var(--color-error)]"
                          : "text-[var(--color-text-primary)]"
                      }
                    >
                      {mode.imaginary ? "−" : ""}
                      {Math.abs(mode.frequencyCm1).toFixed(1)}
                    </span>
                    {mode.imaginary && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-[var(--color-error)]/40 bg-[var(--color-error)]/10 text-[10px] text-[var(--color-error)]"
                      >
                        imaginary
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">
                    {mode.energyEv.toFixed(4)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">
                    {mode.reducedMassAmu.toFixed(3)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--color-text-secondary)]">
                    {mode.forceConstantEvPerAngstrom2.toFixed(3)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {onSelectMode && (
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Click a row to animate that normal mode below.
        </p>
      )}
      <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)]">
        {vibrations.nTranslationRotation} translation/rotation modes (near-zero
        frequency) were projected out and are not shown — they are not
        physical vibrations.
      </p>
    </div>
  );
}
