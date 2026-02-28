/**
 * SMILES-to-XYZ API Route
 * POST /api/smiles-to-xyz
 *
 * Accepts JSON: { smiles: string }
 * Returns JSON: { status, xyz, atomCount, formula, smiles, molecularWeight, warning? }
 *
 * Mode selection (same pattern as /api/calculate):
 *   1. MACE_API_URL set → forward to remote backend (e.g. Railway)
 *   2. MACE_API_URL not set → run locally via Python subprocess
 */

import { NextRequest, NextResponse } from "next/server";

const MACE_API_URL = (() => {
  const url = process.env.MACE_API_URL?.trim();
  if (!url) return undefined;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
})();

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

    // ── Remote backend (Railway / any hosted MACE API) ──
    if (MACE_API_URL) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(`${MACE_API_URL}/smiles-to-xyz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smiles: smiles.trim() }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          let message = "SMILES conversion failed on remote backend";
          try {
            const parsed = JSON.parse(err);
            message = parsed.detail || parsed.message || message;
          } catch {
            if (err) message = err.slice(0, 300);
          }
          return NextResponse.json(
            { status: "error", message },
            { status: response.status >= 400 && response.status < 500 ? 422 : 500 }
          );
        }

        const data = await response.json();
        if (data.status === "error") {
          return NextResponse.json(data, { status: 422 });
        }
        return NextResponse.json(data);
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        const message = fetchErr instanceof Error ? fetchErr.message : "Remote SMILES conversion failed";
        return NextResponse.json(
          { status: "error", message },
          { status: 500 }
        );
      }
    }

    // ── Local mode: run via Python subprocess ──
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
