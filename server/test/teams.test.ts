import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

describe("Teams", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("lets a manager create a new team", async () => {
    const ali = await login(app, "user-ali");
    const before = await auth(app, ali).get("/api/teams").expect(200);
    const beforeCount = before.body.teams.length;

    const created = await auth(app, ali)
      .post("/api/teams")
      .send({ name: "DevOps" })
      .expect(201);
    expect(created.body.team.name).toBe("DevOps");
    expect(created.body.team.id).toMatch(/^team-/);

    const after = await auth(app, ali).get("/api/teams").expect(200);
    expect(after.body.teams.length).toBe(beforeCount + 1);
    expect(after.body.teams.some((t: { name: string }) => t.name === "DevOps")).toBe(true);
  });

  it("lets an admin create a team", async () => {
    const jess = await login(app, "user-jess");
    await auth(app, jess).post("/api/teams").send({ name: "Security" }).expect(201);
  });

  it("rejects an employee creating a team", async () => {
    const sara = await login(app, "user-sara");
    await auth(app, sara).post("/api/teams").send({ name: "Sneaky" }).expect(403);
  });

  it("rejects an empty team name", async () => {
    const ali = await login(app, "user-ali");
    await auth(app, ali).post("/api/teams").send({ name: "   " }).expect(400);
  });
});
