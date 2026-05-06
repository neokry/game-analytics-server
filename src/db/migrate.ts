import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "./client.js";

await migrate(db, { migrationsFolder: "drizzle" });
await closeDb();
