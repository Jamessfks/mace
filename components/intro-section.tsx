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
            WORLD'S FIRST WEB-BASED INTERFACE FOR ML INTERATOMIC POTENTIALS
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
          Created by: Zicheng Zhao <br /> Team: Arya Baviskar • Isaac Sohn • Harshitha Somasundaram •
          Kartik Patri
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-6 font-mono text-sm">
          <div className="flex flex-col items-center">
            <span className="text-matrix-green text-2xl">2022</span>
            <span className="text-zinc-500">MACE Release</span>
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

        {/* Acknowledgment */}
        <div className="mt-4 max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900/60 px-6 py-4 text-center backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-2">
            Powered by
          </p>
          <p className="font-mono text-sm text-zinc-400">
            The{" "}
            <a
              href="https://github.com/ACEsuit/mace"
              target="_blank"
              rel="noopener noreferrer"
              className="text-matrix-green hover:underline"
            >
              MACE
            </a>{" "}
            framework — created by Ilyes Batatia, David P. Kovacs, Gregor N. C.
            Simm, and the group of Gabor Csanyi at the University of Cambridge.
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Batatia et al., &quot;MACE: Higher Order Equivariant Message Passing
            Neural Networks for Fast and Accurate Force Fields,&quot; NeurIPS
            2022.
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="h-8 w-px bg-gradient-to-b from-matrix-green to-transparent" />
      </div>
    </section>
  );
}
