"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/src/lambdas/daily-digest.ts
var daily_digest_exports = {};
__export(daily_digest_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(daily_digest_exports);
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_sns = require("@aws-sdk/client-sns");
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var sns = new import_client_sns.SNSClient({});
var cw = new import_client_cloudwatch.CloudWatchClient({});
var TASKS_TABLE = process.env.DYNAMO_TASKS_TABLE;
var USERS_TABLE = process.env.DYNAMO_USERS_TABLE;
var DAILY_DIGEST_TOPIC_ARN = process.env.DAILY_DIGEST_TOPIC_ARN;
var METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? "MiniJira";
var DONE = "done";
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
async function scanAll(tableName) {
  let lastKey;
  const all = [];
  do {
    const page = await ddb.send(new import_lib_dynamodb.ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey
    }));
    for (const item of page.Items ?? []) {
      all.push(item);
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return all;
}
async function handler() {
  const today = isoDate(new Date(Date.now() + 3 * 60 * 60 * 1e3));
  console.log("daily-digest run", { today });
  const all = await scanAll(TASKS_TABLE);
  const users = await scanAll(USERS_TABLE);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const dueToday = all.filter((t) => t.deadline && t.deadline.slice(0, 10) === today && t.status !== DONE);
  const overdue = all.filter((t) => t.deadline && t.deadline.slice(0, 10) < today && t.status !== DONE);
  const byAssignee = /* @__PURE__ */ new Map();
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
    const lines = tasks.map(
      (t) => `- [${t.priority ?? "?"}] ${t.title} (status: ${t.status})`
    ).join("\n");
    const message = `Tasks due today for ${assignee.name ?? assignee.email}:

${lines}

Open Mini-Jira to update status.`;
    await sns.send(new import_client_sns.PublishCommand({
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
  await cw.send(new import_client_cloudwatch.PutMetricDataCommand({
    Namespace: METRIC_NAMESPACE,
    MetricData: [
      { MetricName: "OverdueTasks", Value: overdue.length, Unit: import_client_cloudwatch.StandardUnit.Count, Timestamp: /* @__PURE__ */ new Date() },
      { MetricName: "TasksDueToday", Value: dueToday.length, Unit: import_client_cloudwatch.StandardUnit.Count, Timestamp: /* @__PURE__ */ new Date() }
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
