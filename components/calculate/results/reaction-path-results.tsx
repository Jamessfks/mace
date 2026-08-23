"use client";

/**
 * ReactionPathResults — composes the energy profile chart with
 * coordinate-scan-specific details (coordinate kind, atom indices,
 * constraint/convergence info) into the "Reaction Path" tab.
 *
 * Rendered whenever `result.profile` exists — the profile shape
 * (x/y/xLabel/xUnit/yLabel/yUnit) is generic by design (see
 * types/mace-results-ext.ts) and the task brief describes it as shared
 * across coordinate-scan, NEB and IRC. The `scan` block, by contrast, is
 * coordinate-scan-specific (verified only against
 * docs/schemas/sample-scan-ethane.json) and is rendered only when present —
 * a NEB or IRC result with no `scan` block still gets the profile chart, but
 * none of coordinate-scan's invented-looking extra fields.
 */

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EnergyProfileChart } from "./energy-profile-chart";
import type { ExtendedCalculationResult } from "@/types/mace-results-ext";

const COORDINATE_LABEL: Record<string, string> = {
  bond: "Bond length",
  angle: "Angle",
  dihedral: "Dihedral",
};

interface ReactionPathResultsProps {
  result: ExtendedCalculationResult;
}

export function ReactionPathResults({ result }: ReactionPathResultsProps) {
  const profile = result.profile;
  const scan = result.scan;
  if (!profile) return null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-base font-semibold">
            Energy profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EnergyProfileChart profile={profile} scan={scan} />
        </CardContent>
      </Card>

      {scan && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base font-semibold">
              Scan details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {COORDINATE_LABEL[scan.coordinate] ?? scan.coordinate}
              </Badge>
              <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                atoms [{scan.indices.join(", ")}] (0-based)
              </span>
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {scan.pointsCompleted} of {scan.pointsRequested} points
              </span>
            </div>

            <div
              className={`flex items-start gap-2 rounded border p-2.5 text-xs leading-relaxed ${
                scan.constraintHeld
                  ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]"
                  : "border-[var(--color-error)]/40 bg-[var(--color-error)]/10 text-[var(--color-error)]"
              }`}
            >
              {scan.constraintHeld ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                Constraint {scan.constraintHeld ? "held" : "drifted"} within{" "}
                {scan.deviationTolerance} {scan.unit} tolerance
                {scan.worstDeviationIndex != null && (
                  <>
                    {" "}
                    (worst deviation at point {scan.worstDeviationIndex},{" "}
                    {scan.deviations[scan.worstDeviationIndex]?.toExponential(2)} {scan.unit})
                  </>
                )}
                .
              </span>
            </div>

            {scan.stoppedEarly && (
              <div className="flex items-start gap-2 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5 text-xs leading-relaxed text-[var(--color-warning)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Scan stopped early
                  {scan.stopReason ? `: ${scan.stopReason}` : "."}
                </span>
              </div>
            )}

            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              {scan.pointConverged.filter(Boolean).length} of {scan.pointConverged.length}{" "}
              points converged to the force threshold
              {scan.sequential &&
                " · each point started from the previous point's relaxed geometry (sequential scan)"}
            </p>
            {scan.hysteresisNote && (
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {scan.hysteresisNote}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
