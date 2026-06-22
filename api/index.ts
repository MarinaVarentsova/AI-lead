/**
 * Vercel Serverless Function entry point.
 *
 * Re-exports the Express app so Vercel wraps it as a serverless handler.
 * All /api/* requests are routed here via vercel.json rewrites.
 *
 * Required env vars on Vercel:
 *   DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY,
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
export { default } from "../artifacts/api-server/src/app";
