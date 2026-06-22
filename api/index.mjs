/**
 * Vercel Serverless Function entry point (plain JavaScript).
 *
 * Imports the pre-built esbuild bundle of the Express app so Vercel does NOT
 * try to TypeScript-compile the server source (which uses moduleResolution:bundler,
 * incompatible with Vercel's nodenext mode).
 *
 * The bundle is produced by `pnpm --filter @workspace/api-server run build`
 * (runs before this function is deployed, see vercel.json buildCommand).
 */
export { default } from "../artifacts/api-server/dist/app.mjs";
