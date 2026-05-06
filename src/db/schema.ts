import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export type JsonRecord = Record<string, unknown>;

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    publicWriteKey: text("public_write_key"),
    allowedOrigins: text("allowed_origins")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  }
);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    externalSessionId: text("external_session_id"),
    anonymousId: text("anonymous_id"),
    playerId: text("player_id"),
    buildId: text("build_id"),
    origin: text("origin"),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    properties: jsonb("properties").$type<JsonRecord>().notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    gameExternalSessionIdx: uniqueIndex("game_sessions_game_external_session_idx").on(
      table.gameId,
      table.externalSessionId
    ),
    gameStartedAtIdx: index("game_sessions_game_started_at_idx").on(table.gameId, table.startedAt)
  })
);

export const gameEvents = pgTable(
  "game_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    clientEventId: text("client_event_id"),
    name: text("name").notNull(),
    anonymousId: text("anonymous_id"),
    playerId: text("player_id"),
    buildId: text("build_id"),
    origin: text("origin"),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    properties: jsonb("properties").$type<JsonRecord>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    gameReceivedAtIdx: index("game_events_game_received_at_idx").on(table.gameId, table.receivedAt),
    gameNameReceivedAtIdx: index("game_events_game_name_received_at_idx").on(
      table.gameId,
      table.name,
      table.receivedAt
    ),
    gameSessionReceivedAtIdx: index("game_events_game_session_received_at_idx").on(
      table.gameId,
      table.sessionId,
      table.receivedAt
    ),
    gameClientEventIdx: uniqueIndex("game_events_game_client_event_idx").on(
      table.gameId,
      table.clientEventId
    )
  })
);
