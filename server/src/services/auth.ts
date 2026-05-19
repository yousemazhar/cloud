import type { User } from "@mini-jira/shared";
import type { Request, Router } from "express";

/**
 * AuthVerifier is the single seam for resolving an HTTP request to a User.
 * - LocalAuth (local mode) issues opaque bearer tokens through a demo-login route.
 * - CognitoAuth (AWS mode) verifies Cognito ID/Access JWTs and reads role/teamId
 *   from the `custom:role` / `custom:teamId` claims.
 *
 * `mountRoutes` is optional — only the local impl needs it (for /api/auth/demo-login).
 * The CLAUDE.md rule is that demo-login MUST 404 in AWS mode, which is enforced by
 * CognitoAuth simply not mounting anything.
 */
export interface AuthVerifier {
  authenticate(req: Request): Promise<User>;
  mountRoutes?(router: Router): void;
}
