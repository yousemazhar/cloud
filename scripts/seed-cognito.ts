/**
 * Seeds the demo users (Ali / Sara / Omar) into Cognito and DynamoDB.
 * The spec demo scenario MUST work without code changes on demo day, so this script
 * is the single source of truth for the three accounts.
 *
 * Run:
 *   npx ts-node scripts/seed-cognito.ts \
 *     --user-pool-id us-east-1_xxxx \
 *     --client-id xxxxxxxxxxx \
 *     --region us-east-1
 *
 * Requires AWS_PROFILE=mini-jira (or env credentials) with admin rights on the pool.
 */
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  ListSubscriptionsByTopicCommand,
  SNSClient,
  SubscribeCommand,
  type Subscription
} from "@aws-sdk/client-sns";

interface Args {
  userPoolId: string;
  clientId: string;
  region: string;
  tasksAssignedTopicArn?: string;
  dailyDigestTopicArn?: string;
  alertsTopicArn?: string;
}

function parseArgs(): Args {
  const out: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = process.argv[i + 1];
  }
  if (!out.userPoolId || !out.clientId) {
    throw new Error("Usage: seed-cognito.ts --user-pool-id <id> --client-id <id> [--region us-east-1]");
  }
  return {
    userPoolId: out.userPoolId,
    clientId: out.clientId,
    region: out.region ?? "us-east-1",
    tasksAssignedTopicArn: out.snsTopicTasksAssigned ?? process.env.SNS_TOPIC_TASKS_ASSIGNED,
    dailyDigestTopicArn: out.snsTopicDailyDigest ?? process.env.SNS_TOPIC_DAILY_DIGEST,
    alertsTopicArn: out.snsTopicAlerts ?? process.env.SNS_TOPIC_ALERTS
  };
}

const DEFAULT_PASSWORD = "MiniJira#2026";

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: "manager" | "employee";
  teamId: string; // empty string for managers
}

interface SeedTeam {
  id: string;
  name: string;
}

const TEAMS: SeedTeam[] = [
  { id: "team-frontend", name: "Frontend" },
  { id: "team-backend", name: "Backend" }
];

const USERS: SeedUser[] = [
  { id: "user-ali", email: "ali@minijira.test", name: "Ali", role: "manager", teamId: "" },
  { id: "user-sara", email: "sara@minijira.test", name: "Sara", role: "employee", teamId: "team-frontend" },
  { id: "user-omar", email: "omar@minijira.test", name: "Omar", role: "employee", teamId: "team-backend" },
  { id: "user-jess", email: "jess@minijira.test", name: "Jess", role: "admin", teamId: "" }
];

async function upsertCognitoUser(cog: CognitoIdentityProviderClient, args: Args, user: SeedUser): Promise<string> {
  const attributes = [
    { Name: "email", Value: user.email },
    { Name: "email_verified", Value: "true" },
    { Name: "name", Value: user.name },
    { Name: "custom:role", Value: user.role },
    { Name: "custom:teamId", Value: user.teamId }
  ];

  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: args.userPoolId,
      Username: user.email,
      UserAttributes: attributes,
      MessageAction: "SUPPRESS" // don't email a temporary password
    }));
    console.log(`created cognito user ${user.email}`);
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      console.log(`cognito user already exists: ${user.email}`);
      await cog.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: args.userPoolId,
        Username: user.email,
        UserAttributes: attributes
      }));
    } else throw err;
  }

  await cog.send(new AdminSetUserPasswordCommand({
    UserPoolId: args.userPoolId,
    Username: user.email,
    Password: DEFAULT_PASSWORD,
    Permanent: true
  }));

  // Fetch the sub (Cognito-generated UUID) — this is what authenticate() returns as user.id
  const got = await cog.send(new AdminGetUserCommand({
    UserPoolId: args.userPoolId,
    Username: user.email
  }));
  const sub = got.UserAttributes?.find((a) => a.Name === "sub")?.Value;
  if (!sub) throw new Error(`could not find sub for ${user.email}`);
  return sub;
}

