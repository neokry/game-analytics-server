import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { MemorySink } from "../src/sink.js";

function post(body: unknown, headers: Record<string, string> = {}, slug = "dead-letters") {
  const sink = new MemorySink();
  const app = createApp(sink);
  const response = app.request(`/v1/games/${slug}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://html-classic.itch.zone",
      "cloudfront-viewer-country": "US",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return { sink, response };
}

const batch = {
  sessionId: "session_1",
  anonymousId: "anon_1",
  buildId: "itch-1",
  context: { pageUrl: "https://neokry.itch.io/dead-letters?ref=abc", referrer: "https://itch.io/games" },
  sessionProperties: { mode: "story" },
  events: [
    { name: "session_start", clientEventId: "c1", properties: { level: 1, url: "https://x.test/?q=1" } },
    { name: "level_started", clientEventId: "c2", occurredAt: "2026-10-22T10:00:00.000Z" }
  ]
};

test("stores one record per event with session fields", async () => {
  const { sink, response } = post(batch);
  const res = await response;

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { accepted: 2, duplicate: 0, sessionId: "session_1" });
  assert.equal(sink.records.length, 2);

  const [first, second] = sink.records;
  assert.equal(first.game, "dead-letters");
  assert.match(first.dt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(first.session_id, "session_1");
  assert.equal(first.anonymous_id, "anon_1");
  assert.equal(first.country, "US");
  assert.equal(first.privacy_mode, "standard");
  assert.equal(first.page_url, "https://neokry.itch.io/dead-letters?ref=abc");
  assert.deepEqual(JSON.parse(first.properties), { level: 1, url: "https://x.test/?q=1" });
  assert.deepEqual(JSON.parse(first.session_properties), { mode: "story" });
  assert.equal(second.occurred_at, Date.parse("2026-10-22T10:00:00.000Z"));
  assert.notEqual(first.event_id, second.event_id);
});

test("reduced privacy for EEA, UK and unknown countries", async () => {
  for (const country of ["DE", "NO", "GB", undefined]) {
    const headers: Record<string, string> = country ? { "cloudfront-viewer-country": country } : {};
    const { sink, response } = post(batch, country ? headers : { "cloudfront-viewer-country": "" });
    assert.equal((await response).status, 200);

    const [record] = sink.records;
    assert.equal(record.privacy_mode, "reduced", `country ${country}`);
    assert.equal(record.anonymous_id, null);
    assert.equal(record.user_agent, null);
    assert.equal(record.page_url, "https://neokry.itch.io/dead-letters");
    assert.deepEqual(JSON.parse(record.properties), { level: 1 });
  }
});

test("accepts single inline events", async () => {
  const { sink, response } = post({ sessionId: "s", name: "button_clicked", properties: { button: "play" } });
  assert.equal((await response).status, 200);
  assert.equal(sink.records[0].name, "button_clicked");
  assert.equal(sink.records[0].session_id, "s");
});

test("rejects unknown games, disallowed origins and bad payloads", async () => {
  assert.equal((await post(batch, {}, "nope").response).status, 404);
  assert.equal((await post(batch, { origin: "https://evil.example" }).response).status, 403);
  assert.equal((await post({ sessionId: "s" }).response).status, 400);
});

test("answers CORS preflight for allowed origins", async () => {
  const app = createApp(new MemorySink());
  const res = await app.request("/v1/games/dead-letters/events", {
    method: "OPTIONS",
    headers: {
      origin: "https://neokry.itch.io",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://neokry.itch.io");
});
