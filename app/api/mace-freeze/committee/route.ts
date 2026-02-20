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
  maxEpochs?: number;
  modelPath?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as CommitteeParams;
    const parsedMaxEpochs = Number(params.maxEpochs);
    const maxEpochs =
      Number.isFinite(parsedMaxEpochs) && parsedMaxEpochs > 0
        ? String(Math.floor(parsedMaxEpochs))
        : "";
    const dataDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, "data");
    if (!existsSync(dataDir) || !existsSync(join(dataDir, "train.xyz"))) {
      return new Response(
        JSON.stringify({ error: "Data directory or train.xyz not found. Run initial training first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RUN_ID: params.runId,
      ITER: String(params.iter ?? 0),
      COMMITTEE_SIZE: String(params.committeeSize ?? 2),
      DATA_DIR: dataDir,
      DEVICE: params.device || "cpu",
      QUICK_DEMO: "0",
      MAX_EPOCHS: maxEpochs,
      MODEL_PATH: params.modelPath ?? "",
      PYTHONUNBUFFERED: "1",
    };

    const scriptPath = join(MACE_FREEZE_DIR, "run_committee_web.py");
    let child: ReturnType<typeof spawn> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        child = spawn(
          process.env.PYTHON ?? "python3",
          [scriptPath],
          { cwd: MACE_FREEZE_DIR, env }
        );
        const proc = child;
        let buffer = "";
        let streamClosed = false;
        let lastPythonError: string | null = null;
        const send = (line: string) => {
          if (streamClosed || !line.trim()) return;
          try {
            controller.enqueue(`data: ${line}\n\n`);
            try {
              const parsed = JSON.parse(line) as { event?: string; message?: string };
              if (parsed?.event === "error" && typeof parsed.message === "string") {
                lastPythonError = parsed.message;
              }
            } catch {
              /* not JSON */
            }
          } catch {
            streamClosed = true;
          }
        };
        const closeStream = () => {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {}
        };
        proc.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(send);
        });
        proc.on("error", (err: Error) => {
          send(JSON.stringify({ event: "error", message: err.message || "Committee process failed" }));
          closeStream();
        });
        proc.on("close", (code: number | null) => {
          if (buffer.trim()) send(buffer.trim());
          if (code && code !== 0) {
            const msg = lastPythonError
              ? `${lastPythonError} (exit code ${code})`
              : `Committee process exited with code ${code}. Check the log above for details.`;
            send(JSON.stringify({ event: "error", message: msg }));
          }
          closeStream();
        });
        proc.stderr?.on("data", (chunk: Buffer) => {
          send(JSON.stringify({ event: "log", message: chunk.toString().trim() }));
        });
      },
      cancel() {
        if (child && !child.killed) {
          child.kill("SIGTERM");
        }
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
