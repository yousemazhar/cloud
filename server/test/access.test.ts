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

  it("hides admin users from a manager's user directory but keeps admins visible to admins", async () => {
    const ali = await login(app, "user-ali"); // manager
    const jess = await login(app, "user-jess"); // admin

    const asManager = await request(app).get("/api/users").set("Authorization", `Bearer ${ali}`).expect(200);
    const asAdmin = await request(app).get("/api/users").set("Authorization", `Bearer ${jess}`).expect(200);

    const managerIds = asManager.body.users.map((u: { id: string }) => u.id);
    expect(managerIds).toContain("user-ali");
    expect(managerIds).toContain("user-sara");
    expect(managerIds).not.toContain("user-jess");

    const adminIds = asAdmin.body.users.map((u: { id: string }) => u.id);
    expect(adminIds).toContain("user-jess");
  });

  it("limits employees' user directory to teammates", async () => {
    const sara = await login(app, "user-sara"); // frontend employee

    const response = await request(app).get("/api/users").set("Authorization", `Bearer ${sara}`).expect(200);
    const ids = response.body.users.map((u: { id: string }) => u.id);
    expect(ids).toContain("user-sara");
    expect(ids).not.toContain("user-omar");
    expect(ids).not.toContain("user-jess");
  });
});
