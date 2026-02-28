/**
 * Supabase client — singleton browser/server client for MACE Link.
 *
 * Uses the public anon key (safe to expose client-side) with RLS policies
 * controlling read/write access on the `shared_results` table.
 */

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
