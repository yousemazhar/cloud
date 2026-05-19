import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Task, User } from "@mini-jira/shared";
import { createApp } from "../src/app.js";
import { buildServices } from "./helpers.js";
import type { AssignmentNotifier } from "../src/services/notifications.js";

class CapturingNotifier implements AssignmentNotifier {
  calls: Array<{ taskId: string; assigneeId: string }> = [];
  async publishAssignment(task: Task, assignee: User): Promise<void> {
    this.calls.push({ taskId: task.id, assigneeId: assignee.id });
  }
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
});
