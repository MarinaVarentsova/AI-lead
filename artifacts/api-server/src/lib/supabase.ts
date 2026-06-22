/**
 * Supabase Admin Client — BACKEND ONLY
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY which bypasses Row Level Security.
 * NEVER import this file from frontend code.
 * NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 *
 * Uses lazy initialization — the client is only created on first access,
 * so a missing env var does not crash the server on startup unless
 * the client is actually called.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

let _client: SupabaseClient | null = null;

/**
 * Returns the Supabase admin client (server-side, bypasses RLS).
 * Call this function fresh on every use — never cache the return value,
 * as the underlying token may be rotated.
 *
 * Throws if VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the backend."
    );
  }

  logger.info("Initializing Supabase admin client");
  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
