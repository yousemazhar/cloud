import type { Task, User } from "@mini-jira/shared";

export function isManager(user: User): boolean {
  return user.role === "manager" || user.role === "admin";
}

export function canSeeTask(user: User, task: Pick<Task, "teamId">): boolean {
  return isManager(user) || (!!user.teamId && user.teamId === task.teamId);
}

export function canWriteTask(user: User, task: Pick<Task, "teamId">): boolean {
  return canSeeTask(user, task);
}
