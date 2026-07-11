/**
 * lib/site.ts — canonical site origin.
 *
 * Env-driven with a runtime fallback, so shared/citation/export URLs point at
 * whatever domain the app is actually served from instead of a hardcoded host.
 *
 * Resolution order:
 *   1. The live browser origin (correct for any deployment or preview URL).
 *   2. `NEXT_PUBLIC_SITE_URL` (server / build time).
 *   3. The production fallback.
 */

export const FALLBACK_SITE_URL = "https://mace-lake.vercel.app";

export function getSiteUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL;
}
