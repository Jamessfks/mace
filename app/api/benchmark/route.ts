/**
 * Benchmark API — Batch MACE calculation endpoint.
 *
 * Accepts 2–3 models and a set of structure IDs (from ml-peg catalog)
 * plus optional user-uploaded structure files. Runs every (model, structure)
 * pair sequentially and returns a unified BenchmarkResult.
 *
 * Dual-mode: forwards to MACE_API_URL when set (Railway), otherwise
 * spawns local Python subprocesses via calculate_local.py.
 *
 * Error resilience: individual calculation failures are caught and
 * recorded as status:"error" without aborting the batch.
 */

import { NextRequest, NextResponse } from "next/server";
import { getEntriesByIds } from "@/lib/mlpeg-catalog";
import type {
  BenchmarkResult,
  BenchmarkStructureResult,
  BenchmarkModelResult,
  CalculationResult,
  ModelType,
  ModelSize,
} from "@/types/mace";

const MACE_API_URL = (() => {
  const url = process.env.MACE_API_URL?.trim();
  if (!url) return undefined;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
})();

interface BenchmarkRequestModel {
  type: ModelType;
  size: ModelSize;
}

interface BenchmarkRequestBody {
  models: BenchmarkRequestModel[];
  structureIds: string[];
  calculationType?: string;
}

function modelLabel(m: BenchmarkRequestModel): string {
  if (m.type === "custom") return `Custom (${m.size})`;
  return `${m.type} (${m.size})`;
}

function computeRmsForce(forces: number[][] | undefined): number {
  if (!forces || forces.length === 0) return 0;
  const sumSq = forces.reduce(
    (s, f) => s + f[0] * f[0] + f[1] * f[1] + f[2] * f[2],
    0
  );
  return Math.sqrt(sumSq / forces.length);
}

function computeMaxForce(forces: number[][] | undefined): number {
  if (!forces || forces.length === 0) return 0;
  let max = 0;
  for (const f of forces) {
    const mag = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    if (mag > max) max = mag;
  }
  return max;
}

