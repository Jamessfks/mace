import { NextRequest, NextResponse } from "next/server";

const MACE_API_URL = (() => {
  const url = process.env.MACE_API_URL?.trim();
  if (!url) return undefined;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
})();

/**
 * SMILES → XYZ Conversion API
 * POST /api/smiles-to-xyz
 *
 * Accepts JSON body: { smiles: string }
 * Returns JSON: { xyz, num_atoms, smiles_canonical, formula }
 *
 * Mode selection mirrors /api/calculate:
 * 1. MACE_API_URL set → forward to remote backend
 * 2. MACE_API_URL not set → run locally via Python subprocess
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const smiles = body?.smiles;

    if (!smiles || typeof smiles !== "string" || !smiles.trim()) {
      return NextResponse.json(
        { error: "Missing or empty 'smiles' field" },
        { status: 400 }
      );
    }

    // ── Remote backend ──
    if (MACE_API_URL) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

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
          throw new Error(err || `SMILES API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.status === "error") {
          throw new Error(data.message || "SMILES conversion failed");
        }
        return NextResponse.json(data);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error) throw err;
        throw new Error("SMILES API request failed");
      }
    }

    // ── Local mode: Python subprocess ──
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
          timeout: 60_000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PYTHONUNBUFFERED: "1", KMP_DUPLICATE_LIB_OK: "TRUE" },
        }
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execErr: unknown) {
      const err = execErr as { stdout?: string; stderr?: string };
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";

      const jsonStart = stdout.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const errData = JSON.parse(stdout.slice(jsonStart));
          if (errData.message || errData.error) {
            throw new Error(errData.message || errData.error);
          }
        } catch (parseErr) {
          if (!(parseErr instanceof SyntaxError)) throw parseErr;
        }
      }

      const stderrTail = stderr.trim().split("\n").pop() ?? "";
      throw new Error(
        stderrTail || stdout.trim().slice(0, 300) || "SMILES conversion failed"
      );
    }

    if (stderr) {
      console.warn("[SMILES conversion stderr]", stderr.slice(0, 500));
    }

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(stdout || "No JSON output from SMILES converter");
    }

    const data = JSON.parse(stdout.slice(jsonStart));
    if (data.status === "error") {
      throw new Error(data.message || "SMILES conversion returned an error");
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("SMILES conversion error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "SMILES conversion failed",
      },
      { status: 500 }
    );
  }
}
