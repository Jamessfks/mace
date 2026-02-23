"use client";

import { IntroSection } from "@/components/intro-section";

/**
 * MACE Force Fields — Landing page
 *
 * Scientific computing aesthetic with deep navy gradient background,
 * ambient glow, and subtle dot-grid pattern.
 */
export default function Home() {
  return (
    <div className="relative min-h-screen scientific-bg">
      {/* Ambient radial glow overlay */}
      <div className="ambient-glow pointer-events-none fixed inset-0 z-0" />
      {/* Subtle dot-grid pattern overlay */}
      <div className="dot-grid pointer-events-none fixed inset-0 z-0" />

      <main className="relative z-10">
        <IntroSection />
      </main>
    </div>
  );
}
