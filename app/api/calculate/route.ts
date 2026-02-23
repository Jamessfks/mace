import { NextRequest, NextResponse } from "next/server";
import type { CalculationResult } from "@/types/mace";

const MACE_API_URL = (() => {
  const url = process.env.MACE_API_URL?.trim();
  if (!url) return undefined;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
})();

/**
 * MACE Calculation API
 * POST /api/calculate
 *
 * Accepts multipart/form-data with:
 * - files: structure files (.xyz, .cif, etc.)
 * - params: JSON string of CalculationParams
 *
 * Mode selection:
 * 1. MACE_API_URL set → forward to remote backend (e.g. Railway)
 * 2. MACE_API_URL not set → run MACE locally via Python subprocess
 *    (requires Python + mace-torch + ase installed on the machine)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const paramsStr = formData.get("params") as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    const modelFile = formData.get("model") as File | null;

    // ── Remote backend (Railway / any hosted MACE API) ──
    if (MACE_API_URL) {
      const maceFormData = new FormData();
      files.forEach((file) => maceFormData.append("files", file));
      maceFormData.append("params", paramsStr);
      if (modelFile) {
        maceFormData.append("model", modelFile);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

      try {
        const response = await fetch(`${MACE_API_URL}/calculate`, {
          method: "POST",
          body: maceFormData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          throw new Error(err || `MACE API error: ${response.status}`);
        }

        const data: CalculationResult = await response.json();
        // FIX: remote API may return HTTP 200 with status:"error" → surface it
        if (data.status === "error") {
          throw new Error(data.message || "MACE API returned an error");
        }
        return NextResponse.json(data);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error) throw err;
        throw new Error("MACE API request failed");
      }
    }

    // ── Local mode: run MACE on this machine via Python subprocess ──
    const { writeFile, mkdtemp, unlink, rmdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const os = await import("node:os");

    // Write uploaded file to a temp directory
    const tmpDir = await mkdtemp(join(os.tmpdir(), "mace-"));
    const file = files[0];
    const tmpPath = join(tmpDir, file.name);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, fileBuffer);

    // Handle custom model file if provided
    let modelPath: string | undefined;
    if (modelFile) {
      modelPath = join(tmpDir, modelFile.name);
      const modelBuffer = Buffer.from(await modelFile.arrayBuffer());
      await writeFile(modelPath, modelBuffer);
    }

    // Path to the local Python calculation script
    const scriptPath = join(process.cwd(), "mace-api", "calculate_local.py");

    try {
      const args = [scriptPath, tmpPath, paramsStr];
      if (modelPath) {
        args.push("--model-path", modelPath);
      }

      let stdout: string;
      let stderr: string;
      try {
        const result = await execFileAsync(
          "python3",
          args,
          {
            timeout: 60 * 60 * 1000,
            maxBuffer: 50 * 1024 * 1024,
            env: { ...process.env, PYTHONUNBUFFERED: "1" },
          }
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (execErr: any) {
        // execFile throws on non-zero exit; the Python script may have
        // printed a JSON error object to stdout before exiting
        stdout = execErr.stdout ?? "";
        stderr = execErr.stderr ?? "";

        const jsonStart = stdout.indexOf("{");
        if (jsonStart !== -1) {
          try {
            const errData = JSON.parse(stdout.slice(jsonStart));
            if (errData.message || errData.error) {
              throw new Error(errData.message || errData.error);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
              // not valid JSON — fall through
            } else {
              throw parseErr;
            }
          }
        }

        // Extract a human-readable message from stderr
        const stderrTail = stderr.trim().split("\n").pop() ?? "";
        const msg = stderrTail || stdout.trim().slice(0, 300) || "MACE calculation failed";
        throw new Error(msg);
      }

      if (stderr) {
        console.warn("[MACE local stderr]", stderr.slice(0, 500));
      }

      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) {
        throw new Error(stdout || "No JSON output from MACE");
      }
      const data: CalculationResult = JSON.parse(stdout.slice(jsonStart));
      // FIX: Python script may exit 0 but return status:"error" → surface it
      if (data.status === "error") {
        throw new Error(data.message || "MACE calculation returned an error");
      }
      return NextResponse.json(data);
    } finally {
      // Cleanup temp files
      try {
        await unlink(tmpPath);
        if (modelPath) {
          try { await unlink(modelPath); } catch {}
        }
        await rmdir(tmpDir);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    console.error("Calculation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calculation failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calculate - returns API info
 */
export async function GET() {
  return NextResponse.json({
    name: "MACE Calculation API",
    version: "1.0.0",
    mode: MACE_API_URL ? "remote" : "local",
    endpoints: {
      POST: "/api/calculate - Submit calculation",
    },
    status: "operational",
  });
}
