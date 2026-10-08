import { App, CfnOutput, CfnParameter, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

/**
 * Cheapest shape that works: one Lambda behind a Function URL (free tier), DynamoDB provisioned 5/5
 * (always-free), course index built in-process at cold start. No NAT, no ALB, no OpenSearch.
 */
class ScholiaAlexaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bearerToken = new CfnParameter(this, "BearerToken", {
      type: "String",
      noEcho: true,
      default: "",
      description: "Optional. When set, /mcp requires Authorization: Bearer <token>.",
    });

    const table = new dynamodb.Table(this, "Learners", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda Web Adapter: runs the Express server as-is, no handler shim.
    const adapter = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "LambdaWebAdapter",
      `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerX86:30`,
    );

    const fn = new nodejs.NodejsFunction(this, "Mcp", {
      entry: "src/server.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.X86_64,
      handler: "run.sh",
      memorySize: 512,
      timeout: Duration.seconds(30),
      layers: [adapter],
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (input, output) => [
            `cp -r ${input}/courses ${output}/courses`,
            `printf '#!/bin/bash\\nexec node --enable-source-maps index.mjs\\n' > ${output}/run.sh`,
            `chmod +x ${output}/run.sh`,
          ],
        },
      },
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        AWS_LWA_READINESS_CHECK_PATH: "/healthz",
        PORT: "8080",
        TABLE_NAME: table.tableName,
        TUTOR: "bedrock",
        BEDROCK_MODEL_ID: "us.amazon.nova-pro-v1:0",
        MCP_STATELESS: "1",
        MCP_BEARER_TOKEN: bearerToken.valueAsString,
      },
    });
    table.grantReadWriteData(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.amazon.nova-*`,
        ],
      }),
    );

    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE, invokeMode: lambda.InvokeMode.BUFFERED });
    new CfnOutput(this, "McpUrl", { value: `${url.url}mcp` });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}

const app = new App();
new ScholiaAlexaStack(app, "ScholiaAlexa", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
  description: "Scholia for Alexa+ MCP server (hackathon, free-tier footprint)",
});
