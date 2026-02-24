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
  xyzData: string,
  structureId: string,
  model: BenchmarkRequestModel,
  calculationType: string
): Promise<CalculationResult> {
  const { writeFile, mkdtemp, unlink, rmdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const os = await import("node:os");
  const execFileAsync = promisify(execFile);

  const tmpDir = await mkdtemp(join(os.tmpdir(), "mace-bench-"));
  const tmpPath = join(tmpDir, `${structureId}.xyz`);
  await writeFile(tmpPath, xyzData);

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
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [scriptPath, tmpPath, params],
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
  xyzData: string,
  structureId: string,
  model: BenchmarkRequestModel,
  calculationType: string
): Promise<CalculationResult> {
  const blob = new Blob([xyzData], { type: "chemical/x-xyz" });
  const file = new File([blob], `${structureId}.xyz`, { type: "chemical/x-xyz" });

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
  try {
    const body: BenchmarkRequestBody = await request.json();
    const { models, structureIds, calculationType = "single-point" } = body;

    if (!models || models.length < 2 || models.length > 3) {
      return NextResponse.json(
        { error: "Provide 2 or 3 models to benchmark" },
        { status: 400 }
      );
    }

    if (!structureIds || structureIds.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one structure ID" },
        { status: 400 }
      );
    }

    const entries = getEntriesByIds(structureIds);
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No valid structure IDs found" },
        { status: 400 }
      );
    }

    const results: BenchmarkStructureResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    const batchStart = Date.now();

    for (const entry of entries) {
      const modelResults: BenchmarkModelResult[] = [];

      for (const model of models) {
        const calcStart = Date.now();
        try {
          const calcResult = MACE_API_URL
            ? await runCalculationRemote(entry.xyzData, entry.id, model, calculationType)
            : await runCalculationLocal(entry.xyzData, entry.id, model, calculationType);

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
            rmsForce: computeRmsForce(calcResult.forces),
            maxForce: computeMaxForce(calcResult.forces),
            timeTaken: calcResult.timeTaken ?? (Date.now() - calcStart) / 1000,
          });
        } catch (err) {
          errorCount++;
          modelResults.push({
            modelLabel: modelLabel(model),
            modelType: model.type,
            modelSize: model.size,
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
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
        models: modelResults,
      });
    }

    const totalTime = (Date.now() - batchStart) / 1000;
    const totalCalculations = models.length * entries.length;

    const benchmarkResult: BenchmarkResult = {
      status:
        errorCount === 0
          ? "success"
          : errorCount === totalCalculations
            ? "error"
            : "partial",
      results,
      summary: {
        totalStructures: entries.length,
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
  }
}
