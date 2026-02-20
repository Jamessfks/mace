/**
 * GET /api/mace-freeze/checkpoint?runId=xxx&runName=yyy
 *
 * Local-only: streams the best.pt checkpoint for a completed training run.
 * Used by the MACE Freeze page "Download checkpoint" button.
 */

import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { readdir, stat } from "node:fs/promises";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");

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

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  const runName = request.nextUrl.searchParams.get("runName") ?? "c0";
  const iterParam = request.nextUrl.searchParams.get("iter");

  if (!runId || /[^a-zA-Z0-9-]/.test(runId)) {
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
  }
  if (/[^a-zA-Z0-9_-]/.test(runName)) {
    return NextResponse.json({ error: "Invalid runName" }, { status: 400 });
  }

  const base = join(MACE_FREEZE_DIR, "runs_web", runId);
  const checkpointsDir =
    iterParam != null
      ? join(base, `iter_${String(iterParam).padStart(2, "0")}`, runName, "checkpoints")
      : join(base, runName, "checkpoints");
  const checkpointPath = await resolveCheckpoint(checkpointsDir);

  if (!checkpointPath || !existsSync(checkpointPath)) {
    return NextResponse.json(
      { error: "Checkpoint not found. Training may still be running or failed." },
      { status: 404 }
    );
  }

  const nodeStream = createReadStream(checkpointPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="mace-${runName}-best.pt"`,
    },
  });
}
