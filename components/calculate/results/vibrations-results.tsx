"use client";

/**
 * VibrationsResults — composes the frequency table, mode animation, IR stick
 * spectrum and thermochemistry table into the "Vibrations" tab.
 *
 * Rendered only when `result.vibrations` exists (guarded by the caller,
 * metrics-dashboard.tsx). Mode animation is skipped, with an explanatory
 * note, if `result.positions`/`result.symbols` are missing — it should never
 * half-render a 3D view with no geometry to place atoms at.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FrequencyTable } from "./frequency-table";
import { IrStickSpectrum } from "./ir-stick-spectrum";
import { ThermochemistryTable } from "./thermochemistry-table";
import { ModeAnimationViewer } from "./mode-animation-viewer";
import type { ExtendedCalculationResult } from "@/types/mace-results-ext";

interface VibrationsResultsProps {
  result: ExtendedCalculationResult;
}

export function VibrationsResults({ result }: VibrationsResultsProps) {
  const vibrations = result.vibrations;
  const [selectedModeIndex, setSelectedModeIndex] = useState(0);

  if (!vibrations) return null;

  const canAnimate =
    !!result.positions?.length &&
    !!result.symbols?.length &&
    vibrations.modes.length > 0;
  const selectedMode = canAnimate ? vibrations.modes[selectedModeIndex] : undefined;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-base font-semibold">
            Vibrational frequencies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FrequencyTable
            vibrations={vibrations}
            selectedModeIndex={canAnimate ? selectedModeIndex : undefined}
            onSelectMode={canAnimate ? setSelectedModeIndex : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-base font-semibold">
            Normal-mode animation
          </CardTitle>
          {selectedMode && (
            <CardDescription>
              Mode {selectedModeIndex + 1} of {vibrations.modes.length} —{" "}
              {selectedMode.imaginary ? "imaginary, " : ""}
              {Math.abs(selectedMode.frequencyCm1).toFixed(1)} cm⁻¹
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {canAnimate && selectedMode ? (
            <ModeAnimationViewer
              symbols={result.symbols!}
              equilibriumPositions={result.positions!}
              mode={selectedMode}
              animation={vibrations.animation}
            />
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">
              No relaxed geometry was returned with this result, so the mode
              cannot be animated.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-base font-semibold">
            IR stick spectrum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IrStickSpectrum vibrations={vibrations} />
        </CardContent>
      </Card>

      {result.thermochemistry && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base font-semibold">
              Thermochemistry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ThermochemistryTable thermochemistry={result.thermochemistry} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
