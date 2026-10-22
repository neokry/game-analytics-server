import { CfnOutput, Duration, Stack, type StackProps, aws_iam as iam } from "aws-cdk-lib";
import type { Construct } from "constructs";

export const GITHUB_REPO = "neokry/game-analytics-server";
export const GITHUB_ENVIRONMENT = "production";

// Lets GitHub Actions deploy the app stack with short-lived credentials (OIDC), so no
// AWS keys are stored in GitHub. Kept in its own stack so app deploys from CI never
// change the role CI itself runs as. Deploy this stack from your machine.
export class GitHubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, "GitHubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"]
    });

    // Only jobs in this repo's `production` environment can assume the role. That
    // environment is limited to the main branch in the repo settings, so pull
    // requests (including ones from forks) cannot reach AWS.
    const role = new iam.Role(this, "DeployRole", {
      roleName: "github-game-analytics-deploy",
      description: `GitHub Actions deploys for ${GITHUB_REPO}`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_REPO}:environment:${GITHUB_ENVIRONMENT}`
        }
      })
    });

    // The role can do nothing itself except hand off to CDK's bootstrap roles, which
    // publish the Lambda bundle and run the CloudFormation deploy.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`
        ]
      })
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
