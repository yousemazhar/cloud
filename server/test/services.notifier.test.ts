import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Task, User } from "@mini-jira/shared";
import {
  ListSubscriptionsByTopicCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SubscribeCommand
} from "@aws-sdk/client-sns";
import { createApp } from "../src/app.js";
import { buildServices } from "./helpers.js";
import { SnsNotifier, type AssignmentNotifier } from "../src/services/notifications.js";

class CapturingNotifier implements AssignmentNotifier {
  calls: Array<{ taskId: string; assigneeId: string }> = [];
  subscribed: string[] = [];
  async publishAssignment(task: Task, assignee: User): Promise<void> {
    this.calls.push({ taskId: task.id, assigneeId: assignee.id });
  }
  async subscribeUser(email: string): Promise<void> {
    this.subscribed.push(email);
  }
}

class FakeSnsClient {
  calls: unknown[] = [];

  constructor(
    private readonly subscriptions: unknown[] = [],
    private readonly failList = false
  ) {}

  async send(command: unknown): Promise<unknown> {
    this.calls.push(command);
    if (command instanceof ListSubscriptionsByTopicCommand) {
      if (this.failList) throw new Error("list failed");
      return { Subscriptions: this.subscriptions };
    }
    if (command instanceof SubscribeCommand) {
      return { SubscriptionArn: "PendingConfirmation" };
    }
    if (command instanceof PublishCommand) {
      return { MessageId: "message-1" };
    }
    if (command instanceof SetSubscriptionAttributesCommand) {
      return {};
    }
    throw new Error(`unexpected SNS command ${command?.constructor?.name}`);
  }
}

const task: Task = {
  id: "task-1",
  title: "Investigate notifications",
  description: "SNS fanout",
  status: "todo",
  priority: "high",
  deadline: "2026-06-01T00:00:00.000Z",
  assigneeId: "user-kareem",
  teamId: "team-backend",
  projectId: "project-backend",
  attachments: [],
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z"
};

const kareem: User = {
  id: "user-kareem",
  name: "Kareem Elfeel",
  email: "kareem.elfeel@gmail.com",
  role: "employee",
  teamId: "team-backend"
};

function inputOf<T>(command: unknown): T {
  return (command as { input: T }).input;
}

describe("AssignmentNotifier wiring", () => {
  it("fires once on task create and once on reassignment", async () => {
    const services = buildServices();
    const notifier = new CapturingNotifier();
    services.notifier = notifier;
    const app = createApp(services);

    const login = await request(app).post("/api/auth/demo-login").send({ userId: "user-ali" }).expect(200);
    const token = login.body.token as string;
    const authHeader = { Authorization: `Bearer ${token}` };

    const create = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({
        title: "Notifier wiring",
        description: "Triggers SNS in AWS mode",
        priority: "medium",
        deadline: new Date("2026-06-01T00:00:00.000Z").toISOString(),
        teamId: "team-frontend",
        assigneeId: "user-sara",
        projectId: "project-portal"
      })
      .expect(201);
    const taskId = create.body.task.id as string;
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]).toMatchObject({ taskId, assigneeId: "user-sara" });

    // Same-assignee patch should NOT publish again.
    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(authHeader)
      .send({ status: "in_progress" })
      .expect(200);
    expect(notifier.calls).toHaveLength(1);

    // Reassigning to Omar/Backend publishes a second event.
    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(authHeader)
      .send({ assigneeId: "user-omar", teamId: "team-backend" })
      .expect(200);
    expect(notifier.calls).toHaveLength(2);
    expect(notifier.calls[1]).toMatchObject({ taskId, assigneeId: "user-omar" });
  });

  it("fires exactly once when a manager edits title+assignee in a single PATCH", async () => {
    const services = buildServices();
    const notifier = new CapturingNotifier();
    services.notifier = notifier;
    const app = createApp(services);

    const login = await request(app).post("/api/auth/demo-login").send({ userId: "user-ali" }).expect(200);
    const token = login.body.token as string;
    const authHeader = { Authorization: `Bearer ${token}` };

    const create = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({
        title: "Edit-title-and-assignee",
        description: "Should notify once on reassignment",
        priority: "medium",
        deadline: new Date("2026-06-01T00:00:00.000Z").toISOString(),
        teamId: "team-frontend",
        assigneeId: "user-sara",
        projectId: "project-portal"
      })
      .expect(201);
    const taskId = create.body.task.id as string;
    expect(notifier.calls).toHaveLength(1);

    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(authHeader)
      .send({ title: "Renamed", assigneeId: "user-omar", teamId: "team-backend" })
      .expect(200);
    expect(notifier.calls).toHaveLength(2);
    expect(notifier.calls[1]).toMatchObject({ taskId, assigneeId: "user-omar" });
  });
});

