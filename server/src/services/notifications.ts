import type { Task, User } from "@mini-jira/shared";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { Logger } from "../logger.js";

/**
 * Producer-side seam for the spec's SNS fan-out:
 *   Manager assigns task -> publish to SNS -> (a) email to assignee, (b) SQS to worker Lambda.
 *
 * Routes call publishAssignment() on task create and on task reassignment. Local mode
 * uses NoopNotifier (logs only). AWS mode uses SnsNotifier.
 */
export interface AssignmentNotifier {
  publishAssignment(task: Task, assignee: User): Promise<void>;
}

export class NoopNotifier implements AssignmentNotifier {
  constructor(private readonly logger?: Logger) {}

  async publishAssignment(task: Task, assignee: User): Promise<void> {
    this.logger?.info(
      { taskId: task.id, assigneeId: assignee.id, assigneeEmail: assignee.email, teamId: task.teamId },
      "notifier:noop assignment"
    );
  }
}

export interface SnsNotifierConfig {
  client: SNSClient;
  topicArn: string;
}

export class SnsNotifier implements AssignmentNotifier {
  private readonly client: SNSClient;
  private readonly topicArn: string;

  constructor(config: SnsNotifierConfig, private readonly logger?: Logger) {
    this.client = config.client;
    this.topicArn = config.topicArn;
  }

  async publishAssignment(task: Task, assignee: User): Promise<void> {
    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: `New task assigned: ${task.title}`.slice(0, 100),
          Message: JSON.stringify({
            taskId: task.id,
            teamId: task.teamId,
            assigneeId: assignee.id,
            assigneeEmail: assignee.email,
            deadline: task.deadline,
            priority: task.priority,
            title: task.title
          }),
          MessageAttributes: {
            teamId: { DataType: "String", StringValue: task.teamId },
            assigneeId: { DataType: "String", StringValue: assignee.id }
          }
        })
      );
    } catch (error) {
      // Fan-out failures must not break the API write; log and move on.
      this.logger?.error({ err: error, taskId: task.id }, "sns publish failed");
    }
  }
}
