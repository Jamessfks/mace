/**
 * POST /api/mace-freeze/committee
 *
 * Train a committee of models (different seeds) for active learning.
 * Requires runId and data_dir (path to runs_web/{runId}/data).
 * Streams progress as SSE.
 */

import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");

interface CommitteeParams {
  runId: string;
  iter: number;
  committeeSize?: number;
  device: string;
  quickDemo: boolean;
  modelPath?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as CommitteeParams;
    const dataDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, "data");
    if (!existsSync(dataDir) || !existsSync(join(dataDir, "train.xyz"))) {
      return new Response(
        JSON.stringify({ error: "Data directory or train.xyz not found. Run initial training first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const env: Record<string, string> = {
      ...process.env,
      RUN_ID: params.runId,
      ITER: String(params.iter ?? 0),
      COMMITTEE_SIZE: String(params.committeeSize ?? 2),
      DATA_DIR: dataDir,
      DEVICE: params.device || "cpu",
      QUICK_DEMO: params.quickDemo !== false ? "1" : "0",
      MODEL_PATH: params.modelPath ?? "",
      PYTHONUNBUFFERED: "1",
    };

    const scriptPath = join(MACE_FREEZE_DIR, "run_committee_web.py");
    const stream = new ReadableStream({
      start(controller) {
        const child = spawn(
          process.env.PYTHON ?? "python3",
          [scriptPath],
          { cwd: MACE_FREEZE_DIR, env }
        );
        let buffer = "";
        const send = (line: string) => {
          if (line.trim()) controller.enqueue(`data: ${line}\n\n`);
        };
        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(send);
        });
        child.on("close", () => {
          if (buffer.trim()) send(buffer.trim());
          controller.close();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          send(JSON.stringify({ event: "log", message: chunk.toString().trim() }));
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
      JSON.stringify({ error: err instanceof Error ? err.message : "Committee training failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
