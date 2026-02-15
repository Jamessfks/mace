import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * POST /api/community/share
 *
 * Accepts a JSON payload representing a completed MACE calculation
 * and inserts it into the community Supabase database.
 *
 * The payload is validated and sanitised server-side before insert.
 *
 * SCOPE: Currently handles General Calculator (/calculate) results only.
 * TODO: Add semiconductor page results (PropertyResult) in a future release.
 *       Semiconductor results would include additional fields:
 *       - bulk_modulus_gpa, vacancy_energy_ev, eos_data, material_id
 *       - reference comparison data (ref_value, error_pct, source)
 *
 * Request body: {
 *   formula, elements, atom_count, filename, file_format,
 *   model_type, model_size, calc_type, dispersion,
 *   energy_ev, energy_per_atom_ev, rms_force_ev_a, max_force_ev_a,
 *   volume_a3, calc_time_s,
 *   md_steps?, md_ensemble?, md_temperature_k?,
 *   contributor?, institution?, notes?
 * }
 *
 * Returns: { success: true, id: string } or { error: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json(
        { error: "Community database is not configured." },
        { status: 503 }
      );
    }

    const body = await request.json();

    // ── Validate required fields ──────────────────────────────────────────

    const required = [
      "formula",
      "elements",
      "atom_count",
      "filename",
      "file_format",
      "model_type",
      "calc_type",
    ] as const;

    for (const field of required) {
      if (body[field] == null || body[field] === "") {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // ── Sanitise & build insert payload ───────────────────────────────────

    const row = {
      // Structure metadata
      formula: String(body.formula).trim().slice(0, 100),
      elements: Array.isArray(body.elements)
        ? body.elements.map((e: unknown) => String(e).trim().slice(0, 4))
        : [],
      atom_count: Math.max(0, Math.round(Number(body.atom_count) || 0)),
      filename: String(body.filename).trim().slice(0, 200),
      file_format: String(body.file_format).trim().slice(0, 10),

      // Calculation parameters
      model_type: String(body.model_type).trim(),
      model_size: String(body.model_size || "small").trim(),
      calc_type: String(body.calc_type).trim(),
      dispersion: Boolean(body.dispersion),

      // Computed results (nullable)
      energy_ev: toNumberOrNull(body.energy_ev),
      energy_per_atom_ev: toNumberOrNull(body.energy_per_atom_ev),
      rms_force_ev_a: toNumberOrNull(body.rms_force_ev_a),
      max_force_ev_a: toNumberOrNull(body.max_force_ev_a),
      volume_a3: toNumberOrNull(body.volume_a3),
      calc_time_s: toNumberOrNull(body.calc_time_s),

      // MD-specific (nullable)
      md_steps: body.md_steps != null ? Math.round(Number(body.md_steps)) : null,
      md_ensemble: body.md_ensemble ? String(body.md_ensemble).trim() : null,
      md_temperature_k: toNumberOrNull(body.md_temperature_k),

      // Contributor metadata
      contributor: String(body.contributor || "Anonymous").trim().slice(0, 100),
      institution: body.institution
        ? String(body.institution).trim().slice(0, 200)
        : null,
      notes: body.notes ? String(body.notes).trim().slice(0, 1000) : null,
      is_public: true,
    };

    // ── Insert into Supabase ──────────────────────────────────────────────

    const { data, error } = await supabase
      .from("calculations")
      .insert(row as Record<string, unknown>)
      .select("id")
      .single();

    if (error) {
      console.error("[Community DB] Insert error:", error);
      return NextResponse.json(
        { error: "Failed to save calculation. Please try again." },
        { status: 500 }
      );
    }

    const insertedId = (data as Record<string, unknown> | null)?.id ?? null;
    return NextResponse.json({ success: true, id: insertedId });
  } catch (err) {
    console.error("[Community DB] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely convert a value to a finite number or null. */
function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
