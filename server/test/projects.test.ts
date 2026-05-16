import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

describe("Project CRUD", () => {
  let app: App;
  let aliToken: string;

  beforeEach(async () => {
    app = newApp();
    aliToken = await login(app, "user-ali");
  });

  it("lets a manager create, update, and delete a project", async () => {
    const created = await auth(app, aliToken).post("/api/projects").send({ name: "Onboarding", description: "Sign-up funnel" }).expect(201);
    const id = created.body.project.id as string;

    const updated = await auth(app, aliToken).patch(`/api/projects/${id}`).send({ name: "Onboarding v2" }).expect(200);
    expect(updated.body.project.name).toBe("Onboarding v2");

    await auth(app, aliToken).delete(`/api/projects/${id}`).expect(204);
  });

  it("blocks deleting a project that still has tasks", async () => {
    await auth(app, aliToken).delete("/api/projects/project-portal").expect(409);
  });

  it("rejects project create/update/delete from non-managers", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).post("/api/projects").send({ name: "Sneaky", description: "Should fail" }).expect(403);
    await auth(app, sara).patch("/api/projects/project-portal").send({ name: "Hacked" }).expect(403);
    await auth(app, sara).delete("/api/projects/project-portal").expect(403);
  });
});
