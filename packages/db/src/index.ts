import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: process.env.DATABASE_URL?.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(client, { schema });

export { sql } from "drizzle-orm";
export * from "./schema";
