import request from "supertest";
import { describe, expect, it } from "vitest";
import { newApp } from "./helpers.js";

describe("auth middleware", () => {
  it("rejects requests without an Authorization header", async () => {
    const app = newApp();
    await request(app).get("/api/tasks").expect(401);
  });

  it("rejects bearer tokens that aren't recognised", async () => {
    const app = newApp();
    await request(app).get("/api/tasks").set("Authorization", "Bearer not-a-real-token").expect(401);
  });

  it("rejects login for an unknown demo user", async () => {
    const app = newApp();
    await request(app).post("/api/auth/demo-login").send({ userId: "user-ghost" }).expect(404);
  });

  it("rejects login when userId is missing", async () => {
    const app = newApp();
    await request(app).post("/api/auth/demo-login").send({}).expect(400);
  });
});
