import { handle } from "hono/aws-lambda";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { FirehoseSink } from "./sink.js";

if (!env.firehoseStreamName) {
  throw new Error("FIREHOSE_STREAM_NAME is required");
}

export const handler = handle(createApp(new FirehoseSink(env.firehoseStreamName)));
