import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

describe("Comments", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("lets a team member add a comment visible in the task detail", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).post("/api/tasks/task-a/comments").send({ body: "On it" }).expect(201);
    const detail = await auth(app, sara).get("/api/tasks/task-a").expect(200);
    expect(detail.body.task.comments.some((entry: { body: string }) => entry.body === "On it")).toBe(true);
  });

  it("hides comments on cross-team tasks", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).post("/api/tasks/task-b/comments").send({ body: "Should fail" }).expect(404);
  });

  it("rejects empty comment bodies", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).post("/api/tasks/task-a/comments").send({ body: "   " }).expect(400);
  });
});
