import { NextRequest, NextResponse } from "next/server";

// Reuse the same MACE_API_URL env var as /api/calculate
const MACE_API_URL = (() => {
  const url = process.env.MACE_API_URL?.trim();
  if (!url) return undefined;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
})();

/**
 * POST /api/generate-surface
 *
 * Accepts JSON body with:
 *   - xyzData: string (extended-XYZ of bulk structure)
 *   - h, k, l: number (Miller indices)
 *   - slabThickness: number (Angstroms)
 *   - vacuumThickness: number (Angstroms)
 *
 * Mode selection:
 * 1. MACE_API_URL set → forward to remote backend (Vercel deployment)
 * 2. MACE_API_URL not set → run locally via Python subprocess
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { xyzData, h, k, l, slabThickness, vacuumThickness } = body;

    if (!xyzData || typeof xyzData !== "string") {
      return NextResponse.json(
        { error: "Missing xyzData" },
        { status: 400 }
      );
    }

    // ── Remote backend (Railway / any hosted MACE API) ──
    if (MACE_API_URL) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60 * 1000);

      try {
        const response = await fetch(`${MACE_API_URL}/generate-surface`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xyzData,
            h: h ?? 1,
            k: k ?? 0,
            l: l ?? 0,
            slabThickness: slabThickness ?? 12,
            vacuumThickness: vacuumThickness ?? 15,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          throw new Error(err || `Remote API error: ${response.status}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error) throw err;
        throw new Error("Remote surface generation request failed");
      }
    }

    // ── Local mode: run via Python subprocess ──
    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const scriptPath = join(
      process.cwd(),
      "mace-api",
      "generate_surface.py"
    );

    const pythonCmd = await findPython(execFileAsync);

    const args = JSON.stringify({
      xyzData,
      h: h ?? 1,
      k: k ?? 0,
      l: l ?? 0,
      slabThickness: slabThickness ?? 12,
      vacuumThickness: vacuumThickness ?? 15,
    });

    const { stdout, stderr } = await execFileAsync(
      pythonCmd,
      [scriptPath, args],
      {
        timeout: 60 * 1000, // 60s timeout
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      }
    );

    if (stderr) {
      console.warn("[generate-surface stderr]", stderr.slice(0, 500));
    }

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(stdout || "No JSON output from surface generator");
    }

    const data = JSON.parse(stdout.slice(jsonStart));

    if (data.status === "error") {
      return NextResponse.json(
        { error: data.message || "Surface generation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Surface generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Surface generation failed",
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Python executable resolver (same logic as /api/calculate)
// ---------------------------------------------------------------------------

let _cachedPython: string | null = null;

async function findPython(
  execFileAsync: (cmd: string, args: string[]) => Promise<{ stdout: string }>
): Promise<string> {
  if (_cachedPython) return _cachedPython;

  const candidates = [
    "python3",
    "python",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3",
    "/usr/bin/python3",
    "py",
  ];

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"]);
      _cachedPython = cmd;
      console.log(`[generate-surface] Using Python: ${cmd}`);
      return cmd;
    } catch {
      // try next
    }
  }

  throw new Error(
    "Python not found. Install Python 3.10+ and ensure python3 is on your PATH."
  );
}
