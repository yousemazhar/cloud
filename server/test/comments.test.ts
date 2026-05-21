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

  it("lets the author edit their own comment", async () => {
    const sara = await login(app, "user-sara");
    const created = await auth(app, sara)
      .post("/api/tasks/task-a/comments")
      .send({ body: "first draft" })
      .expect(201);
    const commentId = created.body.comment.id as string;
    const updated = await auth(app, sara)
      .put(`/api/comments/${commentId}`)
      .send({ body: "second pass" })
      .expect(200);
    expect(updated.body.comment.body).toBe("second pass");
    expect(updated.body.comment.updatedAt).toBeDefined();
  });

  it("lets a manager edit any visible comment", async () => {
    const sara = await login(app, "user-sara");
    const created = await auth(app, sara).post("/api/tasks/task-a/comments").send({ body: "v1" });
    const ali = await login(app, "user-ali");
    const updated = await auth(app, ali)
      .put(`/api/comments/${created.body.comment.id}`)
      .send({ body: "managed edit" })
      .expect(200);
    expect(updated.body.comment.body).toBe("managed edit");
  });

  it("blocks non-author non-manager from editing", async () => {
    // Sara owns the comment on task-a (Frontend team). Mona is on team-qa,
    // so she can't even see task-a — 404 is the right outcome.
    const sara = await login(app, "user-sara");
    const created = await auth(app, sara).post("/api/tasks/task-a/comments").send({ body: "private" });
    const mona = await login(app, "user-mona");
    await auth(app, mona).put(`/api/comments/${created.body.comment.id}`).send({ body: "hax" }).expect(404);
  });

  it("lets the author delete their own comment", async () => {
    const sara = await login(app, "user-sara");
    const created = await auth(app, sara).post("/api/tasks/task-a/comments").send({ body: "scratch" });
    const commentId = created.body.comment.id as string;
    await auth(app, sara).delete(`/api/comments/${commentId}`).expect(204);
    const detail = await auth(app, sara).get("/api/tasks/task-a").expect(200);
    expect(detail.body.task.comments.find((c: { id: string }) => c.id === commentId)).toBeUndefined();
  });

  it("returns 404 on delete of a non-existent comment", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).delete("/api/comments/comment-does-not-exist").expect(404);
  });
});
