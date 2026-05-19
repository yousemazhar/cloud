import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table
} from "aws-cdk-lib/aws-dynamodb";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
  LifecycleRule,
  ObjectOwnership
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/**
 * DynamoDB tables (PAY_PER_REQUEST, all free-tier) and S3 buckets
 * (originals with versioning per spec, resized, web hosting, artifacts).
 *
 * Table names + GSI names are FIXED — they must match the strings hard-coded
 * in server/src/services/aws/dynamo-repos.ts.
 */
export class DataStack extends Stack {
  public readonly tasksTable: Table;
  public readonly projectsTable: Table;
  public readonly commentsTable: Table;
  public readonly auditLogsTable: Table;
  public readonly usersTable: Table;
  public readonly teamsTable: Table;
  public readonly originalsBucket: Bucket;
  public readonly resizedBucket: Bucket;
  public readonly webBucket: Bucket;
  public readonly artifactsBucket: Bucket;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const account = Stack.of(this).account;

    // -------- DynamoDB --------

    this.tasksTable = new Table(this, "TasksTable", {
      tableName: "MiniJira_Tasks",
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecovery: false
    });
    this.tasksTable.addGlobalSecondaryIndex({
      indexName: "teamId-deadline-index",
      partitionKey: { name: "teamId", type: AttributeType.STRING },
      sortKey: { name: "deadline", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.tasksTable.addGlobalSecondaryIndex({
      indexName: "assigneeId-deadline-index",
      partitionKey: { name: "assigneeId", type: AttributeType.STRING },
      sortKey: { name: "deadline", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.projectsTable = new Table(this, "ProjectsTable", {
      tableName: "MiniJira_Projects",
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN
    });
    this.projectsTable.addGlobalSecondaryIndex({
      indexName: "teamId-index",
      partitionKey: { name: "teamId", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.commentsTable = new Table(this, "CommentsTable", {
      tableName: "MiniJira_Comments",
      partitionKey: { name: "taskId", type: AttributeType.STRING },
      sortKey: { name: "createdAt#id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN
    });

    this.auditLogsTable = new Table(this, "AuditLogsTable", {
      tableName: "MiniJira_AuditLogs",
      partitionKey: { name: "taskId", type: AttributeType.STRING },
      sortKey: { name: "createdAt#id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN
    });

    this.usersTable = new Table(this, "UsersTable", {
      tableName: "MiniJira_Users",
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: "email-index",
      partitionKey: { name: "email", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.teamsTable = new Table(this, "TeamsTable", {
      tableName: "MiniJira_Teams",
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN
    });

    // -------- S3 --------

    const corsForImages = [
      {
        allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
        allowedOrigins: ["*"],
        allowedHeaders: ["*"],
        exposedHeaders: ["ETag"],
        maxAge: 3000
      }
    ];

    // Originals: versioning REQUIRED by spec (old image versions retained).
    this.originalsBucket = new Bucket(this, "OriginalsBucket", {
      bucketName: `mini-jira-originals-${account}`,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      cors: corsForImages,
      removalPolicy: RemovalPolicy.RETAIN,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED
    });

    // Resized: thumbnails written by image-resize Lambda. 30-day expiry.
    const resizedLifecycle: LifecycleRule = {
      id: "expire-thumbnails-after-30d",
      enabled: true,
      expiration: Duration.days(30)
    };

    this.resizedBucket = new Bucket(this, "ResizedBucket", {
      bucketName: `mini-jira-resized-${account}`,
      versioned: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      cors: corsForImages,
      lifecycleRules: [resizedLifecycle],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED
    });

    // Web bucket: hosts the built React app. CloudFront OAC reads from it.
    this.webBucket = new Bucket(this, "WebBucket", {
      bucketName: `mini-jira-web-${account}`,
      versioned: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED
    });

    // Artifacts bucket: holds the packaged server bundle that EC2 user-data downloads.
    this.artifactsBucket = new Bucket(this, "ArtifactsBucket", {
      bucketName: `mini-jira-artifacts-${account}`,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED
    });

    new CfnOutput(this, "OriginalsBucketName", { value: this.originalsBucket.bucketName });
    new CfnOutput(this, "ResizedBucketName", { value: this.resizedBucket.bucketName });
    new CfnOutput(this, "WebBucketName", { value: this.webBucket.bucketName });
    new CfnOutput(this, "ArtifactsBucketName", { value: this.artifactsBucket.bucketName });
  }
}
