"use client";

/**
 * CommandBlock — Copyable terminal command block for the MACE Freeze workflow.
 *
 * Renders a <pre> with monospace styling and a "Copy" button. Uses
 * navigator.clipboard.writeText for copy; no external dependencies.
 * Used to show exact commands from mace-api/MACE_Freeze/README.md.
 */

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface CommandBlockProps {
  /** Full command text (multi-line allowed). Shown as-is; leading/trailing newlines trimmed. */
  children: string;
  /** Optional label above the block (e.g. "Split dataset"). */
  label?: string;
  /** Optional id for the block (for aria). */
  id?: string;
}

export function CommandBlock({ children, label, id }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);

  const text = children.trim();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers: select and document.execCommand
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/80">
      {label && (
        <div className="border-b border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-500">
          {label}
        </div>
      )}
      <pre
        id={id}
        className="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap"
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded border border-zinc-700 bg-zinc-800/80 px-2 py-1.5 font-mono text-xs text-zinc-400 transition-colors hover:border-matrix-green/50 hover:text-matrix-green"
        aria-label="Copy command"
      >
        {copied ? (
          <span className="flex items-center gap-1.5 text-matrix-green">
            <Check className="h-3.5 w-3.5" />
            Copied
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </span>
        )}
      </button>
    </div>
  );
}
