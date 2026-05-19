import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { type App, login, newApp } from "./helpers.js";

describe("team-scoped API access", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("rejects Sara when she guesses Omar's backend task ID", async () => {
    const sara = await login(app, "user-sara");

    await request(app).get("/api/tasks/task-b").set("Authorization", `Bearer ${sara}`).expect(404);
  });

  it("keeps Omar's task list scoped to Backend tasks", async () => {
    const omar = await login(app, "user-omar");

    const response = await request(app).get("/api/tasks").set("Authorization", `Bearer ${omar}`).expect(200);

    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0].id).toBe("task-b");
  });

  it("lets Ali see both demo tasks and filter by team", async () => {
    const ali = await login(app, "user-ali");

    const allTasks = await request(app).get("/api/tasks").set("Authorization", `Bearer ${ali}`).expect(200);
    const frontendTasks = await request(app).get("/api/tasks?teamId=team-frontend").set("Authorization", `Bearer ${ali}`).expect(200);

    expect(allTasks.body.tasks.map((task: { id: string }) => task.id)).toEqual(expect.arrayContaining(["task-a", "task-b"]));
    expect(frontendTasks.body.tasks.map((task: { id: string }) => task.id)).toEqual(["task-a"]);
  });

  it("records audit logs when a status changes", async () => {
    const sara = await login(app, "user-sara");

    await request(app).patch("/api/tasks/task-a").set("Authorization", `Bearer ${sara}`).send({ status: "in_progress" }).expect(200);
    const detail = await request(app).get("/api/tasks/task-a").set("Authorization", `Bearer ${sara}`).expect(200);

    expect(detail.body.task.auditLogs).toHaveLength(1);
    expect(detail.body.task.auditLogs[0]).toMatchObject({
      actorId: "user-sara",
      fromStatus: "todo",
      toStatus: "in_progress"
    });
  });

  it("enforces task visibility before returning comments", async () => {
    const sara = await login(app, "user-sara");

    await request(app).get("/api/tasks/task-b/comments").set("Authorization", `Bearer ${sara}`).expect(404);
  });
});
