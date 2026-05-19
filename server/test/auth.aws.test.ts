import request from "supertest";
import { describe, expect, it } from "vitest";
import type { User } from "@mini-jira/shared";
import type { Request } from "express";
import { pino } from "pino";
import { createApp } from "../src/app.js";
import { buildLocalServices } from "../src/buildServices.js";
import type { AuthVerifier } from "../src/services/auth.js";

const silentLogger = pino({ level: "silent" });

class StubAwsAuth implements AuthVerifier {
  async authenticate(_req: Request): Promise<User> {
    return { id: "user-ali", name: "Ali", email: "ali@test", role: "manager" };
  }
  // Intentionally no mountRoutes — mirrors CognitoAuth: demo-login must 404 in AWS mode.
}

describe("AWS-mode auth surface", () => {
  it("returns 404 for POST /api/auth/demo-login when AuthVerifier does not mount it", async () => {
    const services = buildLocalServices({ logger: silentLogger });
    services.auth = new StubAwsAuth();
    const app = createApp(services);

    await request(app).post("/api/auth/demo-login").send({ userId: "user-ali" }).expect(404);
  });

  it("still authenticates protected routes via the verifier", async () => {
    const services = buildLocalServices({ logger: silentLogger });
    services.auth = new StubAwsAuth();
    const app = createApp(services);

    const response = await request(app).get("/api/me").set("Authorization", "Bearer fake").expect(200);
    expect(response.body.user.id).toBe("user-ali");
  });
});
