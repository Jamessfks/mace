import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/generate-surface
 *
 * Accepts JSON body with:
 *   - xyzData: string (extended-XYZ of bulk structure)
 *   - h, k, l: number (Miller indices)
 *   - slabThickness: number (Angstroms)
 *   - vacuumThickness: number (Angstroms)
 *
 * Runs ASE surface builder via Python subprocess.
 * Returns JSON: { status, xyzData, atomCount, message }
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

    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const scriptPath = join(
      process.cwd(),
      "mace-api",
      "generate_surface.py"
    );

    const args = JSON.stringify({
      xyzData,
      h: h ?? 1,
      k: k ?? 0,
      l: l ?? 0,
      slabThickness: slabThickness ?? 12,
      vacuumThickness: vacuumThickness ?? 15,
    });

    const { stdout, stderr } = await execFileAsync(
      "python3",
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
