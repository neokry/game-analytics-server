import { cors } from "hono/cors";
import { Hono } from "hono";
import { db } from "./db/client.js";
import { ingestEvents } from "./http/ingest.js";

export const app = new Hono();

app.use(
  "/v1/*",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["content-type", "x-game-key"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 600
  })
);

app.get("/", (c) =>
  c.json({
    name: "analytics-server",
    endpoints: ["/health", "/ready", "/v1/games/:gameSlug/events"]
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.get("/ready", async (c) => {
  try {
    await db.execute("select 1");
    return c.json({ ok: true, database: "reachable" });
  } catch {
    return c.json({ ok: false, database: "unreachable" }, 503);
  }
});

app.post("/v1/games/:gameSlug/events", ingestEvents);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});
