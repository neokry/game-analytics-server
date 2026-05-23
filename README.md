# Analytics Server

Shared analytics ingestion service for browser games deployed on itch.io and hosted on Railway with Railway Postgres.

## Shape

- `games` controls the game slug, enabled state, allowed browser origins, and optional public write key.
- `game_sessions` stores one row per game play session when the client sends a `sessionId`.
- `game_events` stores generic event rows with flexible `jsonb` properties.

The first client endpoint is batch-first:

```http
POST /v1/games/:gameSlug/events
```

```json
{
  "sessionId": "session_123",
  "anonymousId": "anon_abc",
  "buildId": "itch-2026-05-06",
  "context": {
    "pageUrl": "https://neokry.itch.io/dead-letters",
    "referrer": "https://itch.io"
  },
  "events": [
    {
      "name": "session_start",
      "properties": {
        "mode": "singleplayer"
      }
    },
    {
      "name": "level_started",
      "properties": {
        "level": 1
      }
    }
  ]
}
```

Single-event payloads are also accepted:

```json
{
  "sessionId": "session_123",
  "name": "button_clicked",
  "properties": {
    "button": "play"
  }
}
```

## Origin Allowlist

The server rejects browser requests whose `Origin` is not listed on the `games.allowed_origins` row. This is useful for limiting normal browser traffic to your itch.io pages, but it is not a secret. Non-browser callers can forge headers. If a game needs stronger protection later, add a server-side proxy or a signed request flow.

For itch.io HTML5 games, the page can be `https://neokry.itch.io`, while the embedded game may execute from an itch CDN origin such as `https://html-classic.itch.zone`. The current Dead Letters page embeds the fullscreen game from `https://html-classic.itch.zone/html/17381590-1656681/index.html`. Allowlist the actual `Origin` shown in rejected server logs.

Wildcard subdomains are supported:

```text
https://*.itch.zone
```

## Reduced Privacy Regions

The ingest server applies reduced privacy mode centrally based on the request IP's country lookup. EU countries, the UK, Switzerland, and nearby high-risk European microstates are reduced by default. Unknown IP lookups are also reduced.

Reduced mode still accepts session-scoped gameplay events, but it does not persist cross-session/player identifiers or request metadata that is more privacy-sensitive:

- `anonymousId` and `playerId` are dropped.
- IP hashes are not stored.
- User agents are not stored.
- `pageUrl` and `referrer` keep only origin + path.
- Obvious URL/error-message fields are stripped from event/session properties.

This means individual games do not need to implement their own region checks to avoid persistent analytics IDs for these regions.

## Local Setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
ALLOWED_ORIGINS=http://localhost:5173,https://neokry.itch.io,https://*.itch.zone npm run seed:game
npm run dev
```

## Railway Setup

Create a Railway service from this folder and attach Railway Postgres. Set:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
ALLOW_MISSING_ORIGIN=false
IP_HASH_SALT=<random long secret>
```

The included `railway.json` starts the server with:

```bash
npm run db:migrate && npm run start
```

Seed the first game after the database is available:

```bash
GAME_SLUG=dead-letters GAME_NAME="Dead Letters" ALLOWED_ORIGINS=https://neokry.itch.io,https://*.itch.zone npm run seed:game
```

## Event Naming

Use stable, lower-case names like:

- `session_start`
- `session_end`
- `level_started`
- `level_completed`
- `run_started`
- `run_ended`
- `choice_made`
- `error_seen`

Put game-specific details in `properties`, not in the event name.
