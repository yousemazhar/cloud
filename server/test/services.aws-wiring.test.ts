import { describe, expect, it } from "vitest";
import { pino } from "pino";
import { buildAwsServices } from "../src/buildServices.js";
import { CognitoAuth } from "../src/services/aws/cognito-auth.js";
import {
  DynamoAuditRepo,
  DynamoCommentRepo,
  DynamoProjectRepo,
  DynamoTaskRepo,
  DynamoTeamRepo,
  DynamoUserRepo
} from "../src/services/aws/dynamo-repos.js";
import { S3Storage } from "../src/services/aws/s3-storage.js";
import { CloudWatchMetrics, NoopMetrics } from "../src/services/metrics.js";
import { SnsNotifier } from "../src/services/notifications.js";
import { CognitoUserAdmin } from "../src/services/aws/cognito-user-admin.js";
import type { AppConfig } from "../src/config.js";

function awsConfig(): AppConfig {
  return {
    backend: "aws",
    port: 4000,
    awsRegion: "us-east-1",
    cognito: { userPoolId: "us-east-1_abc12345", clientId: "test-client-id" },
    dynamo: {
      tasksTable: "MiniJira_Tasks",
      projectsTable: "MiniJira_Projects",
      commentsTable: "MiniJira_Comments",
      auditLogsTable: "MiniJira_AuditLogs",
      usersTable: "MiniJira_Users",
      teamsTable: "MiniJira_Teams"
    },
    s3: { originalsBucket: "mini-jira-originals-test", resizedBucket: "mini-jira-resized-test" },
    sns: { taskAssignedTopicArn: "arn:aws:sns:us-east-1:123456789012:mini-jira-task-assigned" }
  };
}

describe("buildAwsServices wiring", () => {
  it("returns AWS-mode implementations for every service seam", () => {
    const services = buildAwsServices(awsConfig(), { logger: pino({ level: "silent" }) });
    expect(services.auth).toBeInstanceOf(CognitoAuth);
    expect(services.tasks).toBeInstanceOf(DynamoTaskRepo);
    expect(services.projects).toBeInstanceOf(DynamoProjectRepo);
    expect(services.comments).toBeInstanceOf(DynamoCommentRepo);
    expect(services.audit).toBeInstanceOf(DynamoAuditRepo);
    expect(services.users).toBeInstanceOf(DynamoUserRepo);
    expect(services.teams).toBeInstanceOf(DynamoTeamRepo);
    expect(services.storage).toBeInstanceOf(S3Storage);
    expect(services.notifier).toBeInstanceOf(SnsNotifier);
    expect(services.metrics).toBeInstanceOf(CloudWatchMetrics);
    expect(services.metrics).not.toBeInstanceOf(NoopMetrics);
    expect(services.userAdmin).toBeInstanceOf(CognitoUserAdmin);
  });

  it("throws when a required env var is missing", () => {
    const config = awsConfig();
    config.cognito.userPoolId = undefined;
    expect(() => buildAwsServices(config, { logger: pino({ level: "silent" }) })).toThrow(
      /COGNITO_USER_POOL_ID/
    );
  });

  it("throws when the SNS topic ARN is missing", () => {
    const config = awsConfig();
    config.sns.taskAssignedTopicArn = undefined;
    expect(() => buildAwsServices(config, { logger: pino({ level: "silent" }) })).toThrow(
      /SNS_TOPIC_TASKS_ASSIGNED/
    );
  });

  it("throws when the S3 originals bucket is missing", () => {
    const config = awsConfig();
    config.s3.originalsBucket = undefined;
    expect(() => buildAwsServices(config, { logger: pino({ level: "silent" }) })).toThrow(
      /S3_ORIGINALS_BUCKET/
    );
  });

  it("throws when a Dynamo table name is missing", () => {
    const config = awsConfig();
    config.dynamo.tasksTable = undefined;
    expect(() => buildAwsServices(config, { logger: pino({ level: "silent" }) })).toThrow(
      /tasksTable/
    );
  });
});
