import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db/client.js";
import { games } from "../src/db/schema.js";

const slug = process.env.GAME_SLUG ?? "dead-letters";
const name = process.env.GAME_NAME ?? "Dead Letters";
const publicWriteKey = process.env.PUBLIC_WRITE_KEY || null;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  throw new Error("ALLOWED_ORIGINS is required, for example https://neokry.itch.io,https://html-classic.itch.zone");
}

const [game] = await db
  .insert(games)
  .values({
    slug,
    name,
    publicWriteKey,
    allowedOrigins
  })
  .onConflictDoUpdate({
    target: games.slug,
    set: {
      name,
      publicWriteKey,
      allowedOrigins,
      active: true,
      updatedAt: new Date()
    }
  })
  .returning({
    id: games.id,
    slug: games.slug,
    allowedOrigins: games.allowedOrigins
  });

const [saved] = await db.select().from(games).where(eq(games.id, game.id)).limit(1);

console.log(
  JSON.stringify(
    {
      id: saved.id,
      slug: saved.slug,
      name: saved.name,
      allowedOrigins: saved.allowedOrigins,
      publicWriteKeyConfigured: Boolean(saved.publicWriteKey)
    },
    null,
    2
  )
);

await closeDb();
