import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

/**
 * EventBridge schedule (09:00 UTC daily) -> scan tasks, for each task whose
 * deadline === today: send the assignee a digest email via SNS.
 *
 * Also emits MiniJira/OverdueTasks gauge so the dashboard widget + alarm work.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const cw = new CloudWatchClient({});

const TASKS_TABLE = process.env.DYNAMO_TASKS_TABLE!;
const DAILY_DIGEST_TOPIC_ARN = process.env.DAILY_DIGEST_TOPIC_ARN!;
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? "MiniJira";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority?: string;
  deadline?: string;
  assigneeId?: string;
  teamId?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function handler(): Promise<void> {
  const today = isoDate(new Date());
  console.log("daily-digest run", { today });

  // Single Scan is fine at course-demo scale. Production would use the GSIs.
  let lastKey: Record<string, unknown> | undefined;
  const all: TaskRow[] = [];
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: TASKS_TABLE,
      ExclusiveStartKey: lastKey
    }));
    for (const item of page.Items ?? []) {
      all.push(item as TaskRow);
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  const dueToday = all.filter((t) => t.deadline && t.deadline.slice(0, 10) === today && t.status !== "Done");
  const overdue = all.filter((t) => t.deadline && t.deadline.slice(0, 10) < today && t.status !== "Done");

  // Group by assignee for the digest email
  const byAssignee = new Map<string, TaskRow[]>();
  for (const t of dueToday) {
    if (!t.assigneeId) continue;
    const list = byAssignee.get(t.assigneeId) ?? [];
    list.push(t);
    byAssignee.set(t.assigneeId, list);
  }

  for (const [assigneeId, tasks] of byAssignee) {
    const lines = tasks.map((t) =>
      `- [${t.priority ?? "?"}] ${t.title} (status: ${t.status})`
    ).join("\n");
    const message = `Tasks due today for assignee ${assigneeId}:\n\n${lines}\n\n` +
      `Open Mini-Jira to update status.`;

    await sns.send(new PublishCommand({
      TopicArn: DAILY_DIGEST_TOPIC_ARN,
      Subject: `Mini-Jira: ${tasks.length} task(s) due today`.slice(0, 100),
      Message: message,
      MessageAttributes: {
        assigneeId: { DataType: "String", StringValue: assigneeId },
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
