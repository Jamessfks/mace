/**
 * SMILES-to-XYZ API Route
 * POST /api/smiles-to-xyz
 *
 * Accepts JSON: { smiles: string }
 * Returns JSON: { status, xyz, atomCount, formula, smiles, molecularWeight, warning? }
 *
 * Converts a SMILES string to 3D XYZ coordinates via Python RDKit,
 * producing a structure file ready for the existing MACE calculation
 * pipeline. Follows the same subprocess pattern as /api/calculate.
 *
 * DATA FLOW:
 *   Browser → POST { smiles } → this route → python3 smiles_to_xyz.py <SMILES>
 *   → stdout JSON → NextResponse.json(data) → Browser creates File object
 *   → feeds into existing handleCalculate() / POST /api/calculate
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const smiles = body?.smiles;

    if (!smiles || typeof smiles !== "string" || !smiles.trim()) {
      return NextResponse.json(
        { status: "error", message: "Missing or empty 'smiles' parameter" },
        { status: 400 }
      );
    }

    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const scriptPath = join(process.cwd(), "mace-api", "smiles_to_xyz.py");

    let stdout: string;
    let stderr: string;
    try {
      const result = await execFileAsync(
        "python3",
        [scriptPath, smiles.trim()],
        {
          timeout: 30_000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        }
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execErr: any) {
      stdout = execErr.stdout ?? "";
      stderr = execErr.stderr ?? "";

      const jsonStart = stdout.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const errData = JSON.parse(stdout.slice(jsonStart));
          if (errData.message) {
            return NextResponse.json(
              { status: "error", message: errData.message },
              { status: 422 }
            );
          }
        } catch {
          // not valid JSON — fall through
        }
      }

      const stderrTail = stderr.trim().split("\n").pop() ?? "";
      const msg = stderrTail || stdout.trim().slice(0, 300) || "SMILES conversion failed";
      return NextResponse.json(
        { status: "error", message: msg },
        { status: 500 }
      );
    }

    if (stderr) {
      console.warn("[smiles-to-xyz stderr]", stderr.slice(0, 500));
    }

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      return NextResponse.json(
        { status: "error", message: stdout || "No JSON output from conversion script" },
        { status: 500 }
      );
    }

    const data = JSON.parse(stdout.slice(jsonStart));
    if (data.status === "error") {
      return NextResponse.json(data, { status: 422 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("SMILES-to-XYZ error:", error);
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Conversion failed" },
      { status: 500 }
    );
  }
}
