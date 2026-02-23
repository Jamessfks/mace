"use client";

/**
 * IntroSection — Hero + features for the MACE landing page.
 *
 * Design: Premium scientific computing aesthetic inspired by Schrodinger.com.
 * Deep navy background, blue accent palette, commanding typography.
 *
 * Sections:
 *   1. Hero — badge, title, subtitle, stats row, dual CTA buttons
 *   2. Features — 4-card grid highlighting core capabilities
 *   3. Attribution — MACE framework credits and citation
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  BarChart3,
  GitCompareArrows,
  Box,
} from "lucide-react";
import { WaterMDCanvas } from "@/components/water-md-canvas";

/* ── Feature card data ── */
const FEATURES = [
  {
    icon: Layers,
    title: "Foundation Models",
    description:
      "Run MACE-MP-0, MACE-OFF, or upload your own fine-tuned .model files for custom potentials.",
  },
  {
    icon: BarChart3,
    title: "Scientific Visualization",
    description:
      "Parity plots, error histograms, and energy convergence charts with publication-quality exports.",
  },
  {
    icon: GitCompareArrows,
    title: "Model Benchmarking",
    description:
      "Compare your fine-tuned model against MACE foundation models on standard benchmarks.",
  },
  {
    icon: Box,
    title: "3D Structure Viewer",
    description:
      "Interactive molecular visualization with force vectors, trajectory animation, and dual rendering engines.",
  },
];

/* ── Stats data ── */
const STATS = [
  { value: "89", label: "Elements Supported" },
  { value: "meV", label: "Accuracy Scale" },
  { value: "2022", label: "NeurIPS Publication" },
  { value: "10M+", label: "Training Structures" },
];

export function IntroSection() {
  return (
    <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20">
      {/* Animated liquid water MD simulation background —
          positioned behind all text content via z-0 */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <WaterMDCanvas />
      </div>

      <div className="relative z-10 flex max-w-5xl flex-col items-center gap-10 text-center">
        {/* ── Badge ── */}
        <Badge
          variant="outline"
          className="border-[var(--color-accent-primary)]/40 bg-[var(--color-bg-elevated)] px-4 py-1.5 text-[var(--color-accent-primary)] font-mono text-xs tracking-widest"
        >
          MACHINE LEARNING INTERATOMIC POTENTIALS
        </Badge>

        {/* ── Hero Title ── */}
        <div className="space-y-2">
          <h1 className="font-sans text-5xl font-bold tracking-tight text-white sm:text-7xl md:text-8xl">
            <span className="text-shadow-accent">MACE</span>
            <br />
            <span className="text-[var(--color-accent-primary)] text-shadow-accent-strong">
              FORCE FIELDS
            </span>
          </h1>
        </div>

        {/* ── Subtitle ── */}
        <p className="max-w-3xl text-lg text-[var(--color-text-secondary)] sm:text-xl leading-relaxed">
          Many-body Atomic Cluster Expansion — equivariant message-passing
          neural networks for fast, accurate interatomic potentials across
          the periodic table.
        </p>

        {/* ── Stats Row ── */}
        <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <span className="font-mono text-2xl font-bold text-[var(--color-accent-primary)]">
                {stat.value}
              </span>
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── CTA Buttons ── */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="bg-[var(--color-accent-primary)] px-8 font-sans text-white hover:bg-[var(--color-accent-primary)]/90 transition-all"
          >
            <Link href="/calculate">Launch Calculator</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-[var(--color-border-emphasis)] bg-transparent px-8 font-sans text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-white transition-all"
          >
            <Link href="/calculate?demo=true">Quick Demo</Link>
          </Button>
        </div>

        {/* ── Features Grid ── */}
        <div className="mt-8 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5 text-left transition-colors hover:border-[var(--color-border-emphasis)] hover:bg-[var(--color-bg-elevated)]"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-primary)]/10">
                <feature.icon className="h-5 w-5 text-[var(--color-accent-primary)]" />
              </div>
              <h3 className="mb-1 font-sans text-sm font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* ── Attribution ── */}
        <div className="mt-4 max-w-2xl rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]/60 px-6 py-4 text-center backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
            Powered by
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            The{" "}
            <a
              href="https://github.com/ACEsuit/mace"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent-primary)] hover:underline"
            >
              MACE
            </a>{" "}
            framework — created by Ilyes Batatia, David P. Kovacs, Gregor
            N. C. Simm, and the group of Gabor Csanyi at the University of
            Cambridge.
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
            Batatia et al., &quot;MACE: Higher Order Equivariant Message
            Passing Neural Networks for Fast and Accurate Force
            Fields,&quot; NeurIPS 2022.
          </p>
        </div>
      </div>
    </section>
  );
}
