import type { AuditLog, Comment, Project, Task, Team, User } from "@mini-jira/shared";

export const teams: Team[] = [
  { id: "team-frontend", name: "Frontend" },
  { id: "team-backend", name: "Backend" },
  { id: "team-qa", name: "QA" }
];

export const users: User[] = [
  { id: "user-ali", name: "Ali", email: "ali@company.test", role: "manager" },
  { id: "user-sara", name: "Sara", email: "sara@company.test", role: "employee", teamId: "team-frontend" },
  { id: "user-omar", name: "Omar", email: "omar@company.test", role: "employee", teamId: "team-backend" },
  { id: "user-mona", name: "Mona", email: "mona@company.test", role: "employee", teamId: "team-qa" },
  { id: "user-jess", name: "Jess", email: "jess@company.test", role: "admin" }
];

const now = new Date("2026-05-05T20:00:00.000Z").toISOString();
const tomorrow = new Date("2026-05-06T20:00:00.000Z").toISOString();
const nextWeek = new Date("2026-05-12T20:00:00.000Z").toISOString();

export const projects: Project[] = [
  {
    id: "project-portal",
    name: "Customer Portal",
    description: "Self-service portal work across frontend and backend.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "project-mobile-api",
    name: "Mobile API",
    description: "Endpoints and quality checks for the mobile team.",
    createdAt: now,
    updatedAt: now
  }
];

export const tasks: Task[] = [
  {
    id: "task-a",
    title: "Task A: Build dashboard filters",
    description: "Add team, assignee, project, priority, and status filters for managers.",
    status: "todo",
    priority: "high",
    deadline: tomorrow,
    assigneeId: "user-sara",
    teamId: "team-frontend",
    projectId: "project-portal",
    attachments: [],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "task-b",
    title: "Task B: Add assignment event endpoint",
    description: "Prepare the backend event contract that will later publish to SNS.",
    status: "in_progress",
    priority: "urgent",
    deadline: nextWeek,
    assigneeId: "user-omar",
    teamId: "team-backend",
    projectId: "project-mobile-api",
    attachments: [],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "task-c",
    title: "QA smoke checklist",
    description: "Validate login, Kanban movement, comments, and attachment replacement.",
    status: "in_review",
    priority: "medium",
    deadline: nextWeek,
    assigneeId: "user-mona",
    teamId: "team-qa",
    projectId: "project-mobile-api",
    attachments: [],
    createdAt: now,
    updatedAt: now
  }
];

export const comments: Comment[] = [
  {
    id: "comment-1",
    taskId: "task-a",
    authorId: "user-ali",
    body: "Sara, please keep the filters compact enough for demo day.",
    createdAt: now
  },
  {
    id: "comment-2",
    taskId: "task-b",
    authorId: "user-omar",
    body: "I will keep the payload aligned with the SNS assignment event.",
    createdAt: now
  }
];

export const auditLogs: AuditLog[] = [];