async function upsertDynamoUser(ddb: DynamoDBDocumentClient, user: SeedUser, cognitoSub: string): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: "MiniJira_Users",
    Item: {
      // Use the Cognito sub as the Dynamo PK so user.id == authenticated user's sub.
      id: cognitoSub,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId || undefined,
      // Keep the original seed id for cross-referencing in scripts/tests
      seedId: user.id,
      createdAt: now,
      updatedAt: now
    }
  }));
}

async function upsertDynamoTeam(ddb: DynamoDBDocumentClient, team: SeedTeam): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: "MiniJira_Teams",
    Item: { id: team.id, name: team.name, createdAt: now, updatedAt: now }
  }));
}

async function main(): Promise<void> {
  const args = parseArgs();
  const cog = new CognitoIdentityProviderClient({ region: args.region });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: args.region }));

  for (const team of TEAMS) {
    await upsertDynamoTeam(ddb, team);
    console.log(`seeded team ${team.id}`);
  }

  const subsByEmail: Record<string, string> = {};
  for (const user of USERS) {
    const sub = await upsertCognitoUser(cog, args, user);
    await upsertDynamoUser(ddb, user, sub);
    subsByEmail[user.email] = sub;
    console.log(`seeded user ${user.id} sub=${sub} (${user.role}${user.teamId ? `/${user.teamId}` : ""})`);
  }

  if (args.tasksAssignedTopicArn) {
    const sns = new SNSClient({ region: args.region });
    const topics: { arn: string; filter?: boolean }[] = [
      { arn: args.tasksAssignedTopicArn, filter: true }
    ];
    if (args.dailyDigestTopicArn) topics.push({ arn: args.dailyDigestTopicArn });
    if (args.alertsTopicArn) topics.push({ arn: args.alertsTopicArn });

    for (const user of USERS) {
      for (const topic of topics) {
        try {
          await ensureEmailSubscription(sns, topic.arn, user.email, topic.filter ?? false);
          console.log(`subscribed ${user.email} -> ${topic.arn} (confirmation pending)`);
        } catch (err) {
          console.error(`subscribeUser failed for ${user.email} @ ${topic.arn}`, err);
        }
      }
    }
  } else {
    console.log("(no --sns-topic-tasks-assigned passed; skipping SNS subscriptions)");
  }
  console.log("\nCognito sub -> email mapping:");
  for (const [email, sub] of Object.entries(subsByEmail)) console.log(`  ${email} = ${sub}`);

  console.log("\nDemo password for all three accounts:", DEFAULT_PASSWORD);
  console.log("Sign in at the CloudFront URL using the emails above.");
}

async function ensureEmailSubscription(
  sns: SNSClient,
  topicArn: string,
  email: string,
  filterByAssigneeEmail: boolean
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const existing = await listSubs(sns, topicArn);
  const match = existing.find(
    (s) => s.Protocol === "email" && (s.Endpoint ?? "").toLowerCase() === normalized
  );
  if (match && match.SubscriptionArn && match.SubscriptionArn !== "PendingConfirmation") return;
  if (match && match.SubscriptionArn === "PendingConfirmation") return;
  await sns.send(new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: "email",
    Endpoint: normalized,
    ReturnSubscriptionArn: true,
    Attributes: filterByAssigneeEmail
      ? {
          FilterPolicy: JSON.stringify({ assigneeEmail: [normalized] }),
          FilterPolicyScope: "MessageAttributes"
        }
      : undefined
  }));
}

async function listSubs(sns: SNSClient, topicArn: string): Promise<Subscription[]> {
  const out: Subscription[] = [];
  let nextToken: string | undefined;
  do {
    const page = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn, NextToken: nextToken }));
    out.push(...(page.Subscriptions ?? []));
    nextToken = page.NextToken;
  } while (nextToken);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
