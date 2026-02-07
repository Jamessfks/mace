"use client";

import { useEffect, useRef } from "react";
import type { CalculationResult } from "@/types/mace";

interface MoleculeViewer3DProps {
  result: CalculationResult;
}

/**
 * 3D Molecular Viewer using 3Dmol.js
 * Renders atomic structure with CPK coloring and force vectors
 * Container must have explicit width/height and position:relative per 3Dmol docs
 */
export function MoleculeViewer3D({ result }: MoleculeViewer3DProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!viewerRef.current || !result.positions || !result.symbols) return;

    const resize = () => {
      if (viewerInstance.current && viewerRef.current) {
        viewerInstance.current.resize?.();
        viewerInstance.current.render?.();
      }
    };

    // Dynamically import 3Dmol to avoid SSR issues
    import("3dmol").then(($3Dmol) => {
      if (!viewerRef.current || !result.symbols || !result.positions) return;

      // Clear previous viewer
      viewerRef.current.innerHTML = "";

      // Create viewer (container must have explicit dimensions per 3Dmol docs)
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

      // Ensure viewer matches container size (fixes wrong placement when layout settles)
      resize();
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(viewerRef.current);

      viewer.enableFog(false);
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      viewerInstance.current?.clear?.();
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
      {/* 3Dmol requires explicit dimensions and position:relative per docs */}
      <div
        ref={viewerRef}
        className="w-full overflow-hidden rounded bg-black"
        style={{
          position: "relative",
          width: "100%",
          height: 400,
          minHeight: 400,
        }}
      />
      <p className="mt-2 font-mono text-xs text-zinc-500">
        Drag to rotate • Scroll to zoom • Green arrows = force vectors
      </p>
    </div>
  );
}
