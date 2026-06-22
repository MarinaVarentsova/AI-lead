/**
 * Supabase Browser Client — FRONTEND ONLY
 *
 * Uses the public anon key — safe to expose in browser code.
 * Row Level Security applies to all queries made with this client.
 *
 * This client is prepared for Phase 2 features:
 * - Real-time subscriptions
 * - Auth (if added later)
 * - Direct table reads where RLS permits
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set."
  );
}

/**
 * Browser-safe Supabase client.
 * Only uses the anon key — never the service role key.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
