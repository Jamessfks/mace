"use client";

/**
 * ThermochemistryTable — ideal-gas ZPE/U/H/S/G at the stated T and P.
 *
 * Every field rendered here exists in
 * docs/schemas/sample-vibrations-water.json's `thermochemistry` block.
 * Values are shown in eV (the MACE/ASE native unit per CLAUDE.md) with a
 * kcal/mol readout alongside G, using the exact `unitConversions` factor the
 * backend reports rather than a hardcoded constant re-derived in the UI.
 */

import { Info } from "lucide-react";
import type { ThermochemistryBlock } from "@/types/mace-results-ext";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

interface ThermochemistryTableProps {
  thermochemistry: ThermochemistryBlock;
}

export function ThermochemistryTable({ thermochemistry: t }: ThermochemistryTableProps) {
  const kcal = t.unitConversions.evToKcalPerMol;

  const rows: { label: string; value: string; sub?: string }[] = [
    { label: "Zero-point energy (ZPE)", value: `${t.zeroPointEnergyEv.toFixed(4)} eV` },
    { label: "Internal energy (U)", value: `${t.internalEnergyEv.toFixed(4)} eV` },
    { label: "Enthalpy (H)", value: `${t.enthalpyEv.toFixed(4)} eV` },
    {
      label: "Entropy (S)",
      value: `${t.entropyEvPerK.toExponential(4)} eV/K`,
      sub: `${t.entropyJPerMolPerK.toFixed(2)} J/(mol·K)`,
    },
    {
      label: "Gibbs free energy (G)",
      value: `${t.gibbsEnergyEv.toFixed(4)} eV`,
      sub: `${(t.gibbsEnergyEv * kcal).toFixed(2)} kcal/mol`,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text-secondary)]">
        Ideal-gas thermochemistry at{" "}
        <strong className="text-[var(--color-text-primary)]">{t.temperatureK} K</strong> /{" "}
        <strong className="text-[var(--color-text-primary)]">{t.pressurePa.toLocaleString()} Pa</strong>
        {t.pressureNote && (
          <span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t.pressureNote}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
        <Table>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium text-[var(--color-text-secondary)]">
                  {row.label}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-[var(--color-text-primary)]">
                  {row.value}
                  {row.sub && (
                    <span className="ml-2 text-[var(--color-text-muted)]">({row.sub})</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Symmetry number — detected vs. overridden, and its effect on entropy */}
      <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-primary)]" />
        <div>
          <p>
            Rotational symmetry number{" "}
            <strong className="font-mono text-[var(--color-text-primary)]">
              σ = {t.symmetry.symmetryNumber}
            </strong>{" "}
            (
            {t.symmetry.source === "detected"
              ? "auto-detected from the relaxed geometry"
              : "user override"}
            {t.symmetry.rotationalSubgroup ? `, ${t.symmetry.rotationalSubgroup}` : ""}
            )
          </p>
          {t.symmetry.effectOnEntropy && (
            <p className="mt-1 text-[var(--color-text-muted)]">{t.symmetry.effectOnEntropy}</p>
          )}
        </div>
      </div>
    </div>
  );
}
