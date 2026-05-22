import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket, EventType, IBucket } from "aws-cdk-lib/aws-s3";
import { LambdaDestination as S3LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction as EventLambdaTarget } from "aws-cdk-lib/aws-events-targets";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import * as path from "path";

interface LambdaStackProps extends StackProps {
  tasksTable: Table;
  usersTable: Table;
  auditLogsTable: Table;
  originalsBucket: Bucket;
  resizedBucket: Bucket;
  assignmentQueue: Queue;
  dailyDigestTopic: Topic;
  alertsTopic: Topic;
}

/**
 * Three Lambdas required by spec:
 *   - image-resize: S3 PUT on originals -> 400px thumbnail in resized bucket
 *   - assignment-worker: SQS event -> audit log row + CloudWatch metric
 *   - daily-digest: EventBridge 9:00 AM GMT+3 cron -> scans tasks due today -> SNS
 *
 * Handlers live under server/src/lambdas/. esbuild bundles each via NodejsFunction.
 */
export class LambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const lambdaSrcDir = path.resolve(__dirname, "..", "..", "server", "src", "lambdas");

    const commonBundling = {
      target: "node20",
      format: OutputFormat.CJS,
      sourceMap: true,
      minify: false,
      externalModules: ["@aws-sdk/*"]
    };

    // -------- image-resize --------
    const imageResize = new NodejsFunction(this, "ImageResizeFn", {
      functionName: "mini-jira-image-resize",
      entry: path.join(lambdaSrcDir, "image-resize.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        RESIZED_BUCKET: props.resizedBucket.bucketName,
        THUMB_WIDTH: "400"
      },
      bundling: {
        ...commonBundling,
        // sharp ships native binaries — let it resolve from node_modules at runtime via a layer.
        // For free-tier course demo, we bundle sharp with platform=linux,arch=arm64.
        nodeModules: ["sharp"],
        forceDockerBundling: true
      }
    });
    // Re-import the originals bucket by NAME (not by construct ref) to break
    // the cross-stack cyclic dependency (Data depends on Lambdas would cycle with
    // Lambdas depends on Data otherwise).
    const originalsBucketByName: IBucket = Bucket.fromBucketName(
      this, "OriginalsBucketRef", props.originalsBucket.bucketName
    );
    originalsBucketByName.grantRead(imageResize);
    props.resizedBucket.grantWrite(imageResize);
    // Grant S3 permission to invoke the Lambda (would normally be added by
    // addEventNotification but we configure that out-of-band via DataStack notifications below).
    imageResize.addPermission("AllowS3Invoke", {
      principal: new ServicePrincipal("s3.amazonaws.com"),
      sourceArn: originalsBucketByName.bucketArn,
      sourceAccount: this.account
    });
    originalsBucketByName.addEventNotification(
      EventType.OBJECT_CREATED,
      new S3LambdaDestination(imageResize)
    );

    // -------- assignment-worker --------
    const assignmentWorker = new NodejsFunction(this, "AssignmentWorkerFn", {
      functionName: "mini-jira-assignment-worker",
      entry: path.join(lambdaSrcDir, "assignment-worker.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        DYNAMO_AUDIT_LOGS_TABLE: props.auditLogsTable.tableName,
        METRIC_NAMESPACE: "MiniJira"
      },
      bundling: commonBundling
    });
    props.auditLogsTable.grantWriteData(assignmentWorker);
    assignmentWorker.addEventSource(new SqsEventSource(props.assignmentQueue, {
      batchSize: 5,
      reportBatchItemFailures: true
    }));
    // CloudWatch PutMetricData has no resource-level ARNs; scope via the
    // cloudwatch:namespace condition to keep this least-privilege.
    assignmentWorker.addToRolePolicy(new PolicyStatement({
      actions: ["cloudwatch:PutMetricData"],
      resources: ["*"],
      conditions: {
        StringEquals: { "cloudwatch:namespace": "MiniJira" }
      }
    }));

    // -------- daily-digest --------
    const dailyDigest = new NodejsFunction(this, "DailyDigestFn", {
      functionName: "mini-jira-daily-digest",
      entry: path.join(lambdaSrcDir, "daily-digest.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(60),
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        DYNAMO_TASKS_TABLE: props.tasksTable.tableName,
        DYNAMO_USERS_TABLE: props.usersTable.tableName,
        DAILY_DIGEST_TOPIC_ARN: props.dailyDigestTopic.topicArn,
        ALERTS_TOPIC_ARN: props.alertsTopic.topicArn,
        METRIC_NAMESPACE: "MiniJira",
        OVERDUE_THRESHOLD: "5"
      },
      bundling: commonBundling
    });
    props.tasksTable.grantReadData(dailyDigest);
    props.usersTable.grantReadData(dailyDigest);
    props.dailyDigestTopic.grantPublish(dailyDigest);
    props.alertsTopic.grantPublish(dailyDigest);
    dailyDigest.addToRolePolicy(new PolicyStatement({
      actions: ["cloudwatch:PutMetricData"],
      resources: ["*"],
      conditions: {
        StringEquals: { "cloudwatch:namespace": "MiniJira" }
      }
    }));

    new Rule(this, "DailyDigestSchedule", {
      ruleName: "mini-jira-daily-9am-gmt3",
      // EventBridge cron is UTC. 09:00 Africa/Cairo (GMT+3, no DST) == 06:00 UTC year-round.
      schedule: Schedule.cron({ minute: "0", hour: "6" }),
      targets: [new EventLambdaTarget(dailyDigest)]
    });

    new CfnOutput(this, "ImageResizeFnName", { value: imageResize.functionName });
    new CfnOutput(this, "AssignmentWorkerFnName", { value: assignmentWorker.functionName });
    new CfnOutput(this, "DailyDigestFnName", { value: dailyDigest.functionName });
  }
}
