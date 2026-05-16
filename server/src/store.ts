import type {
  AttachmentVersion,
  AuditLog,
  Comment,
  Priority,
  Project,
  Task,
  TaskStatus,
  Team,
  User
} from "@mini-jira/shared";
import { auditLogs as seedAuditLogs, comments as seedComments, projects as seedProjects, tasks as seedTasks, teams, users } from "./seed.js";

export interface DataStore {
  teams: Team[];
  users: User[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  auditLogs: AuditLog[];
}

export function createStore(): DataStore {
  return structuredClone({
    teams,
    users,
    projects: seedProjects,
    tasks: seedTasks,
    comments: seedComments,
    auditLogs: seedAuditLogs
  });
}

export const db = createStore();

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isManager(user: User): boolean {
  return user.role === "manager" || user.role === "admin";
}

export function canSeeTask(user: User, task: Task): boolean {
  return isManager(user) || (!!user.teamId && user.teamId === task.teamId);
}

export function canWriteTask(user: User, task: Task): boolean {
  return isManager(user) || (!!user.teamId && user.teamId === task.teamId);
}

export interface TaskInput {
  title: string;
  description: string;
  priority: Priority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId: string;
  status?: TaskStatus;
}

export interface ProjectInput {
  name: string;
  description: string;
  teamId?: string;
}

export interface AttachmentInput {
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: string;
}

export function activeAttachment(task: Task): AttachmentVersion | undefined {
  return task.attachments.find((attachment) => attachment.active);
}
