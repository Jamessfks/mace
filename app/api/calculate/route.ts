import { NextRequest, NextResponse } from "next/server";
import type { CalculationResult } from "@/types/mace";

const MACE_API_URL = process.env.MACE_API_URL;

/**
 * MACE Calculation API
 * POST /api/calculate
 *
 * Accepts multipart/form-data with:
 * - files: structure files (.xyz, .cif, etc.)
 * - params: JSON string of CalculationParams
 *
 * If MACE_API_URL is set, forwards to Python MACE backend.
 * Otherwise returns mock data for development.
 *
 * Note: On Vercel, request body is limited to 4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE).
 * Keep total upload size under ~4 MB; client enforces this.
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

    const params = JSON.parse(paramsStr);

    // Call Python MACE API if configured
    if (MACE_API_URL) {
      const maceFormData = new FormData();
      files.forEach((file) => maceFormData.append("files", file));
      maceFormData.append("params", paramsStr);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 min

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
        return NextResponse.json(data);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error("MACE API request failed");
      }
    }

    // Fallback: mock data (when MACE_API_URL not set)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockResult: CalculationResult = {
      status: "success",
      energy: -156.234567,
      forces: [
        [0.0123, -0.0045, 0.0067],
        [-0.0089, 0.0134, -0.0023],
        [0.0045, -0.0078, 0.0091],
        [-0.0012, 0.0056, -0.0034],
      ],
      positions: [
        [0, 0, 0],
        [1.5, 0, 0],
        [0, 1.5, 0],
        [0, 0, 1.5],
      ],
      symbols: ["O", "H", "H", "C"],
      properties: {
        volume: 125.6,
        density: 0.98,
      },
      message: `Calculation completed for ${files[0].name} (mock — set MACE_API_URL for real MACE)`,
    };

    return NextResponse.json(mockResult);
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
    endpoints: {
      POST: "/api/calculate - Submit calculation",
    },
    status: "operational",
  });
}
