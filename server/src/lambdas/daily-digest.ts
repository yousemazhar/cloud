import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { TaskStatus } from "@mini-jira/shared";

/**
 * EventBridge schedule (9:00 AM GMT+3 daily / 06:00 UTC) -> scan tasks, for each task whose
 * deadline === today: send the assignee a digest email via SNS.
 *
 * Also emits MiniJira/OverdueTasks gauge so the dashboard widget + alarm work.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const cw = new CloudWatchClient({});

const TASKS_TABLE = process.env.DYNAMO_TASKS_TABLE!;
const USERS_TABLE = process.env.DYNAMO_USERS_TABLE!;
const DAILY_DIGEST_TOPIC_ARN = process.env.DAILY_DIGEST_TOPIC_ARN!;
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? "MiniJira";

const DONE: TaskStatus = "done";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority?: string;
  deadline?: string;
  assigneeId?: string;
  teamId?: string;
}

interface UserRow {
  id: string;
  email?: string;
  name?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function scanAll<T>(tableName: string): Promise<T[]> {
  let lastKey: Record<string, unknown> | undefined;
  const all: T[] = [];
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey
    }));
    for (const item of page.Items ?? []) {
      all.push(item as T);
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

export async function handler(): Promise<void> {
  // Spec: "9 AM daily" runs in Cairo time (GMT+3, no DST). Compute today's
  // date in +03:00 so the deadline-string match below is unambiguous regardless
  // of where the Lambda's clock reports UTC.
  const today = isoDate(new Date(Date.now() + 3 * 60 * 60 * 1000));
  console.log("daily-digest run", { today });

  // Single Scan is fine at course-demo scale. Production would use the GSIs.
  const all = await scanAll<TaskRow>(TASKS_TABLE);
  const users = await scanAll<UserRow>(USERS_TABLE);
  const usersById = new Map(users.map((user) => [user.id, user]));

  const dueToday = all.filter((t) => t.deadline && t.deadline.slice(0, 10) === today && t.status !== DONE);
  const overdue = all.filter((t) => t.deadline && t.deadline.slice(0, 10) < today && t.status !== DONE);

  // Group by assignee for the digest email
  const byAssignee = new Map<string, TaskRow[]>();
  for (const t of dueToday) {
    if (!t.assigneeId) continue;
    const list = byAssignee.get(t.assigneeId) ?? [];
    list.push(t);
    byAssignee.set(t.assigneeId, list);
  }

  for (const [assigneeId, tasks] of byAssignee) {
    const assignee = usersById.get(assigneeId);
    if (!assignee?.email) {
      console.warn("digest skipped missing assignee email", { assigneeId, taskIds: tasks.map((task) => task.id) });
      continue;
    }
    const lines = tasks.map((t) =>
      `- [${t.priority ?? "?"}] ${t.title} (status: ${t.status})`
    ).join("\n");
    const message = `Tasks due today for ${assignee.name ?? assignee.email}:\n\n${lines}\n\n` +
      `Open Mini-Jira to update status.`;

    await sns.send(new PublishCommand({
      TopicArn: DAILY_DIGEST_TOPIC_ARN,
      Subject: `Mini-Jira: ${tasks.length} task(s) due today`.slice(0, 100),
      Message: message,
      MessageAttributes: {
        assigneeId: { DataType: "String", StringValue: assigneeId },
        assigneeEmail: { DataType: "String", StringValue: assignee.email.trim().toLowerCase() },
        count: { DataType: "Number", StringValue: String(tasks.length) }
      }
    }));
  }

  await cw.send(new PutMetricDataCommand({
    Namespace: METRIC_NAMESPACE,
    MetricData: [
      { MetricName: "OverdueTasks", Value: overdue.length, Unit: StandardUnit.Count, Timestamp: new Date() },
      { MetricName: "TasksDueToday", Value: dueToday.length, Unit: StandardUnit.Count, Timestamp: new Date() }
    ]
  }));

  console.log("digest done", {
    today,
    totalTasks: all.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    assigneesNotified: byAssignee.size
  });
}
