/**
 * Creates/repairs filtered SNS email subscriptions for current Mini-Jira users.
 *
 * Run before a demo so each assignee receives one SNS confirmation email:
 *   npx ts-node scripts/sync-assignee-sns-subscriptions.ts \
 *     --topic-arn arn:aws:sns:us-east-1:839629614250:mini-jira-tasks-assigned \
 *     --users-table MiniJira_Users \
 *     --region us-east-1
 *
 * Each recipient must click the AWS confirmation link once before task-assignment
 * emails can be delivered.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  ListSubscriptionsByTopicCommand,
  SetSubscriptionAttributesCommand,
  SNSClient,
  SubscribeCommand,
  type Subscription
} from "@aws-sdk/client-sns";

interface Args {
  topicArn: string;
  usersTable: string;
  region: string;
  includeManagers: boolean;
}

interface UserRow {
  email?: string;
  role?: string;
}

function parseArgs(): Args {
  const out: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = process.argv[i + 1];
  }
  if (!out.topicArn) throw new Error("Usage: sync-assignee-sns-subscriptions.ts --topic-arn <arn> [--users-table MiniJira_Users] [--region us-east-1] [--include-managers true]");
  return {
    topicArn: out.topicArn,
    usersTable: out.usersTable ?? "MiniJira_Users",
    region: out.region ?? "us-east-1",
    includeManagers: out.includeManagers === "true"
  };
}

async function listUsers(ddb: DynamoDBDocumentClient, tableName: string, includeManagers: boolean): Promise<string[]> {
  const emails = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: "email, #role",
      ExpressionAttributeNames: { "#role": "role" }
    }));
    for (const item of page.Items ?? []) {
      const user = item as UserRow;
      if (!user.email) continue;
      if (!includeManagers && user.role !== "employee") continue;
      emails.add(normalizeEmail(user.email));
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return [...emails].sort();
}

async function listSubscriptions(sns: SNSClient, topicArn: string): Promise<Subscription[]> {
  const subscriptions: Subscription[] = [];
  let nextToken: string | undefined;
  do {
    const page = await sns.send(new ListSubscriptionsByTopicCommand({
      TopicArn: topicArn,
      NextToken: nextToken
    }));
    subscriptions.push(...(page.Subscriptions ?? []));
    nextToken = page.NextToken;
  } while (nextToken);
  return subscriptions;
}

async function ensureSubscription(sns: SNSClient, topicArn: string, subscriptions: Subscription[], email: string): Promise<void> {
  const matches = subscriptions.filter((subscription) =>
    subscription.Protocol === "email" && normalizeEmail(subscription.Endpoint) === email
  );
  const confirmed = matches.find((subscription) => subscription.SubscriptionArn?.startsWith("arn:"));
  if (confirmed?.SubscriptionArn) {
    await setFilter(sns, confirmed.SubscriptionArn, email);
    console.log(`repaired/verified filter for confirmed subscription: ${email}`);
    return;
  }

  const pending = matches.find((subscription) => subscription.SubscriptionArn === "PendingConfirmation");
  if (pending) {
    console.log(`pending confirmation already exists: ${email}`);
    return;
  }

  await sns.send(new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: "email",
    Endpoint: email,
    ReturnSubscriptionArn: true,
    Attributes: filterAttributes(email)
  }));
  console.log(`created subscription confirmation request: ${email}`);
}

async function setFilter(sns: SNSClient, subscriptionArn: string, email: string): Promise<void> {
  const attrs = filterAttributes(email);
  await sns.send(new SetSubscriptionAttributesCommand({
    SubscriptionArn: subscriptionArn,
    AttributeName: "FilterPolicy",
    AttributeValue: attrs.FilterPolicy
  }));
  await sns.send(new SetSubscriptionAttributesCommand({
    SubscriptionArn: subscriptionArn,
    AttributeName: "FilterPolicyScope",
    AttributeValue: attrs.FilterPolicyScope
  }));
}

function filterAttributes(email: string): Record<string, string> {
  return {
    FilterPolicy: JSON.stringify({ assigneeEmail: [email] }),
    FilterPolicyScope: "MessageAttributes"
  };
}

function normalizeEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

async function main(): Promise<void> {
  const args = parseArgs();
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: args.region }));
  const sns = new SNSClient({ region: args.region });
  const emails = await listUsers(ddb, args.usersTable, args.includeManagers);
  const subscriptions = await listSubscriptions(sns, args.topicArn);

  console.log(`found ${emails.length} assignee email(s) in ${args.usersTable}`);
  for (const email of emails) {
    await ensureSubscription(sns, args.topicArn, subscriptions, email);
  }
  console.log("done. Any newly created or pending email subscription must be confirmed from the recipient inbox.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
