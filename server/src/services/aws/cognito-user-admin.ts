import type { User } from "@mini-jira/shared";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import type { UserRepo } from "../repos.js";
import type { CreateUserParams, UserAdmin } from "../user-admin.js";

interface Deps {
  cognito: CognitoIdentityProviderClient;
  userPoolId: string;
  users: UserRepo;
}

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

/**
 * AWS UserAdmin: creates a Cognito user (so they can sign in via /api/auth/login),
 * sets a permanent password, applies custom:role + custom:teamId attributes, then
 * mirrors a row into the Dynamo Users table keyed by the Cognito sub. JWT auth
 * later reads the same sub from the ID token, so the lookups line up.
 */
export class CognitoUserAdmin implements UserAdmin {
  constructor(private readonly deps: Deps) {}

  async createUser(params: CreateUserParams): Promise<User> {
    if (!params.password) throw httpError(400, "password is required when creating Cognito users");

    const attrs = [
      { Name: "email", Value: params.email },
      { Name: "email_verified", Value: "true" },
      { Name: "name", Value: params.name },
      { Name: "custom:role", Value: params.role }
    ];
    if (params.teamId) attrs.push({ Name: "custom:teamId", Value: params.teamId });

    let sub: string;
    try {
      const created = await this.deps.cognito.send(new AdminCreateUserCommand({
        UserPoolId: this.deps.userPoolId,
        Username: params.email,
        UserAttributes: attrs,
        MessageAction: "SUPPRESS" // don't email a temp password — we'll set a permanent one below
      }));
      const subAttr = created.User?.Attributes?.find((a) => a.Name === "sub");
      if (!subAttr?.Value) throw httpError(500, "Cognito did not return a sub");
      sub = subAttr.Value;
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === "UsernameExistsException") throw httpError(409, "A user with that email already exists");
      throw err;
    }

    await this.deps.cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: this.deps.userPoolId,
      Username: params.email,
      Password: params.password,
      Permanent: true
    }));

    // Mirror to Dynamo so list/get queries that scan the table see the new row
    // immediately (without waiting for a first login).
    return this.deps.users.create({
      id: sub,
      name: params.name,
      email: params.email,
      role: params.role,
      teamId: params.teamId
    });
  }

  async updateUserTeam(userId: string, teamId: string | null): Promise<User | undefined> {
    // Resolve email to use as the Cognito Username. Sub is the Dynamo id; Cognito
    // accepts sub or email as Username only when the pool was created with usernames
    // disabled (email aliases). Our pool was created exactly that way, so the
    // Dynamo row's email works as Username.
    const existing = await this.deps.users.get(userId);
    if (!existing) return undefined;

    const attrs = teamId
      ? [{ Name: "custom:teamId", Value: teamId }]
      : [{ Name: "custom:teamId", Value: "" }];

    await this.deps.cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: this.deps.userPoolId,
      Username: existing.email,
      UserAttributes: attrs
    }));

    return this.deps.users.updateTeam(userId, teamId);
  }
}
