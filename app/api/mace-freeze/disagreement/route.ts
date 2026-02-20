/**
 * POST /api/mace-freeze/disagreement
 *
 * Run model_disagreement.py on pool.xyz with committee checkpoints.
 * Returns per-structure scores (higher = more uncertain).
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");
const execFileAsync = promisify(execFile);

interface DisagreementParams {
  runId: string;
  iter: number;
  committeeSize: number;
  device: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as DisagreementParams;
    const workDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, `iter_${String(params.iter).padStart(2, "0")}`);
    const poolPath = join(MACE_FREEZE_DIR, "runs_web", params.runId, "data", "pool.xyz");
    const outJson = join(workDir, "pool_disagreement.json");

    if (!existsSync(poolPath)) {
      return NextResponse.json(
        { error: "pool.xyz not found. Enable splitWithPool in initial training." },
        { status: 400 }
      );
    }

    const models: string[] = [];
    for (let i = 0; i < params.committeeSize; i++) {
      const ckpt = join(workDir, `c${i}`, "checkpoints", "best.pt");
      if (existsSync(ckpt)) models.push(ckpt);
    }
    if (models.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 committee checkpoints. Run committee training first." },
        { status: 400 }
      );
    }

    await execFileAsync(
      process.env.PYTHON ?? "python3",
      [
        join(MACE_FREEZE_DIR, "model_disagreement.py"),
        "--models", ...models,
        "--xyz", poolPath,
        "--out_json", outJson,
        "--device", params.device || "cpu",
        "--score", "force_rms_std",
      ],
      { cwd: MACE_FREEZE_DIR }
    );

    const fs = await import("node:fs/promises");
    const json = await fs.readFile(outJson, "utf-8");
    const data = JSON.parse(json);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Disagreement calculation failed" },
      { status: 500 }
    );
  }
}
