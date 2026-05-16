import type { Task, User } from "@mini-jira/shared";

/**
 * Producer-side seam for the spec's SNS fan-out:
 *   Manager assigns task -> publish to SNS -> (a) email to assignee, (b) SQS to worker Lambda.
 *
 * Routes call publishAssignment() on task create and on task reassignment. The local backend
 * uses NoopNotifier (logs only). The AWS deployment swaps in an SnsNotifier that publishes
 * to the topic ARN in config.sns.taskAssignedTopicArn.
 */
export interface AssignmentNotifier {
  publishAssignment(task: Task, assignee: User): Promise<void>;
}

export class NoopNotifier implements AssignmentNotifier {
  async publishAssignment(task: Task, assignee: User): Promise<void> {
    // Intentionally cheap: visible in dev logs, replaced by SnsNotifier in AWS mode.
    console.log(`[notifier:noop] task ${task.id} assigned to ${assignee.email}`);
  }
}

/*
 * To enable in AWS mode, install @aws-sdk/client-sns and replace this stub:
 *
 *   import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
 *
 *   export class SnsNotifier implements AssignmentNotifier {
 *     constructor(private readonly client: SNSClient, private readonly topicArn: string) {}
 *     async publishAssignment(task: Task, assignee: User): Promise<void> {
 *       await this.client.send(new PublishCommand({
 *         TopicArn: this.topicArn,
 *         Subject: `New task assigned: ${task.title}`,
 *         Message: JSON.stringify({ taskId: task.id, teamId: task.teamId, assigneeId: assignee.id, assigneeEmail: assignee.email, deadline: task.deadline, priority: task.priority }),
 *         MessageAttributes: { teamId: { DataType: "String", StringValue: task.teamId } }
 *       }));
 *     }
 *   }
 */
