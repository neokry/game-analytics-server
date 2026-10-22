import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { findGame, type GameConfig } from "../games.js";
import type { EventRecord, EventSink } from "../sink.js";
import { isOriginAllowed, normalizeOrigin } from "./origins.js";
import { privacyModeForCountry, sanitizeReducedProperties, stripUrlDetails } from "./privacy.js";
import { ingestBodySchema, normalizeEvents } from "./validation.js";

export function createIngestHandler(sink: EventSink) {
  return async function ingestEvents(c: Context) {
    const gameSlug = c.req.param("gameSlug");
    if (!gameSlug) {
      return c.json({ error: "Missing game slug" }, 400);
    }

    const game = findGame(gameSlug);
    if (!game || !game.active) {
      return c.json({ error: "Unknown game" }, 404);
    }

    const origin = normalizeOrigin(c.req.header("origin"));
    if (!isOriginAllowed(origin, game.allowedOrigins)) {
      return c.json({ error: "Origin is not allowed for this game" }, 403);
    }

    if (!hasValidWriteKey(c, game)) {
      return c.json({ error: "Invalid game key" }, 401);
    }

    const body = ingestBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid payload", details: body.error.flatten() }, 400);
    }

    const now = Date.now();
    const country = c.req.header("cloudfront-viewer-country") ?? null;
    const privacyMode = privacyModeForCountry(country);
    const reducedPrivacy = privacyMode === "reduced";
    const events = normalizeEvents(body.data);
    const sessionId = body.data.sessionId ?? events.find((event) => event.sessionId)?.sessionId ?? null;
    const anonymousId = reducedPrivacy
      ? null
      : body.data.anonymousId ?? events.find((event) => event.anonymousId)?.anonymousId ?? null;
    const playerId = reducedPrivacy
      ? null
      : body.data.playerId ?? events.find((event) => event.playerId)?.playerId ?? null;
    const buildId = body.data.buildId ?? events.find((event) => event.buildId)?.buildId ?? null;
    const userAgent = reducedPrivacy
      ? null
      : body.data.context?.userAgent ?? c.req.header("user-agent") ?? null;
    const pageUrl = reducedPrivacy
      ? stripUrlDetails(body.data.context?.pageUrl)
      : body.data.context?.pageUrl ?? null;
    const referrer = reducedPrivacy
      ? stripUrlDetails(body.data.context?.referrer)
      : body.data.context?.referrer ?? null;
    const sessionProperties = reducedPrivacy
      ? sanitizeReducedProperties(body.data.sessionProperties)
      : body.data.sessionProperties;
    const dt = new Date(now).toISOString().slice(0, 10);

    const records: EventRecord[] = events.map((event) => ({
      event_id: randomUUID(),
      game: game.slug,
      dt,
      name: event.name,
      client_event_id: event.clientEventId ?? null,
      session_id: event.sessionId ?? sessionId,
      anonymous_id: reducedPrivacy ? null : event.anonymousId ?? anonymousId,
      player_id: reducedPrivacy ? null : event.playerId ?? playerId,
      build_id: event.buildId ?? buildId,
      origin,
      page_url: pageUrl,
      referrer,
      user_agent: userAgent,
      country,
      privacy_mode: privacyMode,
      properties: JSON.stringify(
        reducedPrivacy ? sanitizeReducedProperties(event.properties) : event.properties
      ),
      session_properties: JSON.stringify(sessionProperties),
      occurred_at: event.occurredAt ? Date.parse(event.occurredAt) : now,
      received_at: now
    }));

    await sink.put(records);

    // Duplicate client events are dropped at query time (see athena/views.sql).
    return c.json({
      accepted: records.length,
      duplicate: 0,
      sessionId
    });
  };
}

function hasValidWriteKey(c: Context, game: GameConfig): boolean {
  if (!game.publicWriteKey) return true;
  return c.req.header("x-game-key") === game.publicWriteKey;
}
