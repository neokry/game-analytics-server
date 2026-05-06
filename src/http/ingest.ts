import { createHash } from "node:crypto";
import { eq, sql as drizzleSql } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/client.js";
import { gameEvents, games, gameSessions } from "../db/schema.js";
import { env } from "../env.js";
import { isOriginAllowed, normalizeOrigin } from "./origins.js";
import { ingestBodySchema, normalizeEvents } from "./validation.js";

type Game = typeof games.$inferSelect;

export async function ingestEvents(c: Context) {
  const gameSlug = c.req.param("gameSlug");
  if (!gameSlug) {
    return c.json({ error: "Missing game slug" }, 400);
  }

  const [game] = await db.select().from(games).where(eq(games.slug, gameSlug)).limit(1);

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

  const now = new Date();
  const requestUserAgent = c.req.header("user-agent") ?? undefined;
  const ipHash = hashIp(clientIp(c));
  const events = normalizeEvents(body.data);
  const sessionExternalId = body.data.sessionId ?? events.find((event) => event.sessionId)?.sessionId;
  const anonymousId = body.data.anonymousId ?? events.find((event) => event.anonymousId)?.anonymousId;
  const playerId = body.data.playerId ?? events.find((event) => event.playerId)?.playerId;
  const buildId = body.data.buildId ?? events.find((event) => event.buildId)?.buildId;
  const userAgent = body.data.context?.userAgent ?? requestUserAgent;

  const sessionId = sessionExternalId
    ? await upsertSession({
        game,
        externalSessionId: sessionExternalId,
        anonymousId,
        playerId,
        buildId,
        origin,
        pageUrl: body.data.context?.pageUrl,
        referrer: body.data.context?.referrer,
        userAgent,
        ipHash,
        properties: body.data.sessionProperties,
        lastSeenAt: now
      })
    : null;

  let accepted = 0;
  let duplicate = 0;

  for (const event of events) {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : now;
    const inserted = await db
      .insert(gameEvents)
      .values({
        gameId: game.id,
        sessionId,
        clientEventId: event.clientEventId,
        name: event.name,
        anonymousId: event.anonymousId ?? anonymousId,
        playerId: event.playerId ?? playerId,
        buildId: event.buildId ?? buildId,
        origin,
        pageUrl: body.data.context?.pageUrl,
        referrer: body.data.context?.referrer,
        userAgent,
        ipHash,
        properties: event.properties,
        occurredAt,
        receivedAt: now
      })
      .onConflictDoNothing({
        target: [gameEvents.gameId, gameEvents.clientEventId]
      })
      .returning({ id: gameEvents.id });

    if (inserted.length > 0) {
      accepted += 1;
    } else {
      duplicate += 1;
    }
  }

  return c.json({
    accepted,
    duplicate,
    sessionId
  });
}

function hasValidWriteKey(c: Context, game: Game): boolean {
  if (!game.publicWriteKey) return true;
  return c.req.header("x-game-key") === game.publicWriteKey;
}

async function upsertSession(input: {
  game: Game;
  externalSessionId: string;
  anonymousId?: string;
  playerId?: string;
  buildId?: string;
  origin: string | null;
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  ipHash: string | null;
  properties: Record<string, unknown>;
  lastSeenAt: Date;
}): Promise<string> {
  const [session] = await db
    .insert(gameSessions)
    .values({
      gameId: input.game.id,
      externalSessionId: input.externalSessionId,
      anonymousId: input.anonymousId,
      playerId: input.playerId,
      buildId: input.buildId,
      origin: input.origin,
      pageUrl: input.pageUrl,
      referrer: input.referrer,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
      properties: input.properties,
      lastSeenAt: input.lastSeenAt
    })
    .onConflictDoUpdate({
      target: [gameSessions.gameId, gameSessions.externalSessionId],
      set: {
        anonymousId: input.anonymousId,
        playerId: input.playerId,
        buildId: input.buildId,
        origin: input.origin,
        pageUrl: input.pageUrl,
        referrer: input.referrer,
        userAgent: input.userAgent,
        ipHash: input.ipHash,
        properties: drizzleSql`${gameSessions.properties} || ${JSON.stringify(input.properties)}::jsonb`,
        lastSeenAt: input.lastSeenAt
      }
    })
    .returning({ id: gameSessions.id });

  return session.id;
}

function clientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;

  return null;
}

function hashIp(ip: string | null): string | null {
  if (!ip || !env.ipHashSalt) return null;

  return createHash("sha256")
    .update(`${env.ipHashSalt}:${ip}`)
    .digest("hex");
}
