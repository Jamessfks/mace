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

import { useState, useCallback, useEffect } from "react";
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
type FreezePreset = "conservative" | "recommended" | "aggressive" | "custom";
type ActiveLearningStep = "disagreement" | "select" | "label" | "append";

const ACTIVE_LEARNING_STEPS: ActiveLearningStep[] = ["disagreement", "select", "label", "append"];

interface FreezePreviewResult {
  checkpoint: string;
  freeze_patterns: string[];
  unfreeze_patterns: string[];
  num_total_params: number;
  num_frozen_params: number;
  num_trainable_params: number;
  frozen_keys_sample: string[];
  available_patterns: string[];
  warning?: string | null;
}

const FREEZE_PRESETS: Record<Exclude<FreezePreset, "custom">, { freeze: string[]; unfreeze: string[]; hint: string }> = {
  conservative: {
    freeze: ["embedding"],
    unfreeze: ["readout"],
    hint: "Light freeze: keep most layers trainable.",
  },
  recommended: {
    freeze: ["embedding", "radial"],
    unfreeze: ["readout"],
    hint: "Balanced default for most fine-tuning runs.",
  },
  aggressive: {
    freeze: ["embedding", "radial", "interaction", "products"],
    unfreeze: ["readout"],
    hint: "Freeze most feature extractors; adapt mostly readout.",
  },
};

