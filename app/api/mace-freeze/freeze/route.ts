/**
 * POST /api/mace-freeze/freeze
 *
 * Create a freeze-init checkpoint from an existing model checkpoint using
 * mace-api/MACE_Freeze/mace_freeze.py.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
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

interface FreezeParams {
  runId: string;
  checkpointPath?: string;
  runName?: string;
  iter?: number;
  freezePatterns?: string[];
  unfreezePatterns?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as FreezeParams;
    if (!params.runId) {
      return NextResponse.json({ error: "runId is required." }, { status: 400 });
    }

    let inCkpt: string;
    if (params.checkpointPath) {
      inCkpt = params.checkpointPath;
    } else {
      const base = join(MACE_FREEZE_DIR, "runs_web", params.runId);
      if (params.iter != null) {
        const iterStr = String(params.iter).padStart(2, "0");
        const resolved = await resolveCheckpoint(join(base, `iter_${iterStr}`, params.runName ?? "c0", "checkpoints"));
        inCkpt = resolved ?? join(base, `iter_${iterStr}`, params.runName ?? "c0", "checkpoints", "best.pt");
      } else {
        const resolved = await resolveCheckpoint(join(base, params.runName ?? "web_train", "checkpoints"));
        inCkpt = resolved ?? join(base, params.runName ?? "web_train", "checkpoints", "best.pt");
      }
    }

    if (!existsSync(inCkpt)) {
      return NextResponse.json(
        { error: `Checkpoint not found: ${inCkpt}` },
        { status: 404 }
      );
    }

    const freezeDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, "freeze");
    mkdirSync(freezeDir, { recursive: true });
    const freezeInitPath = join(freezeDir, "freeze_init.pt");
    const freezePlanPath = join(freezeDir, "freeze_plan.json");

    const freezePatterns = params.freezePatterns?.length ? params.freezePatterns : ["embedding", "radial"];
    const unfreezePatterns = params.unfreezePatterns?.length ? params.unfreezePatterns : ["readout"];

    const args = [
      join(MACE_FREEZE_DIR, "mace_freeze.py"),
      "--in_ckpt", inCkpt,
      "--out_ckpt", freezeInitPath,
      "--out_plan", freezePlanPath,
      "--freeze", ...freezePatterns,
    ];
    if (unfreezePatterns.length > 0) {
      args.push("--unfreeze", ...unfreezePatterns);
    }

    await execFileAsync(process.env.PYTHON ?? "python3", args, { cwd: MACE_FREEZE_DIR });

    let freezePlan: unknown = null;
    try {
      const fs = await import("node:fs/promises");
      freezePlan = JSON.parse(await fs.readFile(freezePlanPath, "utf-8"));
    } catch {
      freezePlan = null;
    }

    return NextResponse.json({
      success: true,
      inputCheckpoint: inCkpt,
      freezeInitPath,
      freezePlanPath,
      freezePlan,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Freeze failed" },
      { status: 500 }
    );
  }
}
