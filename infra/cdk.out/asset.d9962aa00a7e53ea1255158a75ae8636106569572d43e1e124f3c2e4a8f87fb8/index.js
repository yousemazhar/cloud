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

// server/src/lambdas/assignment-worker.ts
var assignment_worker_exports = {};
__export(assignment_worker_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(assignment_worker_exports);
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_node_crypto = require("node:crypto");
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var cw = new import_client_cloudwatch.CloudWatchClient({});
var AUDIT_TABLE = process.env.DYNAMO_AUDIT_LOGS_TABLE;
var METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? "MiniJira";
function parseSqsRecord(record) {
  try {
    const envelope = JSON.parse(record.body);
    const inner = typeof envelope.Message === "string" ? JSON.parse(envelope.Message) : envelope;
    if (!inner.taskId || !inner.teamId || !inner.assigneeId) return null;
    return inner;
  } catch (err) {
    console.error("parse failed", { messageId: record.messageId, err });
    return null;
  }
}
async function handler(event) {
  const failures = [];
  for (const record of event.Records) {
    const payload = parseSqsRecord(record);
    if (!payload) {
      failures.push({ itemIdentifier: record.messageId });
      continue;
    }
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const id = (0, import_node_crypto.randomUUID)();
    try {
      await ddb.send(new import_lib_dynamodb.PutCommand({
        TableName: AUDIT_TABLE,
        Item: {
          taskId: payload.taskId,
          "createdAt#id": `${createdAt}#${id}`,
          id,
          createdAt,
          actorId: "system:assignment-worker",
          action: "ASSIGNED",
          teamId: payload.teamId,
          assigneeId: payload.assigneeId,
          details: {
            title: payload.title,
            priority: payload.priority,
            deadline: payload.deadline,
            assigneeEmail: payload.assigneeEmail
          }
        }
      }));
      await cw.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: "TasksAssignedPerTeam",
            Dimensions: [{ Name: "teamId", Value: payload.teamId }],
            Value: 1,
            Unit: import_client_cloudwatch.StandardUnit.Count,
            Timestamp: /* @__PURE__ */ new Date()
          },
          {
            MetricName: "TasksAssigned",
            Value: 1,
            Unit: import_client_cloudwatch.StandardUnit.Count,
            Timestamp: /* @__PURE__ */ new Date()
          }
        ]
      }));
      console.log("processed", { taskId: payload.taskId, teamId: payload.teamId });
    } catch (err) {
      console.error("worker failed", { messageId: record.messageId, err });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
