#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DataStack } from "../lib/data-stack";
import { AuthStack } from "../lib/auth-stack";
import { MessagingStack } from "../lib/messaging-stack";
import { LambdaStack } from "../lib/lambda-stack";
import { ComputeStack } from "../lib/compute-stack";
import { EdgeStack } from "../lib/edge-stack";
import { ObservabilityStack } from "../lib/observability-stack";

const app = new cdk.App();

const account = app.node.tryGetContext("miniJira:account") ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext("miniJira:region") ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";
const notifyEmail = app.node.tryGetContext("miniJira:notifyEmail") ?? "yousefmazhar121@gmail.com";

const env = { account, region };

const network = new NetworkStack(app, "MiniJira-Network", { env });
const data = new DataStack(app, "MiniJira-Data", { env });
const auth = new AuthStack(app, "MiniJira-Auth", { env });
const messaging = new MessagingStack(app, "MiniJira-Messaging", { env, notifyEmail });

const lambdas = new LambdaStack(app, "MiniJira-Lambdas", {
  env,
  tasksTable: data.tasksTable,
  usersTable: data.usersTable,
  auditLogsTable: data.auditLogsTable,
  originalsBucket: data.originalsBucket,
  resizedBucket: data.resizedBucket,
  assignmentQueue: messaging.assignmentQueue,
  dailyDigestTopic: messaging.dailyDigestTopic,
  alertsTopic: messaging.alertsTopic
});

const compute = new ComputeStack(app, "MiniJira-Compute", {
  env,
  vpc: network.vpc,
  tasksTable: data.tasksTable,
  projectsTable: data.projectsTable,
  commentsTable: data.commentsTable,
  auditLogsTable: data.auditLogsTable,
  usersTable: data.usersTable,
  teamsTable: data.teamsTable,
  originalsBucket: data.originalsBucket,
  resizedBucket: data.resizedBucket,
  artifactsBucket: data.artifactsBucket,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  taskAssignedTopic: messaging.taskAssignedTopic,
  dailyDigestTopic: messaging.dailyDigestTopic,
  alertsTopic: messaging.alertsTopic
});

const edge = new EdgeStack(app, "MiniJira-Edge", {
  env,
  alb: compute.alb
});

new ObservabilityStack(app, "MiniJira-Observability", {
  env,
  asg: compute.asg,
  alertsTopic: messaging.alertsTopic,
  tasksTable: data.tasksTable
});

// Cross-stack tags help cost reporting / cleanup
cdk.Tags.of(app).add("Project", "mini-jira");
cdk.Tags.of(app).add("Course", "cloud-computing-s26");

// Suppress unused-var warnings in strict mode
void lambdas;
void edge;
