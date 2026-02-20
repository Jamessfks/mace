/**
 * POST /api/mace-freeze/active-learning
 *
 * Run mace_active_learning.py to select top-K uncertain structures.
 * Writes to_label.xyz in the iteration directory.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";

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

interface ActiveLearningParams {
  runId: string;
  iter: number;
  committeeSize: number;
  k: number;
  device: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as ActiveLearningParams;
    const iterStr = String(params.iter).padStart(2, "0");
    const workDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, `iter_${iterStr}`);
    const poolPath = join(MACE_FREEZE_DIR, "runs_web", params.runId, "data", "pool.xyz");
    const outSelected = join(workDir, "to_label.xyz");

    if (!existsSync(poolPath)) {
      return NextResponse.json(
        { error: "pool.xyz not found." },
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
        { error: "Need at least 2 committee checkpoints." },
        { status: 400 }
      );
    }

    await execFileAsync(
      process.env.PYTHON ?? "python3",
      [
        join(MACE_FREEZE_DIR, "mace_active_learning.py"),
        "--models", ...models,
        "--pool_xyz", poolPath,
        "--out_selected", outSelected,
        "--k", String(params.k ?? 5),
        "--device", params.device || "cpu",
      ],
      { cwd: MACE_FREEZE_DIR }
    );

    return NextResponse.json({
      success: true,
      toLabelPath: outSelected,
      k: params.k,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Active learning selection failed" },
      { status: 500 }
    );
  }
}