describe("SnsNotifier", () => {
  it("creates a filtered email subscription for the actual assignee before publishing", async () => {
    const client = new FakeSnsClient();
    const notifier = new SnsNotifier({
      client: client as never,
      topics: { tasksAssigned: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned" }
    });

    await notifier.publishAssignment(task, kareem);

    expect(client.calls[0]).toBeInstanceOf(ListSubscriptionsByTopicCommand);
    expect(client.calls[1]).toBeInstanceOf(SubscribeCommand);
    expect(client.calls[2]).toBeInstanceOf(PublishCommand);

    const subscribe = inputOf<{
      Protocol: string;
      Endpoint: string;
      Attributes: Record<string, string>;
    }>(client.calls[1]);
    expect(subscribe).toMatchObject({
      Protocol: "email",
      Endpoint: "kareem.elfeel@gmail.com",
      Attributes: {
        FilterPolicy: JSON.stringify({ assigneeEmail: ["kareem.elfeel@gmail.com"] }),
        FilterPolicyScope: "MessageAttributes"
      }
    });
  });

  it("creates filtered daily-digest subscriptions so users only receive their own digest", async () => {
    const client = new FakeSnsClient();
    const notifier = new SnsNotifier({
      client: client as never,
      topics: {
        tasksAssigned: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned",
        dailyDigest: "arn:aws:sns:us-east-1:123456789012:mini-jira-daily-digest"
      }
    });

    await notifier.subscribeUser("Kareem.Elfeel@gmail.com");

    const subscribeCalls = client.calls.filter((call) => call instanceof SubscribeCommand);
    expect(subscribeCalls).toHaveLength(2);
    const dailyDigestSubscribe = inputOf<{
      TopicArn: string;
      Endpoint: string;
      Attributes: Record<string, string>;
    }>(subscribeCalls[1]);
    expect(dailyDigestSubscribe).toMatchObject({
      TopicArn: "arn:aws:sns:us-east-1:123456789012:mini-jira-daily-digest",
      Endpoint: "kareem.elfeel@gmail.com",
      Attributes: {
        FilterPolicy: JSON.stringify({ assigneeEmail: ["kareem.elfeel@gmail.com"] }),
        FilterPolicyScope: "MessageAttributes"
      }
    });
  });

  it("publishes the same assignment event payload with assigneeEmail attributes for SNS fanout", async () => {
    const client = new FakeSnsClient();
    const notifier = new SnsNotifier({
      client: client as never,
      topics: { tasksAssigned: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned" }
    });

    await notifier.publishAssignment(task, kareem);

    const publish = inputOf<{
      TopicArn: string;
      Message: string;
      MessageStructure?: string;
      MessageAttributes: Record<string, { DataType: string; StringValue: string }>;
    }>(client.calls[2]);
    expect(publish.MessageStructure).toBe("json");
    const envelope = JSON.parse(publish.Message) as { default: string; email: string; sqs: string };
    // Default/email body is human-readable; sqs body is the machine JSON parsed
    // by assignment-worker.ts (we keep the same fields it relies on).
    expect(envelope.default).toContain("Investigate notifications");
    expect(envelope.email).toEqual(envelope.default);
    expect(JSON.parse(envelope.sqs)).toMatchObject({
      taskId: "task-1",
      teamId: "team-backend",
      assigneeId: "user-kareem",
      assigneeEmail: "kareem.elfeel@gmail.com"
    });
    expect(publish.MessageAttributes).toMatchObject({
      teamId: { DataType: "String", StringValue: "team-backend" },
      assigneeId: { DataType: "String", StringValue: "user-kareem" },
      assigneeEmail: { DataType: "String", StringValue: "kareem.elfeel@gmail.com" }
    });
  });

  it("still publishes the assignment event when email subscription setup fails", async () => {
    const client = new FakeSnsClient([], true);
    const notifier = new SnsNotifier({
      client: client as never,
      topics: { tasksAssigned: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned" }
    });

    await notifier.publishAssignment(task, kareem);

    expect(client.calls[0]).toBeInstanceOf(ListSubscriptionsByTopicCommand);
    expect(client.calls[1]).toBeInstanceOf(PublishCommand);
  });

  it("repairs a confirmed email subscription filter and then publishes", async () => {
    const client = new FakeSnsClient([
      {
        SubscriptionArn: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned:sub-1",
        Protocol: "email",
        Endpoint: "kareem.elfeel@gmail.com",
        TopicArn: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned"
      }
    ]);
    const notifier = new SnsNotifier({
      client: client as never,
      topics: { tasksAssigned: "arn:aws:sns:us-east-1:123456789012:mini-jira-tasks-assigned" }
    });

    await notifier.publishAssignment(task, kareem);

    expect(client.calls[0]).toBeInstanceOf(ListSubscriptionsByTopicCommand);
    expect(client.calls[1]).toBeInstanceOf(SetSubscriptionAttributesCommand);
    expect(client.calls[2]).toBeInstanceOf(SetSubscriptionAttributesCommand);
    expect(client.calls[3]).toBeInstanceOf(PublishCommand);

    const filterPolicy = inputOf<{ AttributeName: string; AttributeValue: string }>(client.calls[1]);
    const filterScope = inputOf<{ AttributeName: string; AttributeValue: string }>(client.calls[2]);
    expect(filterPolicy).toMatchObject({
      AttributeName: "FilterPolicy",
      AttributeValue: JSON.stringify({ assigneeEmail: ["kareem.elfeel@gmail.com"] })
    });
    expect(filterScope).toMatchObject({
      AttributeName: "FilterPolicyScope",
      AttributeValue: "MessageAttributes"
    });
  });
});
