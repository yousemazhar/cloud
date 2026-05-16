import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

const validTask = {
  title: "Wire dashboard",
  description: "Sketch the dashboard layout",
  priority: "medium",
  deadline: new Date("2026-06-10T12:00:00.000Z").toISOString(),
  teamId: "team-frontend",
  assigneeId: "user-sara",
  projectId: "project-portal"
};

describe("Task CRUD validation", () => {
  let app: App;
  let aliToken: string;

  beforeEach(async () => {
    app = newApp();
    aliToken = await login(app, "user-ali");
  });

  it("rejects creation when assignee is not on the selected team", async () => {
    await auth(app, aliToken)
      .post("/api/tasks")
      .send({ ...validTask, assigneeId: "user-omar" })
      .expect(400);
  });

  it("rejects creation when priority is outside the enum", async () => {
    await auth(app, aliToken)
      .post("/api/tasks")
      .send({ ...validTask, priority: "extreme" })
      .expect(400);
  });

  it("rejects creation when the deadline is not parseable as a date", async () => {
    await auth(app, aliToken)
      .post("/api/tasks")
      .send({ ...validTask, deadline: "tomorrow" })
      .expect(400);
  });

  it("rejects creation when projectId is unknown", async () => {
    await auth(app, aliToken)
      .post("/api/tasks")
      .send({ ...validTask, projectId: "project-ghost" })
      .expect(400);
  });

  it("records exactly one audit log when transitioning to done and sets closedAt", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).patch("/api/tasks/task-a").send({ status: "done" }).expect(200);
    const detail = await auth(app, sara).get("/api/tasks/task-a").expect(200);
    expect(detail.body.task.auditLogs).toHaveLength(1);
    expect(detail.body.task.closedAt).toBeTruthy();
  });

  it("cascades comments and audit logs on delete", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).patch("/api/tasks/task-a").send({ status: "in_progress" }).expect(200);
    await auth(app, sara).post("/api/tasks/task-a/comments").send({ body: "checking in" }).expect(201);
    await auth(app, aliToken).delete("/api/tasks/task-a").expect(204);
    await auth(app, aliToken).get("/api/tasks/task-a").expect(404);
  });

  it("blocks employees from deleting tasks", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).delete("/api/tasks/task-a").expect(403);
  });

  it("blocks employees from reassigning tasks", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).patch("/api/tasks/task-a").send({ assigneeId: "user-omar", teamId: "team-backend" }).expect(403);
  });

  it("creates a task successfully with a fresh manager session", async () => {
    const response = await auth(app, aliToken).post("/api/tasks").send(validTask).expect(201);
    expect(response.body.task.status).toBe("todo");
    expect(response.body.task.deadline).toBe(validTask.deadline);
  });
});