async function runCalculationLocal(
  structureData: string,
  structureFilename: string,
  model: BenchmarkRequestModel,
  calculationType: string,
  customModelPath?: string
): Promise<CalculationResult> {
  const { writeFile, mkdtemp, unlink, rmdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const os = await import("node:os");
  const execFileAsync = promisify(execFile);

  const tmpDir = await mkdtemp(join(os.tmpdir(), "mace-bench-"));
  const tmpPath = join(tmpDir, structureFilename);
  await writeFile(tmpPath, structureData);

  const params = JSON.stringify({
    modelType: model.type,
    modelSize: model.size,
    calculationType,
    precision: "float64",
    device: "cpu",
    dispersion: false,
  });

  const scriptPath = join(process.cwd(), "mace-api", "calculate_local.py");

  try {
    const args = [scriptPath, tmpPath, params];
    if (model.type === "custom" && customModelPath) {
      args.push("--model-path", customModelPath);
    }

    const { stdout, stderr } = await execFileAsync(
      "python3",
      args,
      {
        timeout: 10 * 60 * 1000,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      }
    );
    if (stderr) console.warn("[Benchmark local stderr]", stderr.slice(0, 300));

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("No JSON output from MACE");
    return JSON.parse(stdout.slice(jsonStart));
  } finally {
    try {
      await unlink(tmpPath);
      await rmdir(tmpDir);
    } catch {}
  }
}

async function runCalculationRemote(
  structureData: string,
  structureFilename: string,
  model: BenchmarkRequestModel,
  calculationType: string
): Promise<CalculationResult> {
  const blob = new Blob([structureData], { type: "chemical/x-xyz" });
  const file = new File([blob], structureFilename, { type: "chemical/x-xyz" });

  const formData = new FormData();
  formData.append("files", file);
  formData.append(
    "params",
    JSON.stringify({
      modelType: model.type,
      modelSize: model.size,
      calculationType,
      precision: "float64",
      device: "cpu",
      dispersion: false,
    })
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const response = await fetch(`${MACE_API_URL}/calculate`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `MACE API error: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * POST /api/benchmark
 *
 * Runs multiple MACE models across multiple structures in a batch,
 * collecting energy, forces, and timing for each (model, structure) pair.
 */
export async function POST(request: NextRequest) {
  let customModelPath: string | undefined;

  try {
    let body: BenchmarkRequestBody;
    let modelFile: File | null = null;
    let structureFiles: File[] = [];

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const jsonStr = formData.get("json") as string;
      body = JSON.parse(jsonStr);
      modelFile = formData.get("model") as File | null;
      structureFiles = formData.getAll("structures") as File[];
    } else {
      body = await request.json();
    }

    const { models, structureIds, calculationType = "single-point" } = body;

    if (!models || models.length < 2 || models.length > 3) {
      return NextResponse.json(
        { error: "Provide 2 or 3 models to benchmark" },
        { status: 400 }
      );
    }

    const hasStructureIds = structureIds && structureIds.length > 0;
    const hasStructureFiles = structureFiles.length > 0;

    if (!hasStructureIds && !hasStructureFiles) {
      return NextResponse.json(
        { error: "Provide at least one structure (catalog selection or file upload)" },
        { status: 400 }
      );
    }

    // Write custom model file to disk if provided
    if (modelFile) {
      const { writeFile, mkdtemp } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const os = await import("node:os");
      const tmpDir = await mkdtemp(join(os.tmpdir(), "mace-model-"));
      customModelPath = join(tmpDir, modelFile.name);
      const modelBuffer = Buffer.from(await modelFile.arrayBuffer());
      await writeFile(customModelPath, modelBuffer);
    }

    // Read user-uploaded structure files into memory
    const userStructures: { id: string; name: string; filename: string; data: string; atomCount: number }[] = [];
    for (const sf of structureFiles) {
      const text = await sf.text();
      const lines = text.trim().split("\n");
      let atomCount = 0;
      try { atomCount = parseInt(lines[0], 10) || lines.length - 2; } catch { atomCount = 0; }
      const baseName = sf.name.replace(/\.[^.]+$/, "");
      userStructures.push({
        id: `user-${baseName}`,
        name: sf.name,
        filename: sf.name,
        data: text,
        atomCount: Math.max(atomCount, 1),
      });
    }

    // Build the catalog entries list
    const catalogEntries = hasStructureIds ? getEntriesByIds(structureIds) : [];
    const totalEntryCount = catalogEntries.length + userStructures.length;

    if (totalEntryCount === 0) {
      return NextResponse.json(
        { error: "No valid structures found" },
        { status: 400 }
      );
    }

    const results: BenchmarkStructureResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    const batchStart = Date.now();

    // --- Run catalog structures ---
    for (const entry of catalogEntries) {
      const modelResults: BenchmarkModelResult[] = [];

      for (const model of models) {
        const calcStart = Date.now();
        try {
          const calcResult = MACE_API_URL
            ? await runCalculationRemote(entry.xyzData, `${entry.id}.xyz`, model, calculationType)
            : await runCalculationLocal(entry.xyzData, `${entry.id}.xyz`, model, calculationType, customModelPath);

          if (calcResult.status === "error") {
            errorCount++;
            modelResults.push({
              modelLabel: modelLabel(model),
              modelType: model.type,
              modelSize: model.size,
              status: "error",
              error: calcResult.message || "Calculation returned error",
              timeTaken: (Date.now() - calcStart) / 1000,
            });
            continue;
          }

          const atomCount = calcResult.symbols?.length ?? entry.atomCount;
          const ePerAtom =
            calcResult.energy != null && atomCount > 0
              ? calcResult.energy / atomCount
              : undefined;

          successCount++;
          modelResults.push({
            modelLabel: modelLabel(model),
            modelType: model.type,
            modelSize: model.size,
            status: "success",
            energy: calcResult.energy,
            energyPerAtom: ePerAtom,
            forces: calcResult.forces,
            symbols: calcResult.symbols,
            rmsForce: computeRmsForce(calcResult.forces),
            maxForce: computeMaxForce(calcResult.forces),
            timeTaken: calcResult.timeTaken ?? (Date.now() - calcStart) / 1000,
          });
        } catch (err) {
          errorCount++;
          let errMsg = err instanceof Error ? err.message : "Unknown error";
          if (/element|not supported|species|atomic number/i.test(errMsg)) {
            errMsg +=
              " (This model may not support the elements in this structure." +
              " MACE-OFF only supports H, C, N, O, F, P, S, Cl, Br, I.)";
          }
          modelResults.push({
            modelLabel: modelLabel(model),
            modelType: model.type,
            modelSize: model.size,
            status: "error",
            error: errMsg,
            timeTaken: (Date.now() - calcStart) / 1000,
          });
        }
      }

      results.push({
        structureId: entry.id,
        structureName: entry.name,
        category: entry.category,
        formula: entry.formula,
        atomCount: entry.atomCount,
        reference: entry.reference,
        models: modelResults,
      });
    }

    // --- Run user-uploaded structures ---
    for (const us of userStructures) {
      const modelResults: BenchmarkModelResult[] = [];

      for (const model of models) {
        const calcStart = Date.now();
        try {
          const calcResult = MACE_API_URL
            ? await runCalculationRemote(us.data, us.filename, model, calculationType)
            : await runCalculationLocal(us.data, us.filename, model, calculationType, customModelPath);

          if (calcResult.status === "error") {
            errorCount++;
            modelResults.push({
              modelLabel: modelLabel(model),
              modelType: model.type,
              modelSize: model.size,
              status: "error",
              error: calcResult.message || "Calculation returned error",
              timeTaken: (Date.now() - calcStart) / 1000,
            });
            continue;
          }

          const atomCount = calcResult.symbols?.length ?? us.atomCount;
          const ePerAtom =
            calcResult.energy != null && atomCount > 0
              ? calcResult.energy / atomCount
              : undefined;

          successCount++;
          modelResults.push({
            modelLabel: modelLabel(model),
            modelType: model.type,
            modelSize: model.size,
            status: "success",
            energy: calcResult.energy,
            energyPerAtom: ePerAtom,
            forces: calcResult.forces,
            symbols: calcResult.symbols,
            rmsForce: computeRmsForce(calcResult.forces),
            maxForce: computeMaxForce(calcResult.forces),
            timeTaken: calcResult.timeTaken ?? (Date.now() - calcStart) / 1000,
          });
        } catch (err) {
          errorCount++;
          let errMsg = err instanceof Error ? err.message : "Unknown error";
          if (/element|not supported|species|atomic number/i.test(errMsg)) {
            errMsg +=
              " (This model may not support the elements in this structure." +
              " MACE-OFF only supports H, C, N, O, F, P, S, Cl, Br, I.)";
          }
          modelResults.push({
            modelLabel: modelLabel(model),
            modelType: model.type,
            modelSize: model.size,
            status: "error",
            error: errMsg,
            timeTaken: (Date.now() - calcStart) / 1000,
          });
        }
      }

      results.push({
        structureId: us.id,
        structureName: us.name,
        category: "uploaded",
        formula: us.name,
        atomCount: us.atomCount,
        models: modelResults,
      });
    }

    const totalTime = (Date.now() - batchStart) / 1000;
    const totalCalculations = models.length * totalEntryCount;

    const benchmarkResult: BenchmarkResult = {
      status:
        errorCount === 0
          ? "success"
          : errorCount === totalCalculations
            ? "error"
            : "partial",
      results,
      summary: {
        totalStructures: totalEntryCount,
        totalModels: models.length,
        totalCalculations,
        successCount,
        errorCount,
        totalTime,
      },
    };

    return NextResponse.json(benchmarkResult);
  } catch (error) {
    console.error("Benchmark error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Benchmark failed" },
      { status: 500 }
    );
  } finally {
    if (customModelPath) {
      try {
        const { unlink } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        const { rmdir } = await import("node:fs/promises");
        await unlink(customModelPath);
        await rmdir(dirname(customModelPath));
      } catch {}
    }
  }
}
