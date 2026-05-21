import { describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";
import request from "supertest";

describe("Validation errors", () => {
  let app: App;

  function setupApp() {
    app = newApp();
    return app;
  }

  it("returns a body shaped { message, errors: [{field, message}] } on 400", async () => {
    setupApp();
    const token = await login(app, "user-ali");
    const res = await auth(app, token)
      .post("/api/tasks")
      .send({ title: "", description: "", priority: "potato", deadline: "not-a-date" })
      .expect(400);
    expect(res.body.message).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(1);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toContain("title");
    expect(fields).toContain("priority");
  });

  it("surfaces team-creation validation errors", async () => {
    setupApp();
    const token = await login(app, "user-ali");
    const res = await auth(app, token).post("/api/teams").send({ name: "" }).expect(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].field).toBe("name");
  });

  it("surfaces user-creation validation errors with multiple fields", async () => {
    setupApp();
    const token = await login(app, "user-jess");
    const res = await auth(app, token)
      .post("/api/users")
      .send({ name: "", email: "not-an-email", role: "wizard" })
      .expect(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("email");
    expect(fields).toContain("role");
  });
});

describe("Config endpoint", () => {
  it("returns the upload mode and backend so the client can pick the right path", async () => {
    const app = newApp();
    const res = await request(app).get("/api/config").expect(200);
    expect(res.body.uploadMode).toBe("multipart");
    expect(res.body.backend).toBe("local");
  });
});
