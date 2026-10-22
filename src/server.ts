// Local development server. Accepted events are logged instead of sent to Firehose.
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./env.js";
import type { EventSink } from "./sink.js";

const consoleSink: EventSink = {
  async put(records) {
    for (const record of records) console.log(JSON.stringify(record));
  }
};

serve(
  {
    fetch: createApp(consoleSink).fetch,
    port: env.port,
    hostname: "0.0.0.0"
  },
  (info) => {
    console.log(`analytics-server listening on http://${info.address}:${info.port}`);
  }
);
