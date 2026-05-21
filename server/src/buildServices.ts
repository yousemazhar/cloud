import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SNSClient } from "@aws-sdk/client-sns";
import type { AppConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import {
  createInMemoryState,
  InMemoryAuditRepo,
  InMemoryCommentRepo,
  InMemoryProjectRepo,
  InMemoryTaskRepo,
  InMemoryTeamRepo,
  InMemoryUserRepo
} from "./services/local/repos.js";
import { LocalAuth } from "./services/local/auth.js";
import { LocalDiskStorage } from "./services/local/storage.js";
import { CognitoAuth } from "./services/aws/cognito-auth.js";
import { S3Storage } from "./services/aws/s3-storage.js";
import {
  DynamoAuditRepo,
  DynamoCommentRepo,
  DynamoProjectRepo,
  DynamoTaskRepo,
  DynamoTeamRepo,
  DynamoUserRepo,
  type DynamoTableNames
} from "./services/aws/dynamo-repos.js";
import { NoopNotifier, SnsNotifier } from "./services/notifications.js";
import { CloudWatchMetrics, NoopMetrics } from "./services/metrics.js";
import { LocalUserAdmin } from "./services/local/user-admin.js";
import { CognitoUserAdmin } from "./services/aws/cognito-user-admin.js";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import type { AppServices } from "./services/index.js";

/**
 * Factory consumed by both the entry point and the test helpers.
 * - "local" produces a fresh in-memory state per call so each test gets isolation.
 * - "aws" reads required env vars from config and constructs the AWS impls.
 */
export function buildLocalServices(options: { logger?: Logger } = {}): AppServices {
  const logger = options.logger ?? createLogger({ backend: "local" });
  const state = createInMemoryState();
  const users = new InMemoryUserRepo(state);
  return {
    auth: new LocalAuth(users),
    tasks: new InMemoryTaskRepo(state),
    projects: new InMemoryProjectRepo(state),
    comments: new InMemoryCommentRepo(state),
    audit: new InMemoryAuditRepo(state),
    users,
    teams: new InMemoryTeamRepo(state),
    storage: new LocalDiskStorage(),
    notifier: new NoopNotifier(logger),
    metrics: new NoopMetrics(logger),
    userAdmin: new LocalUserAdmin(users),
    logger
  };
}

export function buildAwsServices(config: AppConfig, options: { logger?: Logger } = {}): AppServices {
  const logger = options.logger ?? createLogger({ backend: "aws" });
  const tables = requireDynamoTables(config);
  const cognito = requireCognito(config);
  const buckets = requireS3(config);
  const topic = requireSnsTopic(config);

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.awsRegion }));
  const ctx = { client: docClient, tables };
  const s3 = new S3Client({ region: config.awsRegion });
  const sns = new SNSClient({ region: config.awsRegion });
  const cw = new CloudWatchClient({ region: config.awsRegion });
  const cognitoIdp = new CognitoIdentityProviderClient({ region: config.awsRegion });
  const dynamoUsers = new DynamoUserRepo(ctx);

  return {
    auth: new CognitoAuth({ ...cognito, region: config.awsRegion }),
    tasks: new DynamoTaskRepo(ctx),
    projects: new DynamoProjectRepo(ctx),
    comments: new DynamoCommentRepo(ctx),
    audit: new DynamoAuditRepo(ctx),
    users: dynamoUsers,
    teams: new DynamoTeamRepo(ctx),
    storage: new S3Storage({ client: s3, originalsBucket: buckets.originalsBucket }),
    notifier: new SnsNotifier(
      {
        client: sns,
        topics: {
          tasksAssigned: topic,
          dailyDigest: config.sns.dailyDigestTopicArn,
          alerts: config.sns.alertsTopicArn
        }
      },
      logger
    ),
    metrics: new CloudWatchMetrics({ client: cw }, logger),
    userAdmin: new CognitoUserAdmin({
      cognito: cognitoIdp,
      userPoolId: cognito.userPoolId,
      clientId: cognito.clientId,
      users: dynamoUsers
    }),
    logger
  };
}

export function buildServices(config: AppConfig, options: { logger?: Logger } = {}): AppServices {
  return config.backend === "aws" ? buildAwsServices(config, options) : buildLocalServices(options);
}

function requireDynamoTables(config: AppConfig): DynamoTableNames {
  const { dynamo } = config;
  const fields = ["tasksTable", "projectsTable", "commentsTable", "auditLogsTable", "usersTable", "teamsTable"] as const;
  for (const field of fields) {
    if (!dynamo[field]) throw new Error(`DYNAMO ${field} is required when MINI_JIRA_BACKEND=aws`);
  }
  return {
    tasks: dynamo.tasksTable!,
    projects: dynamo.projectsTable!,
    comments: dynamo.commentsTable!,
    auditLogs: dynamo.auditLogsTable!,
    users: dynamo.usersTable!,
    teams: dynamo.teamsTable!
  };
}

function requireCognito(config: AppConfig) {
  if (!config.cognito.userPoolId || !config.cognito.clientId) {
    throw new Error("COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required when MINI_JIRA_BACKEND=aws");
  }
  return { userPoolId: config.cognito.userPoolId, clientId: config.cognito.clientId };
}

function requireS3(config: AppConfig) {
  if (!config.s3.originalsBucket) {
    throw new Error("S3_ORIGINALS_BUCKET is required when MINI_JIRA_BACKEND=aws");
  }
  return { originalsBucket: config.s3.originalsBucket };
}

function requireSnsTopic(config: AppConfig) {
  if (!config.sns.taskAssignedTopicArn) {
    throw new Error("SNS_TOPIC_TASKS_ASSIGNED is required when MINI_JIRA_BACKEND=aws");
  }
  return config.sns.taskAssignedTopicArn;
}
