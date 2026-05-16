export type Role = "manager" | "employee" | "admin";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done"
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};

export interface Team {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentVersion {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  active: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId: string;
  attachments: AttachmentVersion[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  taskId: string;
  actorId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  createdAt: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface DashboardTeamSummary {
  teamId: string;
  total: number;
  todo: number;
  inProgress: number;
  inReview: number;
  done: number;
}

export interface TaskDetail extends Task {
  comments: Comment[];
  auditLogs: AuditLog[];
}
