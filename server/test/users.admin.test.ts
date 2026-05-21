import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

describe("Admin user management", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("lets an admin create a new user on an existing team", async () => {
    const jess = await login(app, "user-jess");
    const res = await auth(app, jess)
      .post("/api/users")
      .send({
        name: "Karim",
        email: "karim@company.test",
        role: "employee",
        teamId: "team-frontend"
      })
      .expect(201);
    expect(res.body.user.name).toBe("Karim");
    expect(res.body.user.teamId).toBe("team-frontend");
    expect(res.body.user.role).toBe("employee");
  });

  it("rejects user creation with an invalid teamId", async () => {
    const jess = await login(app, "user-jess");
    await auth(app, jess)
      .post("/api/users")
      .send({ name: "Ghost", email: "ghost@company.test", role: "employee", teamId: "team-nope" })
      .expect(400);
  });

  it("rejects a non-admin from creating users", async () => {
    const ali = await login(app, "user-ali"); // manager, not admin
    await auth(app, ali)
      .post("/api/users")
      .send({ name: "X", email: "x@company.test", role: "employee" })
      .expect(403);
  });

  it("lets an admin move a user between teams", async () => {
    const jess = await login(app, "user-jess");
    const res = await auth(app, jess)
      .patch("/api/users/user-sara/team")
      .send({ teamId: "team-backend" })
      .expect(200);
    expect(res.body.user.teamId).toBe("team-backend");
  });

  it("lets an admin clear a user's team with null", async () => {
    const jess = await login(app, "user-jess");
    const res = await auth(app, jess)
      .patch("/api/users/user-sara/team")
      .send({ teamId: null })
      .expect(200);
    expect(res.body.user.teamId).toBeUndefined();
  });

  it("returns 404 when moving an unknown user", async () => {
    const jess = await login(app, "user-jess");
    await auth(app, jess)
      .patch("/api/users/user-nope/team")
      .send({ teamId: "team-backend" })
      .expect(404);
  });

  it("rejects a manager from moving users", async () => {
    const ali = await login(app, "user-ali");
    await auth(app, ali)
      .patch("/api/users/user-sara/team")
      .send({ teamId: "team-backend" })
      .expect(403);
  });
});
