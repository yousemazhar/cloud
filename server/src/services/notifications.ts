import type { Task, User } from "@mini-jira/shared";
import {
  ListSubscriptionsByTopicCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SNSClient,
  SubscribeCommand,
  type Subscription
} from "@aws-sdk/client-sns";
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
    const assigneeEmail = normalizeEmail(assignee.email);
    try {
      await this.ensureEmailSubscription(assigneeEmail);
    } catch (error) {
      this.logger?.error(
        { err: error, taskId: task.id, assigneeEmail },
        "sns email subscription setup failed"
      );
    }

    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: `New task assigned: ${task.title}`.slice(0, 100),
          Message: JSON.stringify({
            taskId: task.id,
            teamId: task.teamId,
            assigneeId: assignee.id,
            assigneeEmail,
            deadline: task.deadline,
            priority: task.priority,
            title: task.title
          }),
          MessageAttributes: {
            teamId: { DataType: "String", StringValue: task.teamId },
            assigneeId: { DataType: "String", StringValue: assignee.id },
            assigneeEmail: { DataType: "String", StringValue: assigneeEmail }
          }
        })
      );
    } catch (error) {
      // Fan-out failures must not break the API write; log and move on.
      this.logger?.error({ err: error, taskId: task.id }, "sns publish failed");
    }
  }

  private async ensureEmailSubscription(assigneeEmail: string): Promise<void> {
    const subscriptions = await this.listSubscriptions();
    const emailSubscriptions = subscriptions.filter((subscription) =>
      subscription.Protocol === "email" && normalizeEmail(subscription.Endpoint) === assigneeEmail
    );
    const confirmed = emailSubscriptions.find((subscription) => isConfirmedArn(subscription.SubscriptionArn));
    if (confirmed?.SubscriptionArn) {
      await this.applyAssigneeFilter(confirmed.SubscriptionArn, assigneeEmail);
      return;
    }

    const pending = emailSubscriptions.find((subscription) => subscription.SubscriptionArn === "PendingConfirmation");
    if (pending) {
      this.logger?.warn(
        { assigneeEmail, topicArn: this.topicArn },
        "sns email subscription is pending confirmation; assignee must confirm before task emails are delivered"
      );
      return;
    }

    await this.client.send(
      new SubscribeCommand({
        TopicArn: this.topicArn,
        Protocol: "email",
        Endpoint: assigneeEmail,
        ReturnSubscriptionArn: true,
        Attributes: emailFilterAttributes(assigneeEmail)
      })
    );
    this.logger?.warn(
      { assigneeEmail, topicArn: this.topicArn },
      "created sns email subscription; assignee must confirm before task emails are delivered"
    );
  }

  private async listSubscriptions(): Promise<Subscription[]> {
    const subscriptions: Subscription[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListSubscriptionsByTopicCommand({
          TopicArn: this.topicArn,
          NextToken: nextToken
        })
      );
      subscriptions.push(...(page.Subscriptions ?? []));
      nextToken = page.NextToken;
    } while (nextToken);
    return subscriptions;
  }

  private async applyAssigneeFilter(subscriptionArn: string, assigneeEmail: string): Promise<void> {
    const attributes = emailFilterAttributes(assigneeEmail);
    await this.client.send(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "FilterPolicy",
        AttributeValue: attributes.FilterPolicy
      })
    );
    await this.client.send(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "FilterPolicyScope",
        AttributeValue: attributes.FilterPolicyScope
      })
    );
  }
}

function emailFilterAttributes(assigneeEmail: string): Record<string, string> {
  return {
    FilterPolicy: JSON.stringify({ assigneeEmail: [assigneeEmail] }),
    FilterPolicyScope: "MessageAttributes"
  };
}

function normalizeEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function isConfirmedArn(subscriptionArn: string | undefined): boolean {
  return subscriptionArn?.startsWith("arn:") ?? false;
}
