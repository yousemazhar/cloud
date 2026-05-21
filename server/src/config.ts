export type Backend = "local" | "aws";

export interface AppConfig {
  backend: Backend;
  port: number;
  awsRegion: string;
  // Populated only when backend === "aws"
  cognito: { userPoolId?: string; clientId?: string };
  dynamo: { tasksTable?: string; projectsTable?: string; commentsTable?: string; auditLogsTable?: string; teamsTable?: string; usersTable?: string };
  s3: { originalsBucket?: string; resizedBucket?: string };
  sns: { taskAssignedTopicArn?: string; dailyDigestTopicArn?: string; alertsTopicArn?: string };
}

export function loadConfig(): AppConfig {
  const backend: Backend = process.env.MINI_JIRA_BACKEND === "aws" ? "aws" : "local";
  return {
    backend,
    port: Number(process.env.PORT ?? 4000),
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    cognito: {
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      clientId: process.env.COGNITO_CLIENT_ID
    },
    dynamo: {
      tasksTable: process.env.DYNAMO_TASKS_TABLE,
      projectsTable: process.env.DYNAMO_PROJECTS_TABLE,
      commentsTable: process.env.DYNAMO_COMMENTS_TABLE,
      auditLogsTable: process.env.DYNAMO_AUDIT_LOGS_TABLE,
      teamsTable: process.env.DYNAMO_TEAMS_TABLE,
      usersTable: process.env.DYNAMO_USERS_TABLE
    },
    s3: {
      originalsBucket: process.env.S3_ORIGINALS_BUCKET,
      resizedBucket: process.env.S3_RESIZED_BUCKET
    },
    sns: {
      taskAssignedTopicArn: process.env.SNS_TOPIC_TASKS_ASSIGNED,
      dailyDigestTopicArn: process.env.SNS_TOPIC_DAILY_DIGEST,
      alertsTopicArn: process.env.SNS_TOPIC_ALERTS
    }
  };
}
