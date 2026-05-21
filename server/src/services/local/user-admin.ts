import type { User } from "@mini-jira/shared";
import { randomUUID } from "node:crypto";
import type { UserRepo } from "../repos.js";
import type { CreateUserParams, UserAdmin } from "../user-admin.js";

export class LocalUserAdmin implements UserAdmin {
  constructor(private readonly users: UserRepo) {}

  async createUser(params: CreateUserParams): Promise<User> {
    return this.users.create({
      id: `user-${randomUUID()}`,
      name: params.name,
      email: params.email,
      role: params.role,
      teamId: params.teamId
    });
  }

  async updateUserTeam(userId: string, teamId: string | null): Promise<User | undefined> {
    return this.users.updateTeam(userId, teamId);
  }
}
