import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { randomUUID } from "node:crypto";

/**
 * Drains the assignment SQS queue (SNS->SQS fan-out). For each event:
 *   1. Append a row to MiniJira_AuditLogs documenting the assignment.
 *   2. Emit MiniJira/TasksAssignedPerTeam custom CloudWatch metric (dim teamId).
 *
 * Spec requirement: this Lambda is the consumer side of the SNS+SQS event-driven
 * notification pattern.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cw = new CloudWatchClient({});

const AUDIT_TABLE = process.env.DYNAMO_AUDIT_LOGS_TABLE!;
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? "MiniJira";

interface AssignmentPayload {
  taskId: string;
  teamId: string;
  assigneeId: string;
  assigneeEmail: string;
  deadline?: string;
  priority?: string;
  title?: string;
}

function parseSqsRecord(record: SQSRecord): AssignmentPayload | null {
  try {
    // SNS->SQS wraps the publisher's Message in an envelope.
    const envelope = JSON.parse(record.body);
    const inner = typeof envelope.Message === "string" ? JSON.parse(envelope.Message) : envelope;
    if (!inner.taskId || !inner.teamId || !inner.assigneeId) return null;
    return inner as AssignmentPayload;
  } catch (err) {
    console.error("parse failed", { messageId: record.messageId, err });
    return null;
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const payload = parseSqsRecord(record);
    if (!payload) {
      // Malformed -> let SQS DLQ catch it after retries.
      failures.push({ itemIdentifier: record.messageId });
      continue;
    }

    const createdAt = new Date().toISOString();
    const id = randomUUID();

    try {
      await ddb.send(new PutCommand({
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

      await cw.send(new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: "TasksAssignedPerTeam",
            Dimensions: [{ Name: "teamId", Value: payload.teamId }],
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date()
          },
          {
            MetricName: "TasksAssigned",
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date()
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
