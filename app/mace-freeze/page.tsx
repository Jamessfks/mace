"use client";

/**
 * MACE Freeze Training Page — Full fine-tuning with active learning.
 *
 * Implements the complete workflow from mace-api/MACE_Freeze/README.md:
 * 1) Split (train/valid/pool)
 * 2) Train committee (multiple models)
 * 3) Disagreement on pool
 * 4) Active learning: select top-K
 * 5) Label with MACE-MP-0 (demo) or Quantum ESPRESSO (DFT)
 * 6) Append to train
 * 7) Repeat
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Download,
  Zap,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { DatasetUpload } from "@/components/mace-freeze/dataset-upload";
import { TrainingCharts, type TrainingPoint } from "@/components/mace-freeze/training-charts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type StepStatus = "pending" | "running" | "done" | "error";
type LabelReference = "mace-mp" | "qe";

export default function MaceFreezePage() {
  const [useBundled, setUseBundled] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [runName, setRunName] = useState("web_train");
  const [seed, setSeed] = useState(1);
  const [device, setDevice] = useState<"cpu" | "cuda">("cpu");
  const [quickDemo, setQuickDemo] = useState(true);
  const [activeLearning, setActiveLearning] = useState(true);
  const [committeeSize, setCommitteeSize] = useState(2);
  const [topK, setTopK] = useState(5);
  const [fineTune, setFineTune] = useState(false);
  const [trainBaseFirst, setTrainBaseFirst] = useState(true);
  const [baseCheckpointPath, setBaseCheckpointPath] = useState("");
  const [freezePatterns, setFreezePatterns] = useState("embedding radial");
  const [unfreezePatterns, setUnfreezePatterns] = useState("readout");
  const [freezeInitPath, setFreezeInitPath] = useState<string | null>(null);
  const [freezePlanPath, setFreezePlanPath] = useState<string | null>(null);
  const [labelReference, setLabelReference] = useState<LabelReference>("mace-mp");
  const [pseudoDir, setPseudoDir] = useState("");
  const [pseudosJson, setPseudosJson] = useState("");
  const [qeInputTemplate, setQeInputTemplate] = useState("");
  const [qeCommand, setQeCommand] = useState("pw.x");
  const [qeKpts, setQeKpts] = useState("1,1,1");
  const [qeEcutwfc, setQeEcutwfc] = useState(60);
  const [qeEcutrho, setQeEcutrho] = useState(480);

  const [runId, setRunId] = useState<string | null>(null);
  const [iter, setIter] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<TrainingPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({
    train: "pending",
    disagreement: "pending",
    select: "pending",
    label: "pending",
    append: "pending",
  });
  const [checkpoints, setCheckpoints] = useState<string[]>([]);

  const startIteration0 = useCallback(async () => {
    if (!useBundled && !uploadedFile) {
      setError("Choose bundled data or upload a dataset.");
      return;
    }
    setIsTraining(true);
    setError(null);
    setProgressLog([]);
    setMetrics([]);
    setStepStatus({ train: "running", disagreement: "pending", select: "pending", label: "pending", append: "pending" });
    const freezeList = freezePatterns.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
    const unfreezeList = unfreezePatterns.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);

    const formData = new FormData();
    formData.append(
      "params",
      JSON.stringify({
        useBundled,
        runName: runName || "web_train",
        seed,
        device,
        quickDemo,
        splitWithPool: activeLearning,
        committee: activeLearning,
        committeeSize: activeLearning ? committeeSize : 1,
        iter: 0,
        fineTune,
        trainBaseFirst,
        baseCheckpointPath: baseCheckpointPath.trim(),
        freezePatterns: freezeList.length > 0 ? freezeList : ["embedding", "radial"],
        unfreezePatterns: unfreezeList.length > 0 ? unfreezeList : ["readout"],
      })
    );
    if (!useBundled && uploadedFile) formData.append("file", uploadedFile);

    try {
      const res = await fetch("/api/mace-freeze/train", { method: "POST", body: formData });
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
                if (ev.event === "log") setProgressLog((p) => [...p.slice(-99), ev.message]);
                else if (ev.event === "progress")
                  setMetrics((m) => [...m, { epoch: ev.epoch, loss: ev.loss, mae_energy: ev.mae_energy, mae_force: ev.mae_force }]);
                else if (ev.event === "done") {
                  setRunId(ev.run_id);
                  setIter(0);
                  setFreezeInitPath(ev.freeze_init_path ?? null);
                  setFreezePlanPath(ev.freeze_plan_path ?? null);
                  setCheckpoints(ev.checkpoints ?? (ev.checkpoint_path ? [ev.checkpoint_path] : []));
                  setStepStatus((s) => ({ ...s, train: "done" }));
                } else if (ev.event === "error") setError(ev.message);
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
      setStepStatus((s) => ({ ...s, train: "error" }));
    } finally {
      setIsTraining(false);
    }
  }, [
    useBundled,
    uploadedFile,
    runName,
    seed,
    device,
    quickDemo,
    activeLearning,
    committeeSize,
    fineTune,
    trainBaseFirst,
    baseCheckpointPath,
    freezePatterns,
    unfreezePatterns,
  ]);

  const runStep = useCallback(
    async (step: "disagreement" | "select" | "label" | "append") => {
      if (!runId) return;
      setStepStatus((s) => ({ ...s, [step]: "running" }));
      setError(null);
      try {
        const base = { runId, iter, device };
        let res: Response;
        if (step === "disagreement") {
          res = await fetch("/api/mace-freeze/disagreement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base, committeeSize }),
          });
        } else if (step === "select") {
          res = await fetch("/api/mace-freeze/active-learning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base, committeeSize, k: topK }),
          });
        } else if (step === "label") {
          if (labelReference === "qe" && !pseudoDir.trim()) {
            throw new Error("Pseudo directory is required for Quantum ESPRESSO labeling.");
          }
          res = await fetch("/api/mace-freeze/label", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...base,
              reference: labelReference,
              pseudoDir: labelReference === "qe" ? pseudoDir.trim() : undefined,
              pseudosJson: labelReference === "qe" && pseudosJson.trim() ? pseudosJson.trim() : undefined,
              inputTemplate: labelReference === "qe" && qeInputTemplate.trim() ? qeInputTemplate.trim() : undefined,
              qeCommand: labelReference === "qe" ? qeCommand.trim() || "pw.x" : undefined,
              kpts: labelReference === "qe" ? qeKpts.trim() || "1,1,1" : undefined,
              ecutwfc: labelReference === "qe" ? qeEcutwfc : undefined,
              ecutrho: labelReference === "qe" ? qeEcutrho : undefined,
            }),
          });
        } else {
          res = await fetch("/api/mace-freeze/append", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base }),
          });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Step failed");
        setStepStatus((s) => ({ ...s, [step]: "done" }));
      } catch (err) {
        setError(err instanceof Error ? err.message : `${step} failed`);
        setStepStatus((s) => ({ ...s, [step]: "error" }));
      }
    },
    [runId, iter, device, committeeSize, topK, labelReference, pseudoDir, pseudosJson, qeInputTemplate, qeCommand, qeKpts, qeEcutwfc, qeEcutrho]
  );

  const runNextIteration = useCallback(async () => {
    if (!runId) return;
    setIsTraining(true);
    setError(null);
    setProgressLog([]);
    setMetrics([]);
    const nextIter = iter + 1;
    setStepStatus({ train: "running", disagreement: "pending", select: "pending", label: "pending", append: "pending" });

    try {
      const res = await fetch("/api/mace-freeze/committee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          iter: nextIter,
          committeeSize,
          device,
          quickDemo,
          modelPath: fineTune ? (freezeInitPath ?? "") : "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Committee training failed");
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const ev = JSON.parse(line.slice(6).trim());
                if (ev.event === "log") setProgressLog((p) => [...p.slice(-99), ev.message]);
                else if (ev.event === "progress")
                  setMetrics((m) => [...m, { epoch: ev.epoch, loss: ev.loss, mae_energy: ev.mae_energy, mae_force: ev.mae_force }]);
                else if (ev.event === "done") {
                  setIter(nextIter);
                  if (ev.model_path) setFreezeInitPath(ev.model_path);
                  setCheckpoints(ev.checkpoints ?? []);
                  setStepStatus((s) => ({
                    ...s,
                    train: "done",
                    disagreement: "pending",
                    select: "pending",
                    label: "pending",
                    append: "pending",
                  }));
                } else if (ev.event === "error") setError(ev.message);
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
      setStepStatus((s) => ({ ...s, train: "error" }));
    } finally {
      setIsTraining(false);
    }
  }, [runId, iter, committeeSize, device, quickDemo, fineTune, freezeInitPath]);

  const downloadUrl =
    runId && checkpoints.length > 0
      ? activeLearning
        ? `/api/mace-freeze/checkpoint?runId=${encodeURIComponent(runId)}&runName=c0&iter=${iter}`
        : `/api/mace-freeze/checkpoint?runId=${encodeURIComponent(runId)}&runName=${encodeURIComponent(runName || "web_train")}`
      : null;
  const cannotStart =
    isTraining ||
    (!useBundled && !uploadedFile) ||
    (fineTune && !trainBaseFirst && !baseCheckpointPath.trim());

  return (
    <div className="relative min-h-screen bg-black">
      <div className="neon-stable-glow" aria-hidden />
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-mono text-sm text-zinc-500 transition-colors hover:text-matrix-green">
              ← Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <h1 className="font-mono text-lg font-bold text-white">
              MACE <span className="text-violet-400">Freeze</span> Training
            </h1>
            <Badge variant="outline" className="border-violet-500/50 bg-violet-500/10 font-mono text-xs text-violet-400">
              Local only
            </Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl p-6 pb-16">
        <p className="mb-8 font-mono text-sm text-zinc-400">
          Full fine-tuning with active learning: split → train committee →
          disagreement → select top-K → label (DFT) → append → repeat. Quick
          demo uses 5 epochs. Labeling supports MACE-MP-0 (demo) or Quantum ESPRESSO.
        </p>

        {/* Data */}
        <section className="mb-8">
          <h2 className="mb-4 font-mono text-base font-bold text-white">Data</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setUseBundled(true)}
              className={`rounded-lg border p-4 text-left font-mono text-sm transition-colors ${
                useBundled ? "border-matrix-green bg-matrix-green/10 text-matrix-green" : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="font-bold">Option A</span> — Bundled Liquid Water
            </button>
            <button
              type="button"
              onClick={() => setUseBundled(false)}
              className={`rounded-lg border p-4 text-left font-mono text-sm transition-colors ${
                !useBundled ? "border-matrix-green bg-matrix-green/10 text-matrix-green" : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="font-bold">Option B</span> — Upload .xyz / .extxyz
            </button>
          </div>
          {!useBundled && (
            <div className="mt-4">
              <DatasetUpload file={uploadedFile} onFileChange={setUploadedFile} />
            </div>
          )}
        </section>

        {/* Options */}
        <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 font-mono text-base font-bold text-white">Options</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">Run name</label>
              <input
                type="text"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">Seed</label>
              <input
                type="number"
                min={0}
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">Device</label>
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value as "cpu" | "cuda")}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              >
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-zinc-500">Preset</label>
              <select
                value={quickDemo ? "quick" : "full"}
                onChange={(e) => setQuickDemo(e.target.value === "quick")}
                className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
              >
                <option value="quick">Quick demo (5 epochs)</option>
                <option value="full">Full (800 epochs)</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={activeLearning}
                onChange={(e) => setActiveLearning(e.target.checked)}
                className="accent-matrix-green"
              />
              <span className="font-mono text-sm text-zinc-300">Active learning (committee + DFT labeling)</span>
            </label>
            {activeLearning && (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-500">Committee size</span>
                  <select
                    value={committeeSize}
                    onChange={(e) => setCommitteeSize(Number(e.target.value))}
                    className="rounded border border-zinc-700 bg-black/50 px-2 py-1 font-mono text-sm text-white"
                  >
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-500">Top-K to label</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value) || 5)}
                    className="w-16 rounded border border-zinc-700 bg-black/50 px-2 py-1 font-mono text-sm text-white"
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-4 rounded border border-zinc-800 bg-black/40 p-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={fineTune}
                onChange={(e) => setFineTune(e.target.checked)}
                className="accent-matrix-green"
              />
              <span className="font-mono text-sm text-zinc-300">
                Fine-tune with freeze (`mace_freeze.py`)
              </span>
            </label>
            {fineTune && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-xs text-zinc-500">Base checkpoint source</label>
                  <select
                    value={trainBaseFirst ? "train" : "existing"}
                    onChange={(e) => setTrainBaseFirst(e.target.value === "train")}
                    className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                  >
                    <option value="train">Train base model first</option>
                    <option value="existing">Use existing base checkpoint path</option>
                  </select>
                </div>
                {!trainBaseFirst && (
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Base checkpoint path</label>
                    <input
                      type="text"
                      value={baseCheckpointPath}
                      onChange={(e) => setBaseCheckpointPath(e.target.value)}
                      placeholder="/absolute/path/to/best.pt"
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block font-mono text-xs text-zinc-500">Freeze patterns</label>
                  <input
                    type="text"
                    value={freezePatterns}
                    onChange={(e) => setFreezePatterns(e.target.value)}
                    placeholder="embedding radial"
                    className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-zinc-500">Unfreeze patterns</label>
                  <input
                    type="text"
                    value={unfreezePatterns}
                    onChange={(e) => setUnfreezePatterns(e.target.value)}
                    placeholder="readout"
                    className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {activeLearning && (
            <div className="mt-4 rounded border border-zinc-800 bg-black/40 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-xs text-zinc-500">Labeling reference</label>
                  <select
                    value={labelReference}
                    onChange={(e) => setLabelReference(e.target.value as LabelReference)}
                    className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                  >
                    <option value="mace-mp">MACE-MP-0 (demo surrogate)</option>
                    <option value="qe">Quantum ESPRESSO (DFT)</option>
                  </select>
                </div>
              </div>
              {labelReference === "qe" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Pseudo dir (or ESPRESSO_PSEUDO)</label>
                    <input
                      type="text"
                      value={pseudoDir}
                      onChange={(e) => setPseudoDir(e.target.value)}
                      placeholder="/path/to/pseudopotentials"
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">QE command</label>
                    <input
                      type="text"
                      value={qeCommand}
                      onChange={(e) => setQeCommand(e.target.value)}
                      placeholder="pw.x"
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Pseudos JSON (optional)</label>
                    <input
                      type="text"
                      value={pseudosJson}
                      onChange={(e) => setPseudosJson(e.target.value)}
                      placeholder="/path/to/pseudos.json"
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Input template JSON (optional)</label>
                    <input
                      type="text"
                      value={qeInputTemplate}
                      onChange={(e) => setQeInputTemplate(e.target.value)}
                      placeholder="/path/to/qe_input.json"
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">k-points</label>
                    <input
                      type="text"
                      value={qeKpts}
                      onChange={(e) => setQeKpts(e.target.value)}
                      placeholder="1,1,1"
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block font-mono text-xs text-zinc-500">ecutwfc</label>
                      <input
                        type="number"
                        min={1}
                        value={qeEcutwfc}
                        onChange={(e) => setQeEcutwfc(Number(e.target.value) || 60)}
                        className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-mono text-xs text-zinc-500">ecutrho</label>
                      <input
                        type="number"
                        min={1}
                        value={qeEcutrho}
                        onChange={(e) => setQeEcutrho(Number(e.target.value) || 480)}
                        className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Start iteration 0 */}
        <div className="mb-8">
          <Button
            onClick={startIteration0}
            disabled={cannotStart}
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
                Start iteration 0 ({fineTune ? "split + freeze + committee train" : "split + committee train"})
              </span>
            )}
          </Button>
          {fineTune && !trainBaseFirst && !baseCheckpointPath.trim() && (
            <p className="mt-2 font-mono text-xs text-amber-400">
              Enter a base checkpoint path or switch to "Train base model first".
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="font-mono text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Active learning steps (when runId exists and active learning) */}
        {runId && activeLearning && stepStatus.train === "done" && (
          <section className="mb-8 space-y-4 rounded-lg border border-violet-500/30 bg-violet-500/5 p-6">
            <h2 className="font-mono text-base font-bold text-violet-400">
              Active learning — iteration {iter}
            </h2>
            <p className="font-mono text-xs text-zinc-400">
              Steps 5–7: disagreement → select top-K → label ({labelReference === "qe" ? "Quantum ESPRESSO" : "MACE-MP-0"}) → append
            </p>
            <div className="space-y-2">
              {(["disagreement", "select", "label", "append"] as const).map((step) => (
                <div key={step} className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 p-3">
                  <span className="font-mono text-sm text-zinc-300">
                    {step === "disagreement" && "Step 5: Compute disagreement"}
                    {step === "select" && "Step 6: Select top-K uncertain"}
                    {step === "label" && `Step 7: Label with ${labelReference === "qe" ? "Quantum ESPRESSO (DFT)" : "MACE-MP-0 (demo)"}`}
                    {step === "append" && "Step 8: Append to train"}
                  </span>
                  <div className="flex items-center gap-2">
                    {stepStatus[step] === "done" && <CheckCircle2 className="h-4 w-4 text-matrix-green" />}
                    {stepStatus[step] === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {(stepStatus[step] === "pending" || stepStatus[step] === "error") && (
                      <Button
                        size="sm"
                        onClick={() => runStep(step)}
                        className="font-mono border-matrix-green/50 text-matrix-green hover:bg-matrix-green/20"
                      >
                        {stepStatus[step] === "error" ? "Retry" : "Run"}
                      </Button>
                    )}
                    {stepStatus[step] === "running" && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
                  </div>
                </div>
              ))}
            </div>
            {stepStatus.append === "done" && (
              <Button
                onClick={runNextIteration}
                disabled={isTraining}
                className="mt-4 w-full border-2 border-amber-500/50 bg-amber-500/10 font-mono text-amber-400 hover:bg-amber-500/20"
              >
                {isTraining ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Next iteration ({iter + 1}) — train committee on expanded data
              </Button>
            )}
          </section>
        )}

        {/* Progress & graphs */}
        {(isTraining || metrics.length > 0) && (
          <section className="mb-8 space-y-6">
            <h2 className="font-mono text-base font-bold text-white">Training progress</h2>
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

        {/* Done: download */}
        {runId && checkpoints.length > 0 && (
          <section className="rounded-lg border border-matrix-green/30 bg-matrix-green/5 p-6">
            <div className="mb-4 flex items-center gap-2 font-mono text-matrix-green">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-bold">Checkpoint ready</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download="mace-best.pt"
                  className="inline-flex items-center gap-2 rounded border border-matrix-green bg-matrix-green/20 px-4 py-2 font-mono text-sm font-bold text-matrix-green hover:bg-matrix-green hover:text-black"
                >
                  <Download className="h-4 w-4" />
                  Download checkpoint (c0)
                </a>
              )}
              <Button asChild variant="outline" className="font-mono border-zinc-600 text-zinc-300">
                <Link href="/calculate">Open MACE Calculator →</Link>
              </Button>
            </div>
            {fineTune && freezeInitPath && (
              <div className="mt-3 space-y-1 font-mono text-xs text-zinc-400">
                <div>Freeze init: {freezeInitPath}</div>
                {freezePlanPath && <div>Freeze plan: {freezePlanPath}</div>}
              </div>
            )}
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
