import type { Metadata } from "next";
import Link from "next/link";
import {
  Heart,
  Coffee,
  Star,
  Share2,
  Quote,
  Accessibility,
  Server,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

const KOFI_URL = "https://ko-fi.com/james41792";

export const metadata: Metadata = {
  title: "Support",
  description:
    "SimpleAtom is free and open, built to make computational chemistry accessible to everyone. If it helps your research or teaching, you can support its development and hosting on Ko-fi.",
};

const REASONS = [
  {
    icon: Sparkles,
    title: "Keep it free & open",
    body: "SimpleAtom is free for everyone — no accounts, no paywalls, no limits. Support keeps it that way.",
  },
  {
    icon: Server,
    title: "Fund hosting & compute",
    body: "Running the interface, the calculation backend, and shared-result storage costs real money each month.",
  },
  {
    icon: Accessibility,
    title: "Advance the mission",
    body: "Every contribution helps make quantum-accurate simulation accessible to students, under-resourced labs, and scientists with accessibility needs.",
  },
];

const OTHER_WAYS = [
  {
    icon: Star,
    title: "Star it on GitHub",
    body: "A star helps others discover the project.",
    href: "https://github.com/Jamessfks/mace",
    cta: "Open GitHub",
  },
  {
    icon: Share2,
    title: "Share with your lab",
    body: "Tell a colleague or classmate who runs calculations by hand.",
    href: "https://mace-lake.vercel.app",
    cta: "Copy the link",
  },
  {
    icon: Quote,
    title: "Cite your results",
    body: "Every calculation can be shared as a permanent, citable link.",
    href: "/docs/validation",
    cta: "How to cite",
    internal: true,
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* Hero — the standout donation call */}
        <section className="warm-bg border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)]">
              <Heart className="h-8 w-8" strokeWidth={1.75} />
            </span>

            <h1 className="mt-6 font-serif text-4xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-5xl">
              Support SimpleAtom
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
              SimpleAtom is a free, open tool built by one student to make
              quantum-accurate chemistry accessible to everyone. If it has
              helped your research, your teaching, or your curiosity, a small
              contribution keeps it running and free.
            </p>

            {/* Prominent Ko-fi CTA */}
            <div className="mt-9 flex flex-col items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 px-8 text-base shadow-sm"
              >
                <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
                  <Coffee className="h-5 w-5" />
                  Support on Ko-fi
                </a>
              </Button>
              <p className="text-sm text-[var(--color-text-muted)]">
                Any amount helps · Secure checkout via Ko-fi · No account needed
              </p>
            </div>

            <p className="mx-auto mt-8 max-w-md rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-5 py-3 text-sm text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-text-primary)]">
                SimpleAtom will always be free.
              </strong>{" "}
              Supporting is entirely optional — every feature stays available to
              everyone, contributor or not.
            </p>
          </div>
        </section>

        {/* Why support */}
        <section className="border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <h2 className="text-center font-serif text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Why your support matters
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {REASONS.map((r) => (
                <div
                  key={r.title}
                  className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-6 text-center"
                >
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)]">
                    <r.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {r.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Other ways to help */}
        <section>
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                Can&rsquo;t donate? That&rsquo;s okay.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
                Support isn&rsquo;t only financial — these help just as much.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {OTHER_WAYS.map((w) => (
                <div
                  key={w.title}
                  className="flex flex-col rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)]">
                    <w.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">
                    {w.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {w.body}
                  </p>
                  {w.internal ? (
                    <Link
                      href={w.href}
                      className="mt-4 text-sm font-medium text-[var(--color-accent-strong)] hover:underline"
                    >
                      {w.cta} →
                    </Link>
                  ) : (
                    <a
                      href={w.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 text-sm font-medium text-[var(--color-accent-strong)] hover:underline"
                    >
                      {w.cta} →
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Closing CTA */}
            <div className="mx-auto mt-14 max-w-xl text-center">
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
                  <Heart className="h-5 w-5" />
                  Buy me a coffee on Ko-fi
                </a>
              </Button>
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                Thank you for helping keep science accessible.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
