import type { User } from "@mini-jira/shared";
import type { Request, Router } from "express";
import { parseBody, demoLoginSchema } from "../../validation/schemas.js";
import type { AuthVerifier } from "../auth.js";
import type { UserRepo } from "../repos.js";

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function newToken(): string {
  return `session-${crypto.randomUUID()}`;
}

/**
 * LocalAuth issues opaque bearer tokens via /api/auth/demo-login. The sessions map
 * lives on the instance so each createApp() call (including each test) gets a fresh
 * one — important because tests share the seeded user ids.
 */
export class LocalAuth implements AuthVerifier {
  private readonly sessions = new Map<string, string>();

  constructor(private readonly users: UserRepo) {}

  async authenticate(req: Request): Promise<User> {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const userId = token ? this.sessions.get(token) : undefined;
    const user = userId ? await this.users.get(userId) : undefined;
    if (!user) throw httpError(401, "Unauthorized");
    return user;
  }

  mountRoutes(router: Router): void {
    router.post("/api/auth/demo-login", async (req, res, next) => {
      try {
        const body = parseBody(demoLoginSchema, req.body);
        const user = await this.users.get(body.userId);
        if (!user) throw httpError(404, "Demo user not found");
        const token = newToken();
        this.sessions.set(token, user.id);
        res.json({ token, user });
      } catch (error) {
        next(error);
      }
    });
  }
}
