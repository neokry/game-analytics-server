import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_athena as athena,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_glue as glue,
  aws_iam as iam,
  aws_kinesisfirehose as firehose,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_s3 as s3
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import { games } from "../src/games.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GLUE_DATABASE = "game_analytics";
export const RAW_TABLE = "events_raw";
export const ATHENA_WORKGROUP = "game-analytics";
const EVENTS_PREFIX = "events/";

// Columns stored in each Parquet file. `game` and `dt` are partition columns taken
// from the S3 path, so they are not repeated here.
const EVENT_COLUMNS: glue.CfnTable.ColumnProperty[] = [
  { name: "event_id", type: "string" },
  { name: "name", type: "string" },
  { name: "client_event_id", type: "string" },
  { name: "session_id", type: "string" },
  { name: "anonymous_id", type: "string" },
  { name: "player_id", type: "string" },
  { name: "build_id", type: "string" },
  { name: "origin", type: "string" },
  { name: "page_url", type: "string" },
  { name: "referrer", type: "string" },
  { name: "user_agent", type: "string" },
  { name: "country", type: "string" },
  { name: "privacy_mode", type: "string" },
  { name: "properties", type: "string" },
  { name: "session_properties", type: "string" },
  { name: "occurred_at", type: "timestamp" },
  { name: "received_at", type: "timestamp" }
];

export class AnalyticsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "DataBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
        { prefix: "athena-results/", expiration: Duration.days(30) },
        { prefix: "errors/", expiration: Duration.days(30) }
      ]
    });

    const database = new glue.CfnDatabase(this, "Database", {
      catalogId: this.account,
      databaseInput: { name: GLUE_DATABASE }
    });

    // Partition projection lets Athena find new game/day folders without crawlers.
    const table = new glue.CfnTable(this, "EventsTable", {
      catalogId: this.account,
      databaseName: GLUE_DATABASE,
      tableInput: {
        name: RAW_TABLE,
        tableType: "EXTERNAL_TABLE",
        parameters: {
          classification: "parquet",
          "projection.enabled": "true",
          "projection.game.type": "enum",
          "projection.game.values": games.map((game) => game.slug).join(","),
          "projection.dt.type": "date",
          "projection.dt.format": "yyyy-MM-dd",
          "projection.dt.range": "2026-05-01,NOW",
          "storage.location.template": `s3://${bucket.bucketName}/${EVENTS_PREFIX}game=\${game}/dt=\${dt}/`
        },
        partitionKeys: [
          { name: "game", type: "string" },
          { name: "dt", type: "string" }
        ],
        storageDescriptor: {
          columns: EVENT_COLUMNS,
          location: `s3://${bucket.bucketName}/${EVENTS_PREFIX}`,
          inputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
          outputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
          serdeInfo: {
            serializationLibrary: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
          }
        }
      }
    });
    table.addResourceDependency(database);

    const firehoseLogGroup = new logs.LogGroup(this, "FirehoseLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    });
    const firehoseLogStream = firehoseLogGroup.addStream("S3Delivery");

    const firehoseRole = new iam.Role(this, "FirehoseRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com")
    });
    bucket.grantReadWrite(firehoseRole);
    firehoseLogGroup.grantWrite(firehoseRole);
    firehoseRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["glue:GetTable", "glue:GetTableVersion", "glue:GetTableVersions"],
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          `arn:aws:glue:${this.region}:${this.account}:database/${GLUE_DATABASE}`,
          `arn:aws:glue:${this.region}:${this.account}:table/${GLUE_DATABASE}/${RAW_TABLE}`
        ]
      })
    );

    const stream = new firehose.CfnDeliveryStream(this, "EventsStream", {
      deliveryStreamType: "DirectPut",
      extendedS3DestinationConfiguration: {
        bucketArn: bucket.bucketArn,
        roleArn: firehoseRole.roleArn,
        prefix: `${EVENTS_PREFIX}game=!{partitionKeyFromQuery:game}/dt=!{partitionKeyFromQuery:dt}/`,
        errorOutputPrefix: "errors/!{firehose:error-output-type}/!{timestamp:yyyy/MM/dd}/",
        bufferingHints: { intervalInSeconds: 300, sizeInMBs: 64 },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
        dynamicPartitioningConfiguration: { enabled: true },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: "MetadataExtraction",
              parameters: [
                { parameterName: "MetadataExtractionQuery", parameterValue: "{game: .game, dt: .dt}" },
                { parameterName: "JsonParsingEngine", parameterValue: "JQ-1.6" }
              ]
            }
          ]
        },
        dataFormatConversionConfiguration: {
          enabled: true,
          inputFormatConfiguration: {
            deserializer: { hiveJsonSerDe: { timestampFormats: ["millis"] } }
          },
          outputFormatConfiguration: {
            serializer: { parquetSerDe: { compression: "SNAPPY" } }
          },
          schemaConfiguration: {
            catalogId: this.account,
            databaseName: GLUE_DATABASE,
            tableName: RAW_TABLE,
            region: this.region,
            roleArn: firehoseRole.roleArn,
            versionId: "LATEST"
          }
        }
      }
    });
    stream.addResourceDependency(table);
    stream.node.addDependency(firehoseRole);

    const ingestFunction = new nodejs.NodejsFunction(this, "IngestFunction", {
      entry: path.join(root, "src/lambda.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      // Caps cost and blast radius if someone floods the endpoint.
      reservedConcurrentExecutions: 20,
      logGroup: new logs.LogGroup(this, "IngestLogs", {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY
      }),
      environment: {
        NODE_ENV: "production",
        ALLOW_MISSING_ORIGIN: "false",
        FIREHOSE_STREAM_NAME: stream.ref
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
      }
    });
    ingestFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["firehose:PutRecordBatch"],
        resources: [stream.attrArn]
      })
    );

    // The function URL is public but only useful through CloudFront, which adds the
    // viewer country used for privacy mode. Direct calls get reduced privacy.
    const functionUrl = ingestFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE
    });

    const originRequestPolicy = new cloudfront.OriginRequestPolicy(this, "IngestOriginRequest", {
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        "origin",
        "content-type",
        "user-agent",
        "x-game-key",
        "cloudfront-viewer-country"
      ),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.none(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none()
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Game analytics ingest",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(functionUrl),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy
      }
    });

    new athena.CfnWorkGroup(this, "WorkGroup", {
      name: ATHENA_WORKGROUP,
      recursiveDeleteOption: false,
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        engineVersion: { selectedEngineVersion: "Athena engine version 3" },
        resultConfiguration: {
          outputLocation: `s3://${bucket.bucketName}/athena-results/`,
          encryptionConfiguration: { encryptionOption: "SSE_S3" }
        }
      }
    });

    new CfnOutput(this, "IngestUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "DataBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "FirehoseStreamName", { value: stream.ref });
    new CfnOutput(this, "AthenaWorkGroup", { value: ATHENA_WORKGROUP });
  }
}
