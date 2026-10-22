// One-off export of the old Railway Postgres data. Runs inside the old Railway service
// (`railway ssh`), where `postgres` and DATABASE_URL are available, and prints a gzipped,
// base64-encoded NDJSON chunk of events whose received_at is in [FROM, TO).
//
// Rows match the Glue `events_raw` columns plus `game`/`dt`. IP hashes are not exported.
import postgres from "postgres";
import { gzipSync } from "node:zlib";

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error("usage: node export.mjs <from-iso> <to-iso>");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const lines = [];

const cursor = sql`
  select
    e.id::text as event_id,
    g.slug as game,
    to_char(e.received_at at time zone 'UTC', 'YYYY-MM-DD') as dt,
    e.name,
    e.client_event_id,
    s.external_session_id as session_id,
    e.anonymous_id,
    e.player_id,
    e.build_id,
    e.origin,
    e.page_url,
    e.referrer,
    e.user_agent,
    null::text as country,
    case when e.ip_hash is null and e.anonymous_id is null then 'reduced' else 'standard' end as privacy_mode,
    e.properties::text as properties,
    coalesce(s.properties, '{}'::jsonb)::text as session_properties,
    (extract(epoch from e.occurred_at) * 1000)::bigint as occurred_at,
    (extract(epoch from e.received_at) * 1000)::bigint as received_at
  from game_events e
  join games g on g.id = e.game_id
  left join game_sessions s on s.id = e.session_id
  where e.received_at >= ${from} and e.received_at < ${to}
`.cursor(5000);

for await (const rows of cursor) {
  for (const row of rows) {
    row.occurred_at = Number(row.occurred_at);
    row.received_at = Number(row.received_at);
    lines.push(JSON.stringify(row));
  }
}
await sql.end();

process.stderr.write(`rows=${lines.length}\n`);
const encoded = gzipSync(lines.length ? `${lines.join("\n")}\n` : "").toString("base64");
for (let i = 0; i < encoded.length; i += 76) process.stdout.write(`${encoded.slice(i, i + 76)}\n`);
process.stdout.write("EXPORT_END\n");
