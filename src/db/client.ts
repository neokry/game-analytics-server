import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "../env.js";
import * as schema from "./schema.js";

export const sql = postgres(requireDatabaseUrl(), {
  max: 10,
  prepare: false
});

export const db = drizzle(sql, { schema });

export async function closeDb(): Promise<void> {
  await sql.end();
}
