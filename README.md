# Analytics Server

Shared analytics ingestion for browser games deployed on itch.io, running serverless on AWS (account 360444545306, us-east-2):

```text
game -> CloudFront -> Lambda (Hono) -> Firehose -> S3 (Parquet, game/dt partitions) -> Athena
```

There is no database and no stored secret. The Lambda's role can only write to the Firehose stream; Firehose batches events for up to 5 minutes and writes Parquet files to S3.

## Shape

- Games are configured in `src/games.ts`: slug, enabled state, allowed browser origins, and optional public write key.
- Each accepted event becomes one row in the Athena table `game_analytics.events_raw`, with the session fields copied onto it. Event and session properties are stored as JSON strings.
- Athena views (`athena/views.sql`):
  - `events`: `events_raw` with client retries removed (first copy per `client_event_id`).
  - `sessions`: one row per game session, derived from its events.

The client endpoint is unchanged and batch-first:

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
    { "name": "session_start", "properties": { "mode": "singleplayer" } },
    { "name": "level_started", "properties": { "level": 1 } }
  ]
}
```

Single-event payloads (`{ "sessionId": "...", "name": "...", "properties": {} }`) are also accepted.

## Origin Allowlist

Requests whose `Origin` is not in the game's `allowedOrigins` are rejected. This limits normal browser traffic to your itch.io pages but is not a secret: non-browser callers can forge headers.

For itch.io HTML5 games the page is `https://neokry.itch.io`, but the embedded game runs from an itch CDN origin such as `https://html-classic.itch.zone`, so `https://*.itch.zone` is allowlisted. Wildcard subdomains are supported.

## Reduced Privacy Regions

Privacy mode comes from CloudFront's viewer country (`CloudFront-Viewer-Country`). EEA countries, the UK, Switzerland, and nearby European microstates are reduced. Requests with no country (including any that bypass CloudFront) are reduced too.

Reduced mode still stores session-scoped gameplay events, but:

- `anonymousId` and `playerId` are dropped.
- User agents are not stored.
- `pageUrl` and `referrer` keep only origin + path.
- Obvious URL/error-message fields are stripped from event/session properties.

IP addresses are never stored, hashed or otherwise.

## Querying

Use the Athena console with workgroup `game-analytics` and database `game_analytics`, or DuckDB against the S3 files. Always filter on `dt` (and `game`) so Athena only scans the days you need:

```sql
SELECT name, count(*) AS events
FROM events
WHERE game = 'dead-letters' AND dt >= '2026-10-01'
GROUP BY name
ORDER BY events DESC;
```

## Development

```bash
npm install
npm test          # ingest tests against an in-memory sink
npm run dev       # local server on :3000; accepted events are printed
```

## Deploy

Infrastructure is AWS CDK in `infra/`.

```bash
npm run deploy        # cdk deploy; prints IngestUrl
npm run athena:views  # create or update the Athena views
```

Adding a game: add it to `src/games.ts` and deploy. That also adds it to the Athena partition list.

## Data Before October 2026

Events up to the AWS cutover were collected by the old Railway + Postgres version of this service and copied into the same S3 layout with `scripts/migrate-from-railway/`. Those rows have no `country`, and their stored IP hashes were dropped during the copy.

## Event Naming

Use stable, lower-case names like `session_start`, `session_end`, `level_started`, `level_completed`, `run_started`, `run_ended`, `choice_made`, `error_seen`. Put game-specific details in `properties`, not in the event name.
