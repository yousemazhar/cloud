import type { User } from "@mini-jira/shared";
import { randomUUID } from "node:crypto";
import type { UserRepo } from "../repos.js";
import type { CreateUserParams, UpdateUserParams, UserAdmin } from "../user-admin.js";

/**
 * Local mode keeps a parallel map of `email -> password` so we can verify
 * current-password attempts in the self-service password change flow without
 * standing up a real auth backend. Passwords are not persisted across restarts.
 */
export class LocalUserAdmin implements UserAdmin {
  private readonly passwords = new Map<string, string>();

  constructor(private readonly users: UserRepo) {}

  async createUser(params: CreateUserParams): Promise<User> {
    const user = await this.users.create({
      id: `user-${randomUUID()}`,
      name: params.name,
      email: params.email,
      role: params.role,
      teamId: params.teamId
    });
    if (params.password) this.passwords.set(params.email.toLowerCase(), params.password);
    return user;
  }

  async updateUserTeam(userId: string, teamId: string | null): Promise<User | undefined> {
    return this.users.updateTeam(userId, teamId);
  }

  async updateUser(userId: string, params: UpdateUserParams): Promise<User | undefined> {
    return this.users.update(userId, params);
  }

  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.users.get(userId);
    if (!user) return;
    this.passwords.set(user.email.toLowerCase(), newPassword);
  }

  async verifyPassword(email: string, password: string): Promise<boolean> {
    const stored = this.passwords.get(email.toLowerCase());
    // If we don't know a password for this user (e.g. a demo persona who was
    // never created via createUser), allow the change so the local flow is
    // usable end-to-end. The AWS impl is strict.
    if (stored === undefined) return true;
    return stored === password;
  }
}
