import { App } from "aws-cdk-lib";
import { AnalyticsStack } from "./stack.js";

const app = new App();

new AnalyticsStack(app, "GameAnalytics", {
  env: { account: "360444545306", region: "us-east-2" },
  description: "Game analytics ingest: CloudFront -> Lambda -> Firehose -> S3 (Parquet) -> Athena"
});
