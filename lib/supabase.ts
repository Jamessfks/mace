/**
 * Supabase client — singleton for the community calculation database.
 *
 * Uses the ANON (publishable) key so the client can be used in both
 * server components / API routes and client components.
 *
 * Environment variables (set in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase publishable anon key
 *
 * Row Level Security (RLS) on the Supabase side controls access:
 *   - Anyone can INSERT (share a calculation)
 *   - Anyone can SELECT where is_public = true
 *   - Only authenticated users (future) can UPDATE/DELETE their own rows
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Singleton Supabase client
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns the Supabase client, or null if env vars are missing.
 * This graceful fallback means the app works without Supabase configured
 * — the community features simply won't appear.
 *
 * We use an untyped client here to avoid complex generic constraints
 * with Supabase's generated types. The API routes handle validation
 * and type-checking at the application level instead.
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  if (!supabaseUrl || !supabaseKey) {
    if (typeof window !== "undefined") {
      console.warn(
        "[Community DB] Supabase env vars not set — community features disabled."
      );
    }
    return null;
  }

  _client = createClient(supabaseUrl, supabaseKey);
  return _client;
}
