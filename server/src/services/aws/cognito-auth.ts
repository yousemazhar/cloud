import type { Role, User } from "@mini-jira/shared";
import type { Request, Router } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import type { AuthVerifier } from "../auth.js";

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

interface CognitoVerifierConfig {
  userPoolId: string;
  clientId: string;
  region?: string;
}

/**
 * CognitoAuth verifies Cognito ID/Access tokens with aws-jwt-verify and maps the
 * `custom:role` and `custom:teamId` claims onto the shared User shape.
 *
 * Mounts ONLY `POST /api/auth/login` (email + password -> Cognito AdminInitiateAuth
 * -> returns ID token). The demo-login route is NOT mounted in AWS mode per the
 * project rule that demo-login must 404 outside local mode.
 */
export class CognitoAuth implements AuthVerifier {
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;
  private readonly cog: CognitoIdentityProviderClient;
  private readonly userPoolId: string;
  private readonly clientId: string;

  constructor(config: CognitoVerifierConfig) {
    this.userPoolId = config.userPoolId;
    this.clientId = config.clientId;
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: "id",
      clientId: config.clientId
    });
    this.cog = new CognitoIdentityProviderClient({ region: config.region });
  }

  mountRoutes(router: Router): void {
    router.post("/api/auth/login", async (req, res, next) => {
      try {
        const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
        if (!email || !password) throw httpError(400, "email and password are required");
        const result = await this.cog.send(new AdminInitiateAuthCommand({
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          UserPoolId: this.userPoolId,
          ClientId: this.clientId,
          AuthParameters: { USERNAME: email, PASSWORD: password }
        }));
        const idToken = result.AuthenticationResult?.IdToken;
        if (!idToken) throw httpError(401, "Login failed");
        // Echo back the user info so the client can populate its state without a second call.
        const user = await this.authenticateToken(idToken);
        res.json({ token: idToken, user });
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        if (status) {
          next(err);
          return;
        }
        const name = (err as Error & { name?: string }).name;
        // Cognito returns NotAuthorizedException for both wrong password and
        // disabled accounts, and UserNotFoundException for unknown emails. Surface
        // a single uniform message so we don't leak which one it was.
        if (name === "NotAuthorizedException" || name === "UserNotFoundException") {
          next(httpError(401, "Wrong username or password."));
          return;
        }
        next(httpError(401, "Wrong username or password."));
      }
    });
  }

  private async authenticateToken(token: string): Promise<User> {
    const payload = (await this.verifier.verify(token)) as Record<string, unknown>;
    return claimsToUser(payload);
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
    return claimsToUser(payload);
  }
}

function claimsToUser(payload: Record<string, unknown>): User {
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

function parseRole(value: unknown): Role | undefined {
  if (value === "manager" || value === "employee" || value === "admin") return value;
  return undefined;
}
