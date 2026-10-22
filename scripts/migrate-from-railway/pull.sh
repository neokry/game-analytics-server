#!/usr/bin/env bash
# Pulls one [FROM, TO) chunk of events from the old Railway service into OUT_DIR as
# gzipped NDJSON. Usage: pull.sh <from-iso> <to-iso> <out-dir>
set -euo pipefail

FROM="$1"
TO="$2"
OUT_DIR="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT=76953ba3-73da-472d-a858-b92543362eae

mkdir -p "$OUT_DIR"
name="$(echo "${FROM}_${TO}" | tr -c 'A-Za-z0-9_\n-' '-')"
raw="$OUT_DIR/$name.b64"
script="$(base64 < "$HERE/export.mjs" | tr -d '\n')"

# `pwd;` first: railway ssh drops output of a command line that starts with the script.
railway ssh -p "$PROJECT" -e production -s game-analytics-server -- \
  sh -c "pwd >/dev/null; echo $script | base64 -d > .export.mjs && node .export.mjs '$FROM' '$TO'; rm -f .export.mjs" \
  | tr -d '\r' > "$raw"

# The ssh session is a terminal, so stderr (the row count) arrives mixed into stdout.
grep -q '^EXPORT_END$' "$raw" || { echo "export of $FROM..$TO incomplete" >&2; exit 1; }
grep -m1 '^rows=' "$raw" >&2 || true
grep -vE '^(EXPORT_END|rows=[0-9]+)$' "$raw" | base64 -d > "$OUT_DIR/$name.ndjson.gz"
rm -f "$raw"
echo "$name: $(gzip -dc "$OUT_DIR/$name.ndjson.gz" | wc -l | tr -d ' ') rows"
