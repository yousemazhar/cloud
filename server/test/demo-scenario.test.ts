import { beforeAll, describe, expect, it } from "vitest";
import { type App, auth, login, newApp } from "./helpers.js";

/**
 * End-to-end scenario from the spec ("Demo Scenario — must work on demo day"):
 *  - Manager Ali creates Task A → Sara (Frontend) and Task B → Omar (Backend).
 *  - Sara sees only Task A; Omar sees only Task B.
 *  - Ali sees both and can filter by team.
 *
 * Runs against LocalAuth so the same getVisibleTask / canSeeTask policy code
 * that ships to production is exercised end-to-end via HTTP.
 */
describe("demo scenario (Ali / Sara / Omar)", () => {
  let app: App;
  let taskAId: string;
  let taskBId: string;

  beforeAll(() => {
    app = newApp();
  });

  it("Ali creates Task A → Sara on Frontend", async () => {
    const ali = await login(app, "user-ali");

    const response = await auth(app, ali).post("/api/tasks").send({
      title: "Demo Task A — Sara",
      description: "Frontend work assigned to Sara.",
      priority: "high",
      deadline: "2026-06-01T00:00:00.000Z",
      assigneeId: "user-sara",
      teamId: "team-frontend",
      projectId: "project-portal"
    }).expect(201);

    expect(response.body.task).toMatchObject({
      assigneeId: "user-sara",
      teamId: "team-frontend",
      status: "todo"
    });
    taskAId = response.body.task.id;
  });

  it("Ali creates Task B → Omar on Backend", async () => {
    const ali = await login(app, "user-ali");

    const response = await auth(app, ali).post("/api/tasks").send({
      title: "Demo Task B — Omar",
      description: "Backend work assigned to Omar.",
      priority: "urgent",
      deadline: "2026-06-01T00:00:00.000Z",
      assigneeId: "user-omar",
      teamId: "team-backend",
      projectId: "project-mobile-api"
    }).expect(201);

    expect(response.body.task).toMatchObject({
      assigneeId: "user-omar",
      teamId: "team-backend"
    });
    taskBId = response.body.task.id;
  });

  it("Sara sees Task A in her list but never Task B", async () => {
    const sara = await login(app, "user-sara");

    const list = await auth(app, sara).get("/api/tasks").expect(200);
    const ids = list.body.tasks.map((task: { id: string }) => task.id);

    expect(ids).toContain(taskAId);
    expect(ids).not.toContain(taskBId);
  });

  it("Sara cannot read, patch, or delete Task B by guessing its id", async () => {
    const sara = await login(app, "user-sara");

    await auth(app, sara).get(`/api/tasks/${taskBId}`).expect(404);
    await auth(app, sara).patch(`/api/tasks/${taskBId}`).send({ status: "in_progress" }).expect(404);
    await auth(app, sara).delete(`/api/tasks/${taskBId}`).expect(404);
    await auth(app, sara).get(`/api/tasks/${taskBId}/comments`).expect(404);
  });

  it("Omar sees Task B in his list but never Task A", async () => {
    const omar = await login(app, "user-omar");

    const list = await auth(app, omar).get("/api/tasks").expect(200);
    const ids = list.body.tasks.map((task: { id: string }) => task.id);

    expect(ids).toContain(taskBId);
    expect(ids).not.toContain(taskAId);

    await auth(app, omar).get(`/api/tasks/${taskAId}`).expect(404);
    await auth(app, omar).patch(`/api/tasks/${taskAId}`).send({ status: "in_progress" }).expect(404);
  });

  it("Ali sees both tasks and can filter by team", async () => {
    const ali = await login(app, "user-ali");

    const all = await auth(app, ali).get("/api/tasks").expect(200);
    const ids = all.body.tasks.map((task: { id: string }) => task.id);
    expect(ids).toEqual(expect.arrayContaining([taskAId, taskBId]));

    const frontend = await auth(app, ali).get("/api/tasks?teamId=team-frontend").expect(200);
    const frontendIds = frontend.body.tasks.map((task: { id: string }) => task.id);
    expect(frontendIds).toContain(taskAId);
    expect(frontendIds).not.toContain(taskBId);

    const backend = await auth(app, ali).get("/api/tasks?teamId=team-backend").expect(200);
    const backendIds = backend.body.tasks.map((task: { id: string }) => task.id);
    expect(backendIds).toContain(taskBId);
    expect(backendIds).not.toContain(taskAId);
  });

  it("Sara walks Task A through the full status flow with audit log entries", async () => {
    const sara = await login(app, "user-sara");

    for (const status of ["in_progress", "in_review", "done"] as const) {
      await auth(app, sara).patch(`/api/tasks/${taskAId}`).send({ status }).expect(200);
    }

    const detail = await auth(app, sara).get(`/api/tasks/${taskAId}`).expect(200);
    const audit = detail.body.task.auditLogs;
    expect(audit).toHaveLength(3);
    const transitions = audit
      .map((entry: { fromStatus: string; toStatus: string }) => [entry.fromStatus, entry.toStatus])
      .sort();
    expect(transitions).toEqual([
      ["in_progress", "in_review"],
      ["in_review", "done"],
      ["todo", "in_progress"]
    ]);
    expect(audit.every((entry: { actorId: string }) => entry.actorId === "user-sara")).toBe(true);
  });

  it("Sara cannot change Task B's status (still 404)", async () => {
    const sara = await login(app, "user-sara");

    await auth(app, sara).patch(`/api/tasks/${taskBId}`).send({ status: "in_progress" }).expect(404);
  });
});
