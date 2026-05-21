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
 *   Manager assigns task -> publish to tasks-assigned topic -> (a) email to assignee, (b) SQS to worker Lambda.
 *
 * subscribeUser is called when a user signs up / is created so they receive task
 * assignments, daily digests, and operational alerts. The email subscription
 * requires a one-time confirmation click — AWS sends an automatic Subscription
 * Confirmation email per topic.
 */
export interface AssignmentNotifier {
  publishAssignment(task: Task, assignee: User): Promise<void>;
  subscribeUser(email: string): Promise<void>;
}

export class NoopNotifier implements AssignmentNotifier {
  constructor(private readonly logger?: Logger) {}

  async publishAssignment(task: Task, assignee: User): Promise<void> {
    this.logger?.info(
      { taskId: task.id, assigneeId: assignee.id, assigneeEmail: assignee.email, teamId: task.teamId },
      "notifier:noop assignment"
    );
  }

  async subscribeUser(email: string): Promise<void> {
    this.logger?.info({ email }, "notifier:noop subscribeUser");
  }
}

export interface SnsTopicArns {
  /** Per-assignee filtered topic — published to on task assignment. */
  tasksAssigned: string;
  /** Optional: daily-digest topic. New users get subscribed if provided. */
  dailyDigest?: string;
  /** Optional: alerts topic. New users get subscribed if provided. */
  alerts?: string;
}

export interface SnsNotifierConfig {
  client: SNSClient;
  topics: SnsTopicArns;
}

export class SnsNotifier implements AssignmentNotifier {
  private readonly client: SNSClient;
  private readonly topics: SnsTopicArns;

  constructor(config: SnsNotifierConfig, private readonly logger?: Logger) {
    this.client = config.client;
    this.topics = config.topics;
  }

  async publishAssignment(task: Task, assignee: User): Promise<void> {
    const assigneeEmail = normalizeEmail(assignee.email);
    try {
      await this.ensureSubscription(this.topics.tasksAssigned, "email", assigneeEmail, emailFilterAttributes(assigneeEmail));
    } catch (error) {
      this.logger?.error(
        { err: error, taskId: task.id, assigneeEmail },
        "sns email subscription setup failed"
      );
    }

    const subject = `New task assigned: ${task.title}`.slice(0, 100);
    const readable = formatAssignmentEmail(task, assignee);
    const machine = JSON.stringify({
      taskId: task.id,
      teamId: task.teamId,
      assigneeId: assignee.id,
      assigneeEmail,
      deadline: task.deadline,
      priority: task.priority,
      title: task.title
    });
    // MessageStructure=json lets us send different bodies per protocol:
    //  - `default` and `email` get the human-readable text the assignee opens.
    //  - `sqs` gets the JSON the assignment-worker Lambda parses.
    const message = JSON.stringify({ default: readable, email: readable, sqs: machine });

    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topics.tasksAssigned,
          Subject: subject,
          MessageStructure: "json",
          Message: message,
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

  async subscribeUser(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const targets: { arn: string; attributes?: Record<string, string> }[] = [
      // tasks-assigned uses a filter policy so users only receive their own
      // assignments (set by ensureSubscription on first publish if it's missing).
      { arn: this.topics.tasksAssigned, attributes: emailFilterAttributes(normalized) }
    ];
    if (this.topics.dailyDigest) targets.push({ arn: this.topics.dailyDigest });
    if (this.topics.alerts) targets.push({ arn: this.topics.alerts });
    for (const target of targets) {
      try {
        await this.ensureSubscription(target.arn, "email", normalized, target.attributes);
      } catch (error) {
        this.logger?.error({ err: error, email: normalized, topicArn: target.arn }, "sns subscribeUser failed");
      }
    }
  }

  private async ensureSubscription(
    topicArn: string,
    protocol: "email",
    endpoint: string,
    attributes?: Record<string, string>
  ): Promise<void> {
    const subscriptions = await this.listSubscriptions(topicArn);
    const matching = subscriptions.filter(
      (subscription) =>
        subscription.Protocol === protocol && normalizeEmail(subscription.Endpoint) === endpoint
    );
    const confirmed = matching.find((subscription) => isConfirmedArn(subscription.SubscriptionArn));
    if (confirmed?.SubscriptionArn) {
      if (attributes) await this.applyAttributes(confirmed.SubscriptionArn, attributes);
      return;
    }

    const pending = matching.find((subscription) => subscription.SubscriptionArn === "PendingConfirmation");
    if (pending) {
      this.logger?.warn(
        { endpoint, topicArn },
        "sns email subscription pending confirmation"
      );
      return;
    }

    await this.client.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: protocol,
        Endpoint: endpoint,
        ReturnSubscriptionArn: true,
        Attributes: attributes
      })
    );
    this.logger?.info(
      { endpoint, topicArn },
      "created sns email subscription; user must confirm before delivery"
    );
  }

  private async listSubscriptions(topicArn: string): Promise<Subscription[]> {
    const subscriptions: Subscription[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListSubscriptionsByTopicCommand({
          TopicArn: topicArn,
          NextToken: nextToken
        })
      );
      subscriptions.push(...(page.Subscriptions ?? []));
      nextToken = page.NextToken;
    } while (nextToken);
    return subscriptions;
  }

  private async applyAttributes(subscriptionArn: string, attributes: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(attributes)) {
      await this.client.send(
        new SetSubscriptionAttributesCommand({
          SubscriptionArn: subscriptionArn,
          AttributeName: name,
          AttributeValue: value
        })
      );
    }
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
  if (!subscriptionArn) return false;
  if (subscriptionArn === "PendingConfirmation") return false;
  return subscriptionArn.startsWith("arn:");
}

export function formatAssignmentEmail(task: Task, assignee: User): string {
  const deadline = task.deadline ? new Date(task.deadline).toLocaleString() : "(no deadline set)";
  const lines = [
    `Hi ${assignee.name || assignee.email},`,
    "",
    `You have been assigned a new task in Mini-Jira:`,
    "",
    `Title:    ${task.title}`,
    `Priority: ${task.priority}`,
    `Deadline: ${deadline}`,
    `Task ID:  ${task.id}`,
    "",
    `Open Mini-Jira to view the full details and start working on it.`,
    "",
    `— The Mini-Jira team`
  ];
  return lines.join("\n");
}
