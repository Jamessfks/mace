/**
 * POST /api/mace-freeze/train
 *
 * Local-only: runs MACE training via mace-api/MACE_Freeze/run_training_web.py.
 * Streams JSON progress events as Server-Sent Events for live graphs.
 * Do not deploy this to Vercel/Railway for production training.
 */

import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");
const UPLOADS_DIR = join(MACE_FREEZE_DIR, "data_uploads");

interface TrainParams {
  useBundled: boolean;
  runName: string;
  seed: number;
  device: string;
  quickDemo: boolean;
  /** Enable pool split for active learning (train/valid/pool) */
  splitWithPool?: boolean;
  poolFraction?: number;
  /** Train committee (multiple models) for active learning */
  committee?: boolean;
  committeeSize?: number;
  iter?: number;
  /** Fine-tune from a freeze-init checkpoint workflow */
  fineTune?: boolean;
  /** Train a base model first (then run mace_freeze.py) */
  trainBaseFirst?: boolean;
  /** Optional existing base checkpoint path */
  baseCheckpointPath?: string;
  /** Optional existing freeze-init checkpoint path */
  freezeInitPath?: string;
  /** Freeze/unfreeze patterns for mace_freeze.py */
  freezePatterns?: string[];
  unfreezePatterns?: string[];
}

export async function POST(request: NextRequest) {
  let runId: string;
  let datasetPath: string | null = null;

  try {
    const formData = await request.formData();
    const paramsStr = formData.get("params") as string;
    const file = formData.get("file") as File | null;

    if (!paramsStr) {
      return new Response(
        JSON.stringify({ error: "Missing params" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const params: TrainParams = JSON.parse(paramsStr);
    runId = randomUUID();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RUN_ID: runId,
      USE_BUNDLED: params.useBundled ? "1" : "0",
      RUN_NAME: params.runName || "web_train",
      SEED: String(params.seed ?? 1),
      DEVICE: params.device || "cpu",
      QUICK_DEMO: params.quickDemo !== false ? "1" : "0",
      SPLIT_WITH_POOL: params.splitWithPool || params.committee ? "1" : "0",
      POOL_FRACTION: String(params.poolFraction ?? 0.2),
      COMMITTEE: params.committee ? "1" : "0",
      COMMITTEE_SIZE: String(params.committeeSize ?? 2),
      ITER: String(params.iter ?? 0),
      FINE_TUNE: params.fineTune ? "1" : "0",
      TRAIN_BASE_FIRST: params.trainBaseFirst !== false ? "1" : "0",
      BASE_CHECKPOINT_PATH: params.baseCheckpointPath ?? "",
      FREEZE_INIT_PATH: params.freezeInitPath ?? "",
      FREEZE_PATTERNS_JSON: JSON.stringify(params.freezePatterns ?? ["embedding", "radial"]),
      UNFREEZE_PATTERNS_JSON: JSON.stringify(params.unfreezePatterns ?? ["readout"]),
      PYTHONUNBUFFERED: "1",
    };

    if (!params.useBundled && file && file.size > 0) {
      await mkdir(UPLOADS_DIR, { recursive: true });
      const ext = file.name.toLowerCase().endsWith(".extxyz") ? ".extxyz" : ".xyz";
      datasetPath = join(UPLOADS_DIR, `${runId}${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(datasetPath, buf);
      env.DATASET_PATH = datasetPath;
    } else if (!params.useBundled) {
      return new Response(
        JSON.stringify({ error: "Upload a dataset file or use bundled data." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const scriptPath = join(MACE_FREEZE_DIR, "run_training_web.py");

    const stream = new ReadableStream({
      start(controller) {
        const child = spawn(
          process.env.PYTHON ?? "python3",
          [scriptPath],
          {
            cwd: MACE_FREEZE_DIR,
            env,
          }
        );

        let buffer = "";
        const sendLine = (line: string) => {
          if (line.trim()) {
            controller.enqueue(`data: ${line}\n\n`);
          }
        };

        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(sendLine);
        });

        child.on("close", (_code: number | null) => {
          if (buffer.trim()) sendLine(buffer.trim());
          controller.close();
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          sendLine(JSON.stringify({ event: "log", message: chunk.toString().trim() }));
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Training failed to start",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
