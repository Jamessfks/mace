"use client";

import { IntroSection } from "@/components/intro-section";

/**
 * MACE Force Fields - Team 3 project overview
 * Matrix-themed intro with link to Liquid Water results report
 */
export default function Home() {
  return (
    <div className="relative min-h-screen matrix-bg">
      {/* Scan lines overlay for Matrix effect */}
      <div className="scan-lines pointer-events-none fixed inset-0 z-50" />

      {/* Main content */}
      <main className="relative z-10">
        <IntroSection />
      </main>
    </div>
  );
}
