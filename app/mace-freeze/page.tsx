"use client";

/**
 * MACE Freeze Training Page — No-code fine-tuning from the web UI.
 *
 * Users choose data (bundled water or upload), set options with buttons and
 * inputs, then click "Start training". Training runs locally via
 * /api/mace-freeze/train; progress streams in and is shown as scientific
 * graphs (loss, MAE energy, MAE force vs epoch). When done, users can
 * download the checkpoint and open the Calculator to use their model.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Download, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { DatasetUpload } from "@/components/mace-freeze/dataset-upload";
import { TrainingCharts, type TrainingPoint } from "@/components/mace-freeze/training-charts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function MaceFreezePage() {
  const [useBundled, setUseBundled] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [runName, setRunName] = useState("web_train");
  const [seed, setSeed] = useState(1);
  const [device, setDevice] = useState<"cpu" | "cuda">("cpu");
  const [quickDemo, setQuickDemo] = useState(true);

  const [isTraining, setIsTraining] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<TrainingPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    runId: string;
    runName: string;
  } | null>(null);

  const startTraining = useCallback(async () => {
    if (!useBundled && !uploadedFile) {
      setError("Choose bundled data or upload a dataset.");
      return;
    }
    setIsTraining(true);
    setError(null);
    setProgressLog([]);
    setMetrics([]);
    setDone(null);

    const formData = new FormData();
    formData.append(
      "params",
      JSON.stringify({
        useBundled,
        runName: runName || "web_train",
        seed,
        device,
        quickDemo,
      })
    );
    if (!useBundled && uploadedFile) {
      formData.append("file", uploadedFile);
    }

    try {
      const res = await fetch("/api/mace-freeze/train", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const ev = JSON.parse(jsonStr);
                if (ev.event === "log") {
                  setProgressLog((prev) => [...prev.slice(-99), ev.message]);
                } else if (ev.event === "progress") {
                  setMetrics((prev) => [
                    ...prev,
                    {
                      epoch: ev.epoch,
                      loss: ev.loss,
                      mae_energy: ev.mae_energy,
                      mae_force: ev.mae_force,
                    },
                  ]);
                } else if (ev.event === "done") {
                  setDone({
                    runId: ev.run_id,
                    runName: ev.run_name,
                  });
                } else if (ev.event === "error") {
                  setError(ev.message);
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
    } finally {
      setIsTraining(false);
    }
  }, [useBundled, uploadedFile, runName, seed, device, quickDemo]);

  const downloadUrl = done
    ? `/api/mace-freeze/checkpoint?runId=${encodeURIComponent(done.runId)}&runName=${encodeURIComponent(done.runName)}`
    : null;

  return (
    <div className="relative min-h-screen bg-black">
      <div className="neon-stable-glow" aria-hidden />

      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-sm text-zinc-500 transition-colors hover:text-matrix-green"
            >
              ← Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="font-mono text-lg font-bold text-white">
              MACE <span className="text-violet-400">Freeze</span> Training
            </h1>
            <Badge
              variant="outline"
              className="border-violet-500/50 bg-violet-500/10 font-mono text-xs text-violet-400"
            >
              Local only
            </Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl p-6 pb-16">
        <p className="mb-8 font-mono text-sm text-zinc-400">
          Fine-tune MACE with no coding: choose data, set options, and click
          Start training. Graphs update live. When done, download your model and
          use it in the Calculator.
        </p>

        {/* ── Data ── */}
        <section className="mb-8">
          <h2 className="mb-4 font-mono text-base font-bold text-white">
            Data
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setUseBundled(true)}
              className={`rounded-lg border p-4 text-left font-mono text-sm transition-colors ${
                useBundled
                  ? "border-matrix-green bg-matrix-green/10 text-matrix-green"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="font-bold">Option A</span> — Use bundled Liquid
              Water data
            </button>
            <button
              type="button"
              onClick={() => setUseBundled(false)}
              className={`rounded-lg border p-4 text-left font-mono text-sm transition-colors ${
                !useBundled
                  ? "border-matrix-green bg-matrix-green/10 text-matrix-green"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="font-bold">Option B</span> — Upload your own
              .xyz / .extxyz
            </button>
          </div>
          {!useBundled && (
            <div className="mt-4">
              <DatasetUpload
                file={uploadedFile}
                onFileChange={setUploadedFile}
              />
            </div>
          )}
        </section>

        {/* ── Training options ── */}
        <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 font-mono text-base font-bold text-white">
            Training options
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">
                Run name
              </label>
              <input
                type="text"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                placeholder="web_train"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">
                Seed
              </label>
              <input
                type="number"
                min={0}
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">
                Device
              </label>
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value as "cpu" | "cuda")}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              >
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA (GPU)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">
                Preset
              </label>
              <select
                value={quickDemo ? "quick" : "full"}
                onChange={(e) => setQuickDemo(e.target.value === "quick")}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              >
                <option value="quick">Quick demo (15 epochs)</option>
                <option value="full">Full (800 epochs)</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Start training ── */}
        <div className="mb-8">
          <Button
            onClick={startTraining}
            disabled={isTraining || (!useBundled && !uploadedFile)}
            className="w-full border-2 border-matrix-green bg-matrix-green/10 py-6 font-mono text-lg font-bold text-matrix-green hover:bg-matrix-green hover:text-black disabled:opacity-50"
          >
            {isTraining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Training…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Zap className="h-5 w-5" />
                Start training
              </span>
            )}
          </Button>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="font-mono text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ── Progress & graphs ── */}
        {(isTraining || metrics.length > 0) && (
          <section className="mb-8 space-y-6">
            <h2 className="font-mono text-base font-bold text-white">
              Training progress
            </h2>
            {progressLog.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border border-zinc-800 bg-black/60 p-3 font-mono text-[11px] text-zinc-500">
                {progressLog.slice(-20).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
            <TrainingCharts data={metrics} compact={isTraining} />
          </section>
        )}

        {/* ── Done: download & use in Calculator ── */}
        {done && !isTraining && (
          <section className="rounded-lg border border-matrix-green/30 bg-matrix-green/5 p-6">
            <div className="mb-4 flex items-center gap-2 font-mono text-matrix-green">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-bold">Training complete</span>
            </div>
            <p className="mb-4 font-mono text-sm text-zinc-400">
              Download your checkpoint and use it for other calculations (e.g.
              in the MACE Calculator with a custom model path, or locally with
              mace_run_train).
            </p>
            <div className="flex flex-wrap gap-3">
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={`mace-${done.runName}-best.pt`}
                  className="inline-flex items-center gap-2 rounded border border-matrix-green bg-matrix-green/20 px-4 py-2 font-mono text-sm font-bold text-matrix-green hover:bg-matrix-green hover:text-black"
                >
                  <Download className="h-4 w-4" />
                  Download checkpoint
                </a>
              )}
              <Button asChild variant="outline" className="font-mono border-zinc-600 text-zinc-300">
                <Link href="/calculate">
                  Open MACE Calculator →
                </Link>
              </Button>
            </div>
          </section>
        )}

        <div className="mt-12 flex justify-center">
          <Button asChild variant="outline" size="sm" className="font-mono border-zinc-700 text-zinc-400">
            <Link href="/">← Back to Home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
