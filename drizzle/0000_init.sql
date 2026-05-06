CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"session_id" uuid,
	"client_event_id" text,
	"name" text NOT NULL,
	"anonymous_id" text,
	"player_id" text,
	"build_id" text,
	"origin" text,
	"page_url" text,
	"referrer" text,
	"user_agent" text,
	"ip_hash" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"external_session_id" text,
	"anonymous_id" text,
	"player_id" text,
	"build_id" text,
	"origin" text,
	"page_url" text,
	"referrer" text,
	"user_agent" text,
	"ip_hash" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"public_write_key" text,
	"allowed_origins" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_events_game_received_at_idx" ON "game_events" USING btree ("game_id","received_at");--> statement-breakpoint
CREATE INDEX "game_events_game_name_received_at_idx" ON "game_events" USING btree ("game_id","name","received_at");--> statement-breakpoint
CREATE INDEX "game_events_game_session_received_at_idx" ON "game_events" USING btree ("game_id","session_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_game_client_event_idx" ON "game_events" USING btree ("game_id","client_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_sessions_game_external_session_idx" ON "game_sessions" USING btree ("game_id","external_session_id");--> statement-breakpoint
CREATE INDEX "game_sessions_game_started_at_idx" ON "game_sessions" USING btree ("game_id","started_at");
