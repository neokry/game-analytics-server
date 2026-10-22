"""Converts exported NDJSON chunks to Parquet laid out like Firehose output:
<out>/game=<slug>/dt=<yyyy-mm-dd>/railway_<n>.parquet

Usage: python to_parquet.py <export-dir> <out-dir>
Then: aws s3 sync <out-dir> s3://<bucket>/events/
"""

import sys

import duckdb

export_dir, out_dir = sys.argv[1], sys.argv[2]

columns = {
    "event_id": "VARCHAR",
    "game": "VARCHAR",
    "dt": "VARCHAR",
    "name": "VARCHAR",
    "client_event_id": "VARCHAR",
    "session_id": "VARCHAR",
    "anonymous_id": "VARCHAR",
    "player_id": "VARCHAR",
    "build_id": "VARCHAR",
    "origin": "VARCHAR",
    "page_url": "VARCHAR",
    "referrer": "VARCHAR",
    "user_agent": "VARCHAR",
    "country": "VARCHAR",
    "privacy_mode": "VARCHAR",
    "properties": "VARCHAR",
    "session_properties": "VARCHAR",
    "occurred_at": "BIGINT",
    "received_at": "BIGINT",
}

con = duckdb.connect()
con.execute(
    f"""
    COPY (
      SELECT
        * EXCLUDE (occurred_at, received_at),
        make_timestamp(occurred_at * 1000) AS occurred_at,
        make_timestamp(received_at * 1000) AS received_at
      FROM read_json('{export_dir}/*.ndjson.gz', format = 'newline_delimited', columns = {columns})
    )
    TO '{out_dir}' (FORMAT parquet, COMPRESSION snappy, PARTITION_BY (game, dt),
                    FILENAME_PATTERN 'railway_{{i}}', OVERWRITE_OR_IGNORE)
    """
)

rows, games, days = con.execute(
    f"SELECT count(*), count(DISTINCT game), count(DISTINCT game || dt) FROM read_parquet('{out_dir}/**/*.parquet', hive_partitioning = true)"
).fetchone()
print(f"parquet rows={rows} games={games} partitions={days}")
