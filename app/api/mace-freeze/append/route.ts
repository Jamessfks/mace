/**
 * POST /api/mace-freeze/append
 *
 * Append labeled_new.xyz to train.xyz for the next iteration.
 * Creates train_next.xyz then replaces train.xyz.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

interface AppendParams {
  runId: string;
  iter: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as AppendParams;
    const iterStr = String(params.iter).padStart(2, "0");
    const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");
    const dataDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, "data");
    const workDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, `iter_${iterStr}`);
    const trainPath = join(dataDir, "train.xyz");
    const labeledPath = join(workDir, "labeled_new.xyz");
    const trainNextPath = join(dataDir, "train_next.xyz");

    if (!existsSync(trainPath)) {
      return NextResponse.json({ error: "train.xyz not found." }, { status: 400 });
    }
    if (!existsSync(labeledPath)) {
      return NextResponse.json({ error: "labeled_new.xyz not found. Run labeling first." }, { status: 400 });
    }

    const trainContent = await readFile(trainPath, "utf-8");
    const labeledContent = await readFile(labeledPath, "utf-8");
    const combined = trainContent.trimEnd() + "\n" + labeledContent.trimStart();
    await writeFile(trainNextPath, combined);
    await writeFile(trainPath, combined);

    const addedCount = (labeledContent.match(/^\d+\s*$/gm) ?? []).length;
    return NextResponse.json({
      success: true,
      trainPath,
      addedStructures: addedCount > 0 ? addedCount : 1,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Append failed" },
      { status: 500 }
    );
  }
}
