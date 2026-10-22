import { cors } from "hono/cors";
import { Hono } from "hono";
import { createIngestHandler } from "./http/ingest.js";
import type { EventSink } from "./sink.js";

export function createApp(sink: EventSink) {
  const app = new Hono();

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
      endpoints: ["/health", "/v1/games/:gameSlug/events"]
    })
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/v1/games/:gameSlug/events", createIngestHandler(sink));

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
