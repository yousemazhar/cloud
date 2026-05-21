import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

describe("Self + admin user updates", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("lets a user update their own display name via PATCH /api/me", async () => {
    const sara = await login(app, "user-sara");
    const res = await auth(app, sara).patch("/api/me").send({ name: "Sara M." }).expect(200);
    expect(res.body.user.name).toBe("Sara M.");
  });

  it("lets an admin update another user's name and role", async () => {
    const jess = await login(app, "user-jess");
    const res = await auth(app, jess)
      .patch("/api/users/user-sara")
      .send({ name: "Sara Updated", role: "manager" })
      .expect(200);
    expect(res.body.user.name).toBe("Sara Updated");
    expect(res.body.user.role).toBe("manager");
  });

  it("rejects a non-admin from PATCH /api/users/:id", async () => {
    const ali = await login(app, "user-ali");
    await auth(app, ali).patch("/api/users/user-sara").send({ name: "x" }).expect(403);
  });

  it("admin can reset a user's password (local mode allows arbitrary policy)", async () => {
    const jess = await login(app, "user-jess");
    await auth(app, jess)
      .post("/api/users/user-sara/password")
      .send({ newPassword: "Strong#Pass1" })
      .expect(204);
  });

  it("rejects an admin password reset that fails the policy", async () => {
    const jess = await login(app, "user-jess");
    await auth(app, jess)
      .post("/api/users/user-sara/password")
      .send({ newPassword: "weak" })
      .expect(400);
  });
});
