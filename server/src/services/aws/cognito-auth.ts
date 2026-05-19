import type { Role, User } from "@mini-jira/shared";
import type { Request } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { AuthVerifier } from "../auth.js";

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

interface CognitoVerifierConfig {
  userPoolId: string;
  clientId: string;
}

/**
 * CognitoAuth verifies Cognito ID/Access tokens with aws-jwt-verify and maps the
 * `custom:role` and `custom:teamId` claims onto the shared User shape. There is
 * intentionally no `mountRoutes` — the CLAUDE.md rule says demo-login must 404 in
 * AWS mode, which is achieved by not registering it.
 */
export class CognitoAuth implements AuthVerifier {
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor(config: CognitoVerifierConfig) {
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: "id",
      clientId: config.clientId
    });
  }

  async authenticate(req: Request): Promise<User> {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw httpError(401, "Unauthorized");
    let payload: Record<string, unknown>;
    try {
      payload = (await this.verifier.verify(token)) as Record<string, unknown>;
    } catch {
      throw httpError(401, "Invalid token");
    }
    const id = typeof payload.sub === "string" ? payload.sub : undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    const name =
      typeof payload.name === "string"
        ? payload.name
        : typeof payload["cognito:username"] === "string"
          ? (payload["cognito:username"] as string)
          : email;
    const role = parseRole(payload["custom:role"]);
    const teamId =
      typeof payload["custom:teamId"] === "string" && payload["custom:teamId"]
        ? (payload["custom:teamId"] as string)
        : undefined;
    if (!id || !email || !name || !role) throw httpError(401, "Token is missing required claims");
    return { id, email, name, role, teamId };
  }
}

function parseRole(value: unknown): Role | undefined {
  if (value === "manager" || value === "employee" || value === "admin") return value;
  return undefined;
}
