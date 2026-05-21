import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { newApp, type App } from "./helpers.js";

describe("POST /api/auth/signup", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("creates an employee with no team for a strong password", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ name: "New Hire", email: "new.hire@minijira.test", password: "Strong#Pass1" })
      .expect(201);
    expect(res.body.user).toMatchObject({
      name: "New Hire",
      email: "new.hire@minijira.test",
      role: "employee"
    });
    expect(res.body.user.teamId).toBeUndefined();
    // No token is returned — the user must sign in afterwards.
    expect(res.body.token).toBeUndefined();
  });

  it("rejects a weak password with field-level errors", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ name: "New Hire", email: "new@minijira.test", password: "weak" })
      .expect(400);
    expect(res.body.errors?.[0]?.field).toBe("password");
  });

  it("rejects a missing email", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ name: "New", password: "Strong#Pass1" })
      .expect(400);
  });
});
