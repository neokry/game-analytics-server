-- Deduplicated events: clients may retry a batch, so keep the first copy of each
-- client event id per game.
CREATE OR REPLACE VIEW events AS
SELECT *
FROM (
  SELECT
    e.*,
    row_number() OVER (
      PARTITION BY game, coalesce(client_event_id, event_id)
      ORDER BY received_at
    ) AS copy_number
  FROM events_raw e
)
WHERE copy_number = 1;

-- One row per game session, derived from its events.
CREATE OR REPLACE VIEW sessions AS
SELECT
  game,
  session_id,
  min(occurred_at) AS started_at,
  max(received_at) AS last_seen_at,
  count(*) AS event_count,
  max_by(anonymous_id, received_at) AS anonymous_id,
  max_by(player_id, received_at) AS player_id,
  max_by(build_id, received_at) AS build_id,
  max_by(country, received_at) AS country,
  max_by(privacy_mode, received_at) AS privacy_mode,
  max_by(page_url, received_at) AS page_url,
  max_by(referrer, received_at) AS referrer,
  max_by(session_properties, received_at) AS session_properties
FROM events
WHERE session_id IS NOT NULL
GROUP BY game, session_id;
