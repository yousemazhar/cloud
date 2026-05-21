import type { Role, User } from "@mini-jira/shared";

/**
 * UserAdmin handles privileged user-management operations. The local impl just
 * writes to the in-memory UserRepo; the AWS impl creates the user in Cognito
 * (so they can sign in) and mirrors the row to the Dynamo Users table.
 *
 * Route handlers go through this seam so they never import @aws-sdk/* directly
 * (per CLAUDE.md rule).
 */
export interface CreateUserParams {
  name: string;
  email: string;
  role: Role;
  teamId?: string;
  /** Initial password (admin-set, permanent). Required in AWS mode. */
  password?: string;
}

export interface UpdateUserParams {
  name?: string;
  role?: Role;
  /** undefined = leave alone, null = clear, string = set */
  teamId?: string | null;
}

export interface UserAdmin {
  createUser(params: CreateUserParams): Promise<User>;
  updateUserTeam(userId: string, teamId: string | null): Promise<User | undefined>;
  updateUser(userId: string, params: UpdateUserParams): Promise<User | undefined>;
  setUserPassword(userId: string, newPassword: string): Promise<void>;
  /** Verify the user's current password (used for self-service password change). */
  verifyPassword(email: string, password: string): Promise<boolean>;
}
