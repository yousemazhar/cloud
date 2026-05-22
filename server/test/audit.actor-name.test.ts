import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

describe("Audit log persists actorName", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("snapshots the actor name on a status-change audit entry", async () => {
    const ali = await login(app, "user-ali");
    const create = await auth(app, ali)
      .post("/api/tasks")
      .send({
        title: "Audit me",
        description: "actor name",
        priority: "low",
        deadline: "2026-06-01T00:00:00.000Z",
        teamId: "team-frontend",
        assigneeId: "user-sara",
        projectId: "project-portal"
      })
      .expect(201);
    const taskId = create.body.task.id as string;

    await auth(app, ali).patch(`/api/tasks/${taskId}`).send({ status: "in_progress" }).expect(200);

    const detail = await auth(app, ali).get(`/api/tasks/${taskId}`).expect(200);
    const entries = detail.body.task.auditLogs as Array<{
      actorId: string;
      actorName?: string;
      type?: string;
      fromStatus?: string;
      toStatus?: string;
    }>;
    expect(entries.some((e) => e.type === "created" && e.actorId === "user-ali")).toBe(true);
    const statusChange = entries.find((e) => e.type === "status_changed");
    expect(statusChange?.actorId).toBe("user-ali");
    expect(statusChange?.actorName).toBeTruthy();
    expect(statusChange?.fromStatus).toBe("todo");
    expect(statusChange?.toStatus).toBe("in_progress");
  });
});
