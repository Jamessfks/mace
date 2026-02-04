"use client";

import Link from "next/link";
import { useState } from "react";

const BINDER_REPO = "Jamessfks/mace";
const BINDER_BRANCH = "main";
const NOTEBOOK_PATH = "notebooks/TUTORIAL_1_FIXES.ipynb";

const binderUrl = `https://mybinder.org/v2/gh/${BINDER_REPO}/${BINDER_BRANCH}?urlpath=lab%2Ftree%2F${encodeURIComponent(NOTEBOOK_PATH)}`;
const colabUrl = `https://colab.research.google.com/github/${BINDER_REPO}/blob/${BINDER_BRANCH}/${NOTEBOOK_PATH}`;

export default function RunTutorial1Page() {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-matrix-green/30 bg-black/90 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/tutorial1"
            className="font-mono text-sm text-zinc-400 transition-colors hover:text-matrix-green"
          >
            ← View static
          </Link>
          <Link
            href="/"
            className="font-mono text-sm text-zinc-400 transition-colors hover:text-matrix-green"
          >
            Home
          </Link>
        </div>
        <span className="font-mono text-xs text-matrix-green/80">
          Run Tutorial 1 • Binder
        </span>
      </header>

      {/* Launch bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-matrix-green/20 bg-zinc-900/80 px-4 py-3">
        <div className="font-mono text-sm text-zinc-300">
          <span className="text-matrix-green">MACE in Practice I</span>
          <span className="text-zinc-500"> — run in browser (first launch may take 1–2 min)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={binderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-matrix-green/50 bg-matrix-green/10 px-3 py-1.5 font-mono text-xs text-matrix-green transition-colors hover:bg-matrix-green/20"
          >
            Open in new tab
          </a>
          <a
            href={colabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-zinc-500 bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Open in Google Colab
          </a>
        </div>
      </div>

      {/* Binder iframe */}
      <div className="relative min-h-0 flex-1">
        {!iframeLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black font-mono text-zinc-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-matrix-green/30 border-t-matrix-green" />
            <p>Starting Binder…</p>
            <p className="text-xs">Push the notebook from this repo to GitHub if you haven’t.</p>
          </div>
        )}
        <iframe
          src={binderUrl}
          title="Run Tutorial 1 — MACE in Practice I (Binder)"
          className="h-full w-full border-0"
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </div>
  );
}
