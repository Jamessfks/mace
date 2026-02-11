"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function IntroSection() {
  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20">
      {/* Matrix rain overlay effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
        <div className="matrix-rain absolute inset-0" />
      </div>

      <div className="relative flex max-w-4xl flex-col items-center gap-8 text-center">
        {/* Glowing title */}
        <div className="space-y-4">
          <Badge
            variant="outline"
            className="border-matrix-green/50 bg-matrix-green/10 px-4 py-1.5 text-matrix-green font-mono text-xs tracking-widest"
          >
            CS2535 • TEAM 3 • DISCRETE STRUCTURES
          </Badge>
          <h1 className="font-mono text-4xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
            <span className="text-shadow-matrix">MACE</span>
            <br />
            <span className="text-matrix-green text-shadow-matrix-green">
              FORCE FIELDS
            </span>
          </h1>
        </div>

        {/* Subtitle - MACE project context */}
        <p className="max-w-2xl font-mono text-lg text-zinc-400 sm:text-xl">
          Machine learning for predicting many-body atomic interactions.
          Modernized graph theory → fast <em>and</em> quantum-mechanical
          precision.
        </p>

        {/* Team members */}
        <p className="font-mono text-sm text-zinc-500">
          Arya Baviskar • Isaac Sohn • Harshitha Somasundaram • Kartik Patri •
          Zicheng Zhao
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-6 font-mono text-sm">
          <div className="flex flex-col items-center">
            <span className="text-matrix-green text-2xl">2024</span>
            <span className="text-zinc-500">MACE Release</span>
          </div>
          <div className="h-8 w-px bg-matrix-green/30" />
          <div className="flex flex-col items-center">
            <span className="text-matrix-green text-2xl">DFT</span>
            <span className="text-zinc-500">Reference Data</span>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <Button
            asChild
            size="lg"
            variant="outline"
            className="group relative overflow-hidden border-2 border-matrix-green/70 bg-matrix-green/5 font-mono text-matrix-green transition-all hover:bg-matrix-green/20 hover:border-matrix-green"
          >
            <Link href="/calculate">
              <span className="relative z-10">MACE CALCULATOR</span>
              <div className="absolute inset-0 -z-0 bg-matrix-green/10 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="h-8 w-px bg-gradient-to-b from-matrix-green to-transparent" />
      </div>
    </section>
  );
}
