function optionalBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 3000),
  allowMissingOrigin: optionalBoolean(process.env.ALLOW_MISSING_ORIGIN, nodeEnv !== "production"),
  firehoseStreamName: process.env.FIREHOSE_STREAM_NAME
};
