/**
 * POST /api/mace-freeze/label
 *
 * Run label_with_reference.py to compute energies/forces for to_label.xyz
 * using either MACE-MP-0/EMT (demo) or Quantum ESPRESSO (DFT) via ASE.
 * Writes labeled_new.xyz with TotEnergy and force keys.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const MACE_FREEZE_DIR = join(process.cwd(), "mace-api", "MACE_Freeze");
const execFileAsync = promisify(execFile);

interface LabelParams {
  runId: string;
  iter: number;
  reference?: string;
  device: string;
  pseudoDir?: string;
  pseudosJson?: string;
  inputTemplate?: string;
  qeCommand?: string;
  kpts?: string;
  ecutwfc?: number;
  ecutrho?: number;
  qeWorkdir?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = body as LabelParams;
    const iterStr = String(params.iter).padStart(2, "0");
    const workDir = join(MACE_FREEZE_DIR, "runs_web", params.runId, `iter_${iterStr}`);
    const toLabelPath = join(workDir, "to_label.xyz");
    const outputPath = join(workDir, "labeled_new.xyz");

    if (!existsSync(toLabelPath)) {
      return NextResponse.json(
        { error: "to_label.xyz not found. Run active learning selection first." },
        { status: 400 }
      );
    }

    const args = [
      join(MACE_FREEZE_DIR, "label_with_reference.py"),
      "--input", toLabelPath,
      "--output", outputPath,
      "--reference", params.reference ?? "mace-mp",
      "--device", params.device || "cpu",
    ];
    if (params.pseudoDir) args.push("--pseudo_dir", params.pseudoDir);
    if (params.pseudosJson) args.push("--pseudos_json", params.pseudosJson);
    if (params.inputTemplate) args.push("--input_template", params.inputTemplate);
    if (params.qeCommand) args.push("--qe_command", params.qeCommand);
    if (params.kpts) args.push("--kpts", params.kpts);
    if (typeof params.ecutwfc === "number") args.push("--ecutwfc", String(params.ecutwfc));
    if (typeof params.ecutrho === "number") args.push("--ecutrho", String(params.ecutrho));
    if (params.qeWorkdir) args.push("--qe_workdir", params.qeWorkdir);

    await execFileAsync(process.env.PYTHON ?? "python3", args, { cwd: MACE_FREEZE_DIR });

    return NextResponse.json({
      success: true,
      labeledPath: outputPath,
      reference: params.reference ?? "mace-mp",
    });
  } catch (err) {
    const maybeErr = err as { message?: string; stderr?: string };
    const detail = maybeErr?.stderr?.trim();
    return NextResponse.json(
      { error: detail || (err instanceof Error ? err.message : "Labeling failed") },
      { status: 500 }
    );
  }
}
