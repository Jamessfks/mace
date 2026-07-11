"use client";

/**
 * SiteHeader — shared top navigation for SimpleAtom.
 *
 * Warm, minimal, sticky. Replaces the per-page inline headers so branding
 * and navigation stay consistent across the app. Highlights the active
 * route and collapses to a disclosure menu on small screens.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Atom, Github, Heart, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/calculate", label: "Calculator" },
  { href: "/benchmark", label: "Benchmark" },
  { href: "/docs", label: "Docs" },
];

const GITHUB_URL = "https://github.com/Jamessfks/mace";

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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
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
