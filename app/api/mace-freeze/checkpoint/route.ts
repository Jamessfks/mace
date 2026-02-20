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

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  const runName = request.nextUrl.searchParams.get("runName") ?? "web_train";

  if (!runId || /[^a-zA-Z0-9-]/.test(runId)) {
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
  }
  if (/[^a-zA-Z0-9_-]/.test(runName)) {
    return NextResponse.json({ error: "Invalid runName" }, { status: 400 });
  }

  const checkpointPath = join(
    MACE_FREEZE_DIR,
    "runs_web",
    runId,
    runName,
    "checkpoints",
    "best.pt"
  );

  if (!existsSync(checkpointPath)) {
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
