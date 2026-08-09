"use client";

/**
 * SiteHeader — shared top navigation for SimpleAtom.
 *
 * Warm, minimal, sticky. Replaces the per-page inline headers so branding
 * and navigation stay consistent across the app. Highlights the active
 * route, surfaces the calculator as a single solid primary CTA (mirroring
 * the "one obvious next action" hierarchy from docs/v2/bars/rowan.md
 * without copying its wording or type), collapses to a disclosure menu on
 * small screens, and sizes its content column per-route via
 * `contentWidthClass` so it lines up with the page beneath it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Atom, Github, Heart, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Secondary links only — the calculator is promoted to the primary CTA
// button rendered separately below, so it isn't duplicated in this list.
const NAV = [
  { href: "/benchmark", label: "Benchmark" },
  { href: "/docs", label: "Docs" },
];

const GITHUB_URL = "https://github.com/Jamessfks/mace";

/**
 * Content-column width per route. Mirrors the max-w each page's own <main>
 * actually renders at, so the sticky header/footer edges line up with the
 * page beneath instead of floating outside it (the landing page matches
 * Rowan's measured 1024px column — see docs/v2/bars/rowan.md). The
 * calculator, benchmark, and shared-result ("MACE Link") views are
 * data-dense — tables, plots, the 3D viewer — and are deliberately wider
 * than the marketing/reading pages; that split is intentional, not
 * accidental drift. Exported so SiteFooter can stay in sync with SiteHeader.
 */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function contentWidthClass(pathname: string): string {
  if (isUnder(pathname, "/calculate") || isUnder(pathname, "/r")) {
    return "max-w-screen-2xl"; // matches app/calculate, app/r/[id]
  }
  if (isUnder(pathname, "/benchmark")) {
    return "max-w-7xl"; // matches app/benchmark
  }
  if (isUnder(pathname, "/support") || isUnder(pathname, "/docs")) {
    return "max-w-6xl"; // matches app/support, app/docs/*
  }
  return "max-w-5xl"; // landing ("/"), /v2, and any future route
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-center gap-2 text-lg font-semibold tracking-tight",
        className,
      )}
      aria-label="SimpleAtom home"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)] transition-colors group-hover:bg-[var(--color-accent-primary)] group-hover:text-white">
        <Atom className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span>
        <span className="text-[var(--color-text-primary)]">Simple</span>
        <span className="text-[var(--color-accent-strong)]">Atom</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => isUnder(pathname, href);

  const widthClass = contentWidthClass(pathname);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/85 backdrop-blur-md">
      <div
        className={cn(
          "mx-auto flex h-16 items-center justify-between px-6",
          widthClass,
        )}
      >
        <Wordmark />

        {/* Desktop navigation */}
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {item.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 rounded-md p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
            aria-label="View source on GitHub"
          >
            <Github className="h-5 w-5" strokeWidth={1.75} />
          </a>
          <Link
            href="/support"
            aria-current={isActive("/support") ? "page" : undefined}
            className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-accent-strong)] transition-colors hover:bg-[var(--color-accent-primary)] hover:text-white"
          >
            <Heart className="h-4 w-4" strokeWidth={2} />
            Support
          </Link>
          <Button asChild className="ml-2">
            <Link
              href="/calculate"
              aria-current={isActive("/calculate") ? "page" : undefined}
            >
              Calculator
            </Link>
          </Button>
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile disclosure panel */}
      {open && (
        <nav
          className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-6 py-3 md:hidden"
          aria-label="Primary mobile"
        >
          <ul className="flex flex-col gap-1">
            <li>
              <Button asChild className="w-full">
                <Link
                  href="/calculate"
                  onClick={() => setOpen(false)}
                  aria-current={isActive("/calculate") ? "page" : undefined}
                >
                  Calculator
                </Link>
              </Button>
            </li>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <Github className="h-4 w-4" /> GitHub
              </a>
            </li>
            <li>
              <Link
                href="/support"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md bg-[var(--color-accent-soft)] px-3 py-2 text-sm font-medium text-[var(--color-accent-strong)]"
              >
                <Heart className="h-4 w-4" /> Support
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
