/**
 * MACE Link — persist and retrieve shared calculation results.
 *
 * Uses Supabase `shared_results` table (jsonb) with nanoid-generated 8-char IDs.
 * Results are publicly readable (RLS policy) so anyone with the URL can view them.
 *
 * ── Supabase SQL (run once in the Supabase SQL editor) ──────────────────────
 *
 *   create table shared_results (
 *     id text primary key,
 *     result jsonb not null,
 *     params jsonb not null default '{}',
 *     filename text,
 *     created_at timestamptz not null default now()
 *   );
 *   alter table shared_results enable row level security;
 *   create policy "Anyone can read shared results"
 *     on shared_results for select using (true);
 *   create policy "Anyone can insert shared results"
 *     on shared_results for insert with check (true);
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from "nanoid";
import { supabase } from "@/lib/supabase";
import type { CalculationResult, CalculationParams, SharedResult } from "@/types/mace";

const BASE_URL = "https://mace-lake.vercel.app";

/** Save a calculation result and return its shareable URL. */
export async function saveResult(
  result: CalculationResult,
  params: Partial<CalculationParams>,
  filename?: string
): Promise<{ id: string; url: string }> {
  const id = nanoid(8);

  const { error } = await supabase.from("shared_results").insert({
    id,
    result,
    params,
    filename: filename ?? null,
  });

  if (error) throw new Error(`Failed to save result: ${error.message}`);

  return { id, url: `${BASE_URL}/r/${id}` };
}

/** Load a previously shared result by ID. Returns null if not found. */
export async function loadResult(id: string): Promise<SharedResult | null> {
  const { data, error } = await supabase
    .from("shared_results")
    .select("id, result, params, filename, created_at")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return data as SharedResult;
}