export default function MaceFreezePage() {
  const [useBundled, setUseBundled] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [runName, setRunName] = useState("web_train");
  const [seed, setSeed] = useState(1);
  const [device, setDevice] = useState<"cpu" | "cuda">("cpu");
  const [maxEpochs, setMaxEpochs] = useState(5);
  const [activeLearning, setActiveLearning] = useState(true);
  const [committeeSize, setCommitteeSize] = useState(2);
  const [topK, setTopK] = useState(5);
  const [fineTune, setFineTune] = useState(false);
  const [trainBaseFirst, setTrainBaseFirst] = useState(true);
  const [baseCheckpointPath, setBaseCheckpointPath] = useState("");
  const [freezePreset, setFreezePreset] = useState<FreezePreset>("recommended");
  const [freezePatterns, setFreezePatterns] = useState<string[]>([...FREEZE_PRESETS.recommended.freeze]);
  const [unfreezePatterns, setUnfreezePatterns] = useState<string[]>([...FREEZE_PRESETS.recommended.unfreeze]);
  const [customFreezeInput, setCustomFreezeInput] = useState("");
  const [customUnfreezeInput, setCustomUnfreezeInput] = useState("");
  const [availableFreezeModules, setAvailableFreezeModules] = useState<string[]>([]);
  const [freezePreview, setFreezePreview] = useState<FreezePreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [freezePreviewKey, setFreezePreviewKey] = useState("");
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
  const [isRunningActiveLearning, setIsRunningActiveLearning] = useState(false);
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
  const [activeLearningStopped, setActiveLearningStopped] = useState(false);
  /** Convergence status from disagreement API (converged, suggest_stop, reasons, metrics) */
  const [convergence, setConvergence] = useState<{
    converged: boolean;
    suggest_stop: boolean;
    reasons: string[];
    metrics?: {
      disagreement_max?: number;
      disagreement_mean?: number;
      validation_mae_energy?: number;
      validation_mae_force?: number;
      pool_size?: number;
      structures_above_cutoff?: number;
    };
  } | null>(null);

  const mergeUniquePatterns = useCallback((current: string[], incoming: string[]) => {
    const normalized = [...current, ...incoming]
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => v.toLowerCase());
    return Array.from(new Set(normalized));
  }, []);

  const parsePatternInput = useCallback((raw: string) => {
    return raw
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => v.toLowerCase());
  }, []);

  const applyFreezePreset = useCallback((preset: FreezePreset) => {
    setFreezePreset(preset);
    if (preset === "custom") return;
    setFreezePatterns([...FREEZE_PRESETS[preset].freeze]);
    setUnfreezePatterns([...FREEZE_PRESETS[preset].unfreeze]);
  }, []);

  const togglePattern = useCallback(
    (target: "freeze" | "unfreeze", pattern: string) => {
      const token = pattern.trim().toLowerCase();
      if (!token) return;
      setFreezePreset("custom");
      if (target === "freeze") {
        setFreezePatterns((prev) =>
          prev.includes(token) ? prev.filter((p) => p !== token) : [...prev, token]
        );
      } else {
        setUnfreezePatterns((prev) =>
          prev.includes(token) ? prev.filter((p) => p !== token) : [...prev, token]
        );
      }
    },
    []
  );

  const addCustomPattern = useCallback(
    (target: "freeze" | "unfreeze") => {
      setFreezePreset("custom");
      if (target === "freeze") {
        const parsed = parsePatternInput(customFreezeInput);
        setFreezePatterns((prev) => mergeUniquePatterns(prev, parsed));
        setCustomFreezeInput("");
      } else {
        const parsed = parsePatternInput(customUnfreezeInput);
        setUnfreezePatterns((prev) => mergeUniquePatterns(prev, parsed));
        setCustomUnfreezeInput("");
      }
    },
    [customFreezeInput, customUnfreezeInput, mergeUniquePatterns, parsePatternInput]
  );

  const makePreviewKey = useCallback(
    () =>
      `${baseCheckpointPath.trim()}|${freezePatterns.join(",")}|${unfreezePatterns.join(",")}`,
    [baseCheckpointPath, freezePatterns, unfreezePatterns]
  );

  const runFreezePreview = useCallback(
    async (silent = false) => {
      if (!fineTune || trainBaseFirst || !baseCheckpointPath.trim()) {
        setFreezePreview(null);
        setAvailableFreezeModules([]);
        setFreezePreviewKey("");
        return false;
      }
      setIsPreviewLoading(true);
      if (!silent) setError(null);
      try {
        const res = await fetch("/api/mace-freeze/freeze-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkpointPath: baseCheckpointPath.trim(),
            freezePatterns,
            unfreezePatterns,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Freeze preview failed");
        setFreezePreview(data as FreezePreviewResult);
        setAvailableFreezeModules(Array.isArray(data.available_patterns) ? data.available_patterns : []);
        setFreezePreviewKey(makePreviewKey());
        return true;
      } catch (err) {
        setFreezePreview(null);
        setAvailableFreezeModules([]);
        setFreezePreviewKey("");
        if (!silent) {
          setError(err instanceof Error ? err.message : "Freeze preview failed");
        }
        return false;
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [fineTune, trainBaseFirst, baseCheckpointPath, freezePatterns, unfreezePatterns, makePreviewKey]
  );

  useEffect(() => {
    if (!fineTune) {
      setFreezePreview(null);
      setAvailableFreezeModules([]);
      setFreezePreviewKey("");
      return;
    }
    if (trainBaseFirst || !baseCheckpointPath.trim()) {
      setFreezePreview(null);
      setAvailableFreezeModules([]);
      setFreezePreviewKey("");
      return;
    }
    const timer = setTimeout(() => {
      void runFreezePreview(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [fineTune, trainBaseFirst, baseCheckpointPath, freezePatterns, unfreezePatterns, runFreezePreview]);

  const startIteration0 = useCallback(async () => {
    if (!useBundled && !uploadedFile) {
      setError("Choose bundled data or upload a dataset.");
      return;
    }
    if (!Number.isFinite(maxEpochs) || maxEpochs <= 0) {
      setError("Max epochs must be a positive number.");
      return;
    }
    if (fineTune && !trainBaseFirst && !baseCheckpointPath.trim()) {
      setError("Provide a base checkpoint path for fine-tuning, or switch to 'Train base model first'.");
      return;
    }
    const previewKeyNow = makePreviewKey();
    if (fineTune && !trainBaseFirst && baseCheckpointPath.trim() && freezePreviewKey !== previewKeyNow) {
      const ok = await runFreezePreview(false);
      if (!ok) return;
    }
    setActiveLearningStopped(false);
    setIsRunningActiveLearning(false);
    setIsTraining(true);
    setError(null);
    setProgressLog([]);
    setMetrics([]);
    setConvergence(null);
    setStepStatus({ train: "running", disagreement: "pending", select: "pending", label: "pending", append: "pending" });

    const formData = new FormData();
    formData.append(
      "params",
      JSON.stringify({
        useBundled,
        runName: runName || "web_train",
        seed,
        device,
        maxEpochs: Math.max(1, Math.floor(maxEpochs)),
        splitWithPool: activeLearning,
        committee: activeLearning,
        committeeSize: activeLearning ? committeeSize : 1,
        iter: 0,
        fineTune,
        trainBaseFirst,
        baseCheckpointPath: baseCheckpointPath.trim(),
        freezePatterns: freezePatterns.length > 0 ? freezePatterns : [...FREEZE_PRESETS.recommended.freeze],
        unfreezePatterns: unfreezePatterns.length > 0 ? unfreezePatterns : [...FREEZE_PRESETS.recommended.unfreeze],
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
    maxEpochs,
    activeLearning,
    committeeSize,
    fineTune,
    trainBaseFirst,
    baseCheckpointPath,
    freezePreviewKey,
    runFreezePreview,
    makePreviewKey,
    freezePatterns,
    unfreezePatterns,
  ]);

  const executeActiveLearningStep = useCallback(
    async (step: ActiveLearningStep) => {
      if (!runId) throw new Error("Run ID is missing.");
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
        res = await fetch("/api/mace-freeze/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...base,
            reference: labelReference,
            pseudoDir: labelReference === "qe" && pseudoDir.trim() ? pseudoDir.trim() : undefined,
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
      // Capture convergence status from disagreement response for UI hints
      if (step === "disagreement" && data.convergence) {
        const c = data.convergence as {
          converged?: boolean;
          suggest_stop?: boolean;
          reasons?: string[];
          metrics?: Record<string, number>;
        };
        setConvergence({
          converged: c.converged ?? false,
          suggest_stop: c.suggest_stop ?? false,
          reasons: Array.isArray(c.reasons) ? c.reasons : [],
          metrics: c.metrics,
        });
      }
    },
    [runId, iter, device, committeeSize, topK, labelReference, pseudoDir, pseudosJson, qeInputTemplate, qeCommand, qeKpts, qeEcutwfc, qeEcutrho]
  );

  const runActiveLearningSteps = useCallback(async () => {
    if (!runId) return;
    if (activeLearningStopped) {
      setError("Active learning is stopped manually. Resume it to continue.");
      return;
    }
    const startIndex = ACTIVE_LEARNING_STEPS.findIndex((step) => stepStatus[step] !== "done");
    if (startIndex === -1) return;
    setIsRunningActiveLearning(true);
    setError(null);
    try {
      for (let i = startIndex; i < ACTIVE_LEARNING_STEPS.length; i++) {
        const step = ACTIVE_LEARNING_STEPS[i];
        setStepStatus((s) => ({ ...s, [step]: "running" }));
        try {
          await executeActiveLearningStep(step);
          setStepStatus((s) => ({ ...s, [step]: "done" }));
        } catch (err) {
          setError(err instanceof Error ? err.message : `${step} failed`);
          setStepStatus((s) => ({ ...s, [step]: "error" }));
          return;
        }
      }
    } finally {
      setIsRunningActiveLearning(false);
    }
  }, [runId, activeLearningStopped, stepStatus, executeActiveLearningStep]);

  const runNextIteration = useCallback(async () => {
    if (!runId || activeLearningStopped || isRunningActiveLearning) return;
    if (!Number.isFinite(maxEpochs) || maxEpochs <= 0) {
      setError("Max epochs must be a positive number.");
      return;
    }
    setActiveLearningStopped(false);
    setIsRunningActiveLearning(false);
    setIsTraining(true);
    setError(null);
    setProgressLog([]);
    setMetrics([]);
    setConvergence(null); // Reset convergence for new iteration
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
          maxEpochs: Math.max(1, Math.floor(maxEpochs)),
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
  }, [runId, iter, committeeSize, device, maxEpochs, fineTune, freezeInitPath, activeLearningStopped, isRunningActiveLearning]);

  const stopActiveLearning = useCallback(() => {
    setActiveLearningStopped(true);
    setError(null);
  }, []);

  const resumeActiveLearning = useCallback(() => {
    setActiveLearningStopped(false);
    setError(null);
  }, []);

  const downloadUrl =
    runId && checkpoints.length > 0
      ? activeLearning
        ? `/api/mace-freeze/checkpoint?runId=${encodeURIComponent(runId)}&runName=c0&iter=${iter}`
        : `/api/mace-freeze/checkpoint?runId=${encodeURIComponent(runId)}&runName=${encodeURIComponent(runName || "web_train")}`
      : null;
  const cannotStart =
    isTraining ||
    isPreviewLoading ||
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
          training epochs are fully customizable. Labeling supports MACE-MP-0 (demo) or Quantum ESPRESSO.
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
          <div className="mt-4 max-w-xs">
            <label className="mb-1 block font-mono text-xs text-zinc-500">Max epochs (custom)</label>
            <input
              type="number"
              min={1}
              value={maxEpochs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                setMaxEpochs(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
              }}
              className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
            />
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
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Freeze preset</label>
                    <select
                      value={freezePreset}
                      onChange={(e) => applyFreezePreset(e.target.value as FreezePreset)}
                      className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                    >
                      <option value="conservative">Conservative</option>
                      <option value="recommended">Recommended</option>
                      <option value="aggressive">Aggressive</option>
                      <option value="custom">Custom</option>
                    </select>
                    {freezePreset !== "custom" && (
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">
                        {FREEZE_PRESETS[freezePreset as Exclude<FreezePreset, "custom">].hint}
                      </p>
                    )}
                  </div>
                  {!trainBaseFirst && (
                    <div className="flex items-end">
                      <Button
                        type="button"
                        onClick={() => void runFreezePreview(false)}
                        className="w-full font-mono border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                      >
                        {isPreviewLoading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Previewing freeze...
                          </span>
                        ) : (
                          "Preview freeze"
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {availableFreezeModules.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-2 font-mono text-xs text-zinc-500">Auto-discovered modules (freeze)</p>
                      <div className="flex flex-wrap gap-2">
                        {availableFreezeModules.map((pattern) => {
                          const active = freezePatterns.includes(pattern);
                          return (
                            <button
                              key={`f-${pattern}`}
                              type="button"
                              onClick={() => togglePattern("freeze", pattern)}
                              className={`rounded border px-2 py-1 font-mono text-xs ${
                                active
                                  ? "border-matrix-green bg-matrix-green/20 text-matrix-green"
                                  : "border-zinc-700 bg-black/40 text-zinc-300 hover:border-zinc-500"
                              }`}
                            >
                              {pattern}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 font-mono text-xs text-zinc-500">Auto-discovered modules (unfreeze override)</p>
                      <div className="flex flex-wrap gap-2">
                        {availableFreezeModules.map((pattern) => {
                          const active = unfreezePatterns.includes(pattern);
                          return (
                            <button
                              key={`u-${pattern}`}
                              type="button"
                              onClick={() => togglePattern("unfreeze", pattern)}
                              className={`rounded border px-2 py-1 font-mono text-xs ${
                                active
                                  ? "border-amber-400 bg-amber-400/20 text-amber-300"
                                  : "border-zinc-700 bg-black/40 text-zinc-300 hover:border-zinc-500"
                              }`}
                            >
                              {pattern}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Add custom freeze patterns</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customFreezeInput}
                        onChange={(e) => setCustomFreezeInput(e.target.value)}
                        placeholder="e.g. embedding radial"
                        className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                      />
                      <Button type="button" onClick={() => addCustomPattern("freeze")} className="font-mono">
                        Add
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-xs text-zinc-500">Add custom unfreeze patterns</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customUnfreezeInput}
                        onChange={(e) => setCustomUnfreezeInput(e.target.value)}
                        placeholder="e.g. readout"
                        className="w-full rounded border border-zinc-700 bg-black/50 px-3 py-2 font-mono text-sm text-white focus:border-matrix-green focus:outline-none"
                      />
                      <Button type="button" onClick={() => addCustomPattern("unfreeze")} className="font-mono">
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 font-mono text-xs text-zinc-500">Selected freeze patterns</p>
                    <div className="flex min-h-10 flex-wrap gap-2 rounded border border-zinc-800 bg-black/30 p-2">
                      {freezePatterns.map((pattern) => (
                        <button
                          key={`freeze-selected-${pattern}`}
                          type="button"
                          onClick={() => togglePattern("freeze", pattern)}
                          className="rounded border border-matrix-green/50 bg-matrix-green/10 px-2 py-1 font-mono text-xs text-matrix-green"
                        >
                          {pattern} ×
                        </button>
                      ))}
                      {freezePatterns.length === 0 && (
                        <span className="font-mono text-xs text-zinc-500">No freeze patterns selected.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 font-mono text-xs text-zinc-500">Selected unfreeze patterns</p>
                    <div className="flex min-h-10 flex-wrap gap-2 rounded border border-zinc-800 bg-black/30 p-2">
                      {unfreezePatterns.map((pattern) => (
                        <button
                          key={`unfreeze-selected-${pattern}`}
                          type="button"
                          onClick={() => togglePattern("unfreeze", pattern)}
                          className="rounded border border-amber-400/50 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-300"
                        >
                          {pattern} ×
                        </button>
                      ))}
                      {unfreezePatterns.length === 0 && (
                        <span className="font-mono text-xs text-zinc-500">No unfreeze patterns selected.</span>
                      )}
                    </div>
                  </div>
                </div>

                {!trainBaseFirst && freezePreview && (
                  <div
                    className={`rounded border p-3 ${
                      (freezePreview.warning || freezePreview.num_frozen_params === 0)
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-matrix-green/40 bg-matrix-green/10"
                    }`}
                  >
                    <p className="font-mono text-sm text-zinc-200">
                      Freeze preview: {freezePreview.num_frozen_params} / {freezePreview.num_total_params} parameters will be frozen.
                    </p>
                    {(freezePreview.warning || freezePreview.num_frozen_params === 0) && (
                      <p className="mt-1 font-mono text-xs text-amber-300">
                        Warning: patterns currently match nothing or too little. Check selected modules before training.
                      </p>
                    )}
                  </div>
                )}

                {trainBaseFirst && (
                  <p className="font-mono text-xs text-zinc-500">
                    Preview is available when using an existing base checkpoint path. With "Train base model first",
                    freeze validation appears after base model creation.
                  </p>
                )}
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-base font-bold text-violet-400">
                Active learning — iteration {iter}
              </h2>
              {stepStatus.append === "done" && (
                <Badge
                  variant="outline"
                  className={
                    activeLearningStopped
                      ? "border-emerald-500/50 bg-emerald-500/10 font-mono text-emerald-300"
                      : "border-amber-500/50 bg-amber-500/10 font-mono text-amber-300"
                  }
                >
                  {activeLearningStopped ? "Stopped manually" : "Ready for next iteration"}
                </Badge>
              )}
            </div>
            <p className="font-mono text-xs text-zinc-400">
              Steps 5–7: disagreement → select top-K → label ({labelReference === "qe" ? "Quantum ESPRESSO" : "MACE-MP-0"}) → append
            </p>

            {/* When to stop guide — always visible for active learning */}
            <div className="rounded border border-zinc-700/60 bg-zinc-900/40 p-3">
              <h4 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
                When to stop active learning
              </h4>
              <ul className="space-y-1 font-mono text-[11px] text-zinc-400">
                <li>• MAE force &lt; 50 meV/Å and disagreement is low → model is accurate</li>
                <li>• Committee disagreement (max) &lt; 10 meV/Å → models agree on pool</li>
                <li>• Pool exhausted (no high-uncertainty structures left) → little to gain</li>
                <li>• Stop manually when the model looks good for your use case</li>
              </ul>
            </div>

            {/* Validation MAE summary — from training metrics or convergence */}
            {(metrics.length > 0 || convergence?.metrics) && (
              <div className="rounded border border-zinc-700/60 bg-black/40 p-3">
                <h4 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-violet-400">
                  Validation metrics (iteration {iter})
                </h4>
                <div className="flex flex-wrap gap-4 font-mono text-xs">
                  {convergence?.metrics?.validation_mae_energy != null && (
                    <span className="text-zinc-300">
                      MAE Energy: <strong className="text-cyan-400">{convergence.metrics.validation_mae_energy.toFixed(1)}</strong> meV/atom
                    </span>
                  )}
                  {convergence?.metrics?.validation_mae_force != null && (
                    <span className="text-zinc-300">
                      MAE Force: <strong className="text-violet-400">{convergence.metrics.validation_mae_force.toFixed(1)}</strong> meV/Å
                    </span>
                  )}
                  {!convergence?.metrics?.validation_mae_energy && metrics.length > 0 && (
                    <>
                      <span className="text-zinc-300">
                        Last MAE Energy: <strong className="text-cyan-400">{metrics[metrics.length - 1]?.mae_energy?.toFixed(1) ?? "—"}</strong> meV/atom
                      </span>
                      <span className="text-zinc-300">
                        Last MAE Force: <strong className="text-violet-400">{metrics[metrics.length - 1]?.mae_force?.toFixed(1) ?? "—"}</strong> meV/Å
                      </span>
                    </>
                  )}
                  {convergence?.metrics?.disagreement_max != null && (
                    <span className="text-zinc-300">
                      Disagreement max: <strong className="text-amber-400">{convergence.metrics.disagreement_max.toFixed(2)}</strong> meV/Å
                    </span>
                  )}
                  {convergence?.metrics?.pool_size != null && (
                    <span className="text-zinc-500">Pool: {convergence.metrics.pool_size} structures</span>
                  )}
                </div>
              </div>
            )}

            {/* Convergence hint — suggest stop when criteria met */}
            {convergence?.suggest_stop && (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3">
                <p className="font-mono text-sm font-bold text-emerald-300">
                  Convergence criteria met — consider stopping
                </p>
                <ul className="mt-2 space-y-1 font-mono text-xs text-emerald-200/90">
                  {convergence.reasons.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
                <p className="mt-2 font-mono text-[11px] text-zinc-400">
                  Click &quot;Stop active learning here&quot; below if the model looks good.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {ACTIVE_LEARNING_STEPS.map((step) => (
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
                    {stepStatus[step] === "pending" && <span className="font-mono text-xs text-zinc-500">Pending</span>}
                    {stepStatus[step] === "running" && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
                  </div>
                </div>
              ))}
            </div>
            {stepStatus.append !== "done" && (
              <Button
                onClick={runActiveLearningSteps}
                disabled={isTraining || isRunningActiveLearning || activeLearningStopped}
                className="mt-4 w-full border-2 border-matrix-green/50 bg-matrix-green/10 font-mono text-matrix-green hover:bg-matrix-green/20"
              >
                {isRunningActiveLearning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                {stepStatus.disagreement === "error" || stepStatus.select === "error" || stepStatus.label === "error" || stepStatus.append === "error"
                  ? "Retry steps 5-8 (continue from failed step)"
                  : "Run steps 5-8 automatically"}
              </Button>
            )}
            {stepStatus.append === "done" && (
              <div className="mt-4 space-y-3">
                {!activeLearningStopped ? (
                  <>
                    <Button
                      onClick={runNextIteration}
                      disabled={isTraining || isRunningActiveLearning}
                      className="w-full border-2 border-amber-500/50 bg-amber-500/10 font-mono text-amber-400 hover:bg-amber-500/20"
                    >
                      {isTraining ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Next iteration ({iter + 1}) — train committee on expanded data
                    </Button>
                    <Button
                      type="button"
                      onClick={stopActiveLearning}
                      disabled={isTraining || isRunningActiveLearning}
                      className="w-full border border-emerald-500/50 bg-emerald-500/10 font-mono text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Stop active learning here (model looks good)
                    </Button>
                  </>
                ) : (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <p className="font-mono text-xs text-emerald-300">
                      Active learning stopped manually at iteration {iter}. You can download the checkpoint below or resume later.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={resumeActiveLearning}
                      className="mt-3 font-mono border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                    >
                      Resume active learning
                    </Button>
                  </div>
                )}
              </div>
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
