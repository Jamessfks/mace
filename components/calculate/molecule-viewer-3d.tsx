"use client";

import { useEffect, useRef } from "react";
import type { CalculationResult } from "@/types/mace";

interface MoleculeViewer3DProps {
  result: CalculationResult;
}

/**
 * 3D Molecular Viewer using 3Dmol.js
 * Renders atomic structure with CPK coloring and force vectors
 */
export function MoleculeViewer3D({ result }: MoleculeViewer3DProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);

  useEffect(() => {
    if (!viewerRef.current || !result.positions || !result.symbols) return;

    // Dynamically import 3Dmol to avoid SSR issues
    import("3dmol").then(($3Dmol) => {
      if (!viewerRef.current || !result.symbols || !result.positions) return;

      // Clear previous viewer
      viewerRef.current.innerHTML = "";

      // Create viewer
      const config = { backgroundColor: "black" };
      viewerInstance.current = $3Dmol.createViewer(viewerRef.current, config);
      const viewer = viewerInstance.current;

      // Build XYZ format string from result
      const atomCount = result.symbols.length;
      let xyzData = `${atomCount}\n`;
      xyzData += `Energy: ${result.energy} eV\n`;

      result.symbols.forEach((symbol, i) => {
        const pos = result.positions![i];
        xyzData += `${symbol} ${pos[0].toFixed(6)} ${pos[1].toFixed(6)} ${pos[2].toFixed(6)}\n`;
      });

      // Add structure
      viewer.addModel(xyzData, "xyz");

      // Style: ball-and-stick with CPK coloring
      viewer.setStyle({}, { stick: {}, sphere: { scale: 0.3 } });

      // Add force vectors if available
      if (result.forces) {
        result.forces.forEach((force, i) => {
          const pos = result.positions![i];
          const scale = 5; // Scale factor for visibility
          viewer.addArrow({
            start: { x: pos[0], y: pos[1], z: pos[2] },
            end: {
              x: pos[0] + force[0] * scale,
              y: pos[1] + force[1] * scale,
              z: pos[2] + force[2] * scale,
            },
            radius: 0.1,
            color: "#00ff41",
          });
        });
      }

      viewer.zoomTo();
      viewer.render();

      // Enable mouse controls
      viewer.enableFog(false);
    });

    return () => {
      viewerInstance.current?.clear();
    };
  }, [result]);

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-matrix-green">
          3D STRUCTURE VIEWER
        </h3>
        <span className="font-mono text-xs text-zinc-500">
          {result.symbols?.length || 0} atoms
        </span>
      </div>
      <div
        ref={viewerRef}
        className="aspect-video w-full rounded bg-black"
        style={{ minHeight: "400px" }}
      />
      <p className="mt-2 font-mono text-xs text-zinc-500">
        Drag to rotate • Scroll to zoom • Green arrows = force vectors
      </p>
    </div>
  );
}
