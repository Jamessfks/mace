import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/community/list
 *
 * Fetches public community calculations with optional filters.
 *
 * Query params:
 *   formula      — partial match on formula (case-insensitive)
 *   calc_type    — exact match: "single-point", "geometry-opt", "molecular-dynamics"
 *   model_type   — exact match: "MACE-MP-0", "MACE-OFF"
 *   institution  — partial match on institution
 *   sort_by      — column to sort: "created_at" (default), "energy_ev", "atom_count", "formula"
 *   sort_dir     — "desc" (default) or "asc"
 *   limit        — max rows returned (default 50, max 200)
 *   offset       — pagination offset (default 0)
 *
 * Returns: { data: CommunityCalculation[], count: number }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json(
        { error: "Community database is not configured." },
        { status: 503 }
      );
    }

    const params = request.nextUrl.searchParams;

    // ── Parse query params ────────────────────────────────────────────────

    const formula = params.get("formula")?.trim();
    const calcType = params.get("calc_type")?.trim();
    const modelType = params.get("model_type")?.trim();
    const institution = params.get("institution")?.trim();

    const sortBy = params.get("sort_by") || "created_at";
    const sortDir = params.get("sort_dir") === "asc" ? true : false; // ascending?
    const limit = Math.min(Math.max(1, Number(params.get("limit")) || 50), 200);
    const offset = Math.max(0, Number(params.get("offset")) || 0);

    // ── Allowed sort columns (prevent SQL injection via column name) ──────

    const ALLOWED_SORT = ["created_at", "energy_ev", "atom_count", "formula"];
    const safeSortBy = ALLOWED_SORT.includes(sortBy) ? sortBy : "created_at";

    // ── Build query ───────────────────────────────────────────────────────

    let query = supabase
      .from("calculations")
      .select("*", { count: "exact" })
      .eq("is_public", true);

    if (formula) {
      query = query.ilike("formula", `%${formula}%`);
    }
    if (calcType) {
      query = query.eq("calc_type", calcType);
    }
    if (modelType) {
      query = query.eq("model_type", modelType);
    }
    if (institution) {
      query = query.ilike("institution", `%${institution}%`);
    }

    query = query
      .order(safeSortBy, { ascending: sortDir })
      .range(offset, offset + limit - 1);

    // ── Execute ───────────────────────────────────────────────────────────

    const { data, count, error } = await query;

    if (error) {
      console.error("[Community DB] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch calculations." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [], count: count ?? 0 });
  } catch (err) {
    console.error("[Community DB] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
