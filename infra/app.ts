import { App } from "aws-cdk-lib";
import { GitHubDeployStack } from "./ci-stack.js";
import { AnalyticsStack } from "./stack.js";

const app = new App();
const env = { account: "360444545306", region: "us-east-2" };

new AnalyticsStack(app, "GameAnalytics", {
  env,
  description: "Game analytics ingest: CloudFront -> Lambda -> Firehose -> S3 (Parquet) -> Athena"
});

new GitHubDeployStack(app, "GameAnalyticsGitHubDeploy", {
  env,
  description: "OIDC role GitHub Actions uses to deploy GameAnalytics"
});
