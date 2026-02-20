/**
 * POST /api/mace-freeze/disagreement
 *
 * Run model_disagreement.py on pool.xyz with committee checkpoints.
 * Returns per-structure scores (higher = more uncertain), aggregate stats,
 * and convergence status for active learning auto-stop.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readdir, stat, readFile } from "node:fs/promises";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");
const execFileAsync = promisify(execFile);

async function resolveCheckpoint(checkpointsDir: string): Promise<string | null> {
  const best = join(checkpointsDir, "best.pt");
  if (existsSync(best)) return best;
  if (!existsSync(checkpointsDir)) return null;
  const files = await readdir(checkpointsDir);
  const pts = files.filter((f) => f.toLowerCase().endsWith(".pt"));
  if (pts.length === 0) return null;
  const ranked = await Promise.all(
    pts.map(async (name) => {
      const full = join(checkpointsDir, name);
      const m = /epoch-(\d+)\.pt$/i.exec(name);
      const epoch = m ? Number(m[1]) : -1;
      const st = await stat(full);
      return { full, epoch, mtime: st.mtimeMs };
    })
  );
  ranked.sort((a, b) => (b.epoch - a.epoch) || (b.mtime - a.mtime));
  return ranked[0]?.full ?? null;
}

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
      const ckpt = await resolveCheckpoint(join(workDir, `c${i}`, "checkpoints"));
      if (ckpt) models.push(ckpt);
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

    const jsonStr = await readFile(outJson, "utf-8");
    const data = JSON.parse(jsonStr);

    // Run convergence check (non-blocking; include in response for UI)
    let convergence: Record<string, unknown> | null = null;
    try {
      const { stdout } = await execFileAsync(
        process.env.PYTHON ?? "python3",
        [
          join(MACE_FREEZE_DIR, "check_convergence.py"),
          "--run_id", params.runId,
          "--iter", String(params.iter),
          "--committee_size", String(params.committeeSize),
        ],
        { cwd: MACE_FREEZE_DIR, maxBuffer: 1024 * 1024 }
      );
      convergence = JSON.parse(stdout.trim()) as Record<string, unknown>;
    } catch {
      // Convergence check is best-effort; omit if script fails
    }

    return NextResponse.json({
      success: true,
      data,
      convergence: convergence ?? undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Disagreement calculation failed" },
      { status: 500 }
    );
  }
}
