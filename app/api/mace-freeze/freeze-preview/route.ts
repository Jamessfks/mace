/**
 * POST /api/mace-freeze/freeze-preview
 *
 * Preview freeze/unfreeze pattern matching for a checkpoint.
 * Returns frozen/total parameter counts and discovered module patterns.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");
const execFileAsync = promisify(execFile);

interface FreezePreviewParams {
  runId?: string;
  checkpointPath?: string;
  runName?: string;
  iter?: number;
  freezePatterns?: string[];
  unfreezePatterns?: string[];
}

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

async function resolveCheckpointPath(params: FreezePreviewParams): Promise<string | null> {
  if (params.checkpointPath) return params.checkpointPath;
  if (!params.runId) return null;
  const base = join(MACE_FREEZE_DIR, "runs_web", params.runId);
  if (params.iter != null) {
    const iterStr = String(params.iter).padStart(2, "0");
    const resolved = await resolveCheckpoint(join(base, `iter_${iterStr}`, params.runName ?? "c0", "checkpoints"));
    return resolved ?? join(base, `iter_${iterStr}`, params.runName ?? "c0", "checkpoints", "best.pt");
  }
  const resolved = await resolveCheckpoint(join(base, params.runName ?? "web_train", "checkpoints"));
  return resolved ?? join(base, params.runName ?? "web_train", "checkpoints", "best.pt");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FreezePreviewParams;
    const checkpointPath = await resolveCheckpointPath(body);
    if (!checkpointPath) {
      return NextResponse.json(
        { error: "checkpointPath or runId is required." },
        { status: 400 }
      );
    }
    if (!existsSync(checkpointPath)) {
      return NextResponse.json(
        { error: `Checkpoint not found: ${checkpointPath}` },
        { status: 404 }
      );
    }

    const freezePatterns =
      body.freezePatterns && body.freezePatterns.length > 0
        ? body.freezePatterns
        : ["embedding", "radial"];
    const unfreezePatterns =
      body.unfreezePatterns && body.unfreezePatterns.length > 0
        ? body.unfreezePatterns
        : ["readout"];

    const args = [
      join(MACE_FREEZE_DIR, "freeze_preview.py"),
      "--in_ckpt",
      checkpointPath,
      "--freeze",
      ...freezePatterns,
    ];
    if (unfreezePatterns.length > 0) args.push("--unfreeze", ...unfreezePatterns);

    const { stdout, stderr } = await execFileAsync(
      process.env.PYTHON ?? "python3",
      args,
      { cwd: MACE_FREEZE_DIR }
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return NextResponse.json(
        { error: stderr?.trim() || "Invalid freeze preview output." },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, ...parsed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Freeze preview failed" },
      { status: 500 }
    );
  }
}
