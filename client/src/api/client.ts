import type {
  AttachmentVersion,
  Comment,
  DashboardTeamSummary,
  Priority,
  Project,
  Task,
  TaskDetail,
  TaskStatus,
  Team,
  User
} from "@mini-jira/shared";
import { ApiError } from "./errors";

const API_BASE = "";

export interface AppData {
  teams: Team[];
  users: User[];
  projects: Project[];
  tasks: Task[];
  summaries: DashboardTeamSummary[];
}

export interface TaskFilters {
  teamId?: string;
  assigneeId?: string;
  projectId?: string;
  priority?: Priority | "";
  status?: TaskStatus | "";
}

export interface CreateTaskPayload {
  title: string;
  description: string;
  priority: Priority;
  deadline: string;
  teamId: string;
  assigneeId: string;
  projectId: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  priority?: Priority;
  deadline?: string;
  teamId?: string;
  assigneeId?: string;
  projectId?: string;
  status?: TaskStatus;
}

export interface ProjectPayload {
  name: string;
  description: string;
  teamId?: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: User["role"];
  teamId?: string;
  password?: string;
}

export interface RuntimeConfig {
  uploadMode: "multipart" | "presigned";
  backend: "local" | "aws";
}

const TOKEN_KEY = "mini-jira-token";

export class ApiClient {
  // Token lives in memory + sessionStorage (cleared on tab close, not shared with
  // other tabs). Avoids the XSS surface area of localStorage for a long-lived
  // bearer token.
  token = readSessionToken();
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string) {
    this.token = token;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  }

  clearToken() {
    this.token = "";
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    // Clean up the legacy localStorage key so old sessions don't linger.
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  async request<T>(path: string, options: RequestInit & { suppressUnauthorizedHook?: boolean } = {}): Promise<T> {
    const { suppressUnauthorizedHook, ...init } = options;
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (response.status === 401) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      // During login the 401 means "wrong credentials" — don't wipe state and
      // don't show the generic session-expired toast.
      if (suppressUnauthorizedHook) {
        throw new ApiError(401, payload.message ?? "Wrong username or password.");
      }
      this.clearToken();
      this.onUnauthorized?.();
      throw new ApiError(401, payload.message ?? "Your session has expired. Please sign in again.");
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        errors?: { field: string; message: string }[];
      };
      const fieldErrors = new Map<string, string>();
      for (const entry of payload.errors ?? []) fieldErrors.set(entry.field, entry.message);
      throw new ApiError(
        response.status,
        payload.message ?? `Request failed with ${response.status}`,
        fieldErrors
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /* --- auth --- */
  config() { return this.request<RuntimeConfig>("/api/config"); }
  demoLogin(userId: string) {
    return this.request<{ token: string; user: User }>("/api/auth/demo-login", {
      method: "POST", body: JSON.stringify({ userId }), suppressUnauthorizedHook: true
    });
  }
  cognitoLogin(email: string, password: string) {
    return this.request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }), suppressUnauthorizedHook: true
    });
  }
  signup(name: string, email: string, password: string) {
    return this.request<{ user: User }>("/api/auth/signup", {
      method: "POST", body: JSON.stringify({ name, email, password }), suppressUnauthorizedHook: true
    });
  }
  updateMe(payload: { name?: string }) {
    return this.request<{ user: User }>("/api/me", {
      method: "PATCH", body: JSON.stringify(payload)
    });
  }
  changeMyPassword(currentPassword: string, newPassword: string) {
    return this.request<void>("/api/me/password", {
      method: "POST", body: JSON.stringify({ currentPassword, newPassword })
    });
  }
  updateUser(userId: string, payload: { name?: string; role?: User["role"]; teamId?: string | null }) {
    return this.request<{ user: User }>(`/api/users/${userId}`, {
      method: "PATCH", body: JSON.stringify(payload)
    });
  }
  resetUserPassword(userId: string, newPassword: string) {
    return this.request<void>(`/api/users/${userId}/password`, {
      method: "POST", body: JSON.stringify({ newPassword })
    });
  }
  me() { return this.request<{ user: User }>("/api/me"); }

  /* --- bundled load --- */
  async loadAppData(filters: TaskFilters = {}): Promise<AppData> {
    const entries = Object.entries(filters).filter(([, value]) => value) as [string, string][];
    const search = new URLSearchParams(entries);
    const [teams, users, projects, tasks, summaries] = await Promise.all([
      this.request<{ teams: Team[] }>("/api/teams"),
      this.request<{ users: User[] }>("/api/users"),
      this.request<{ projects: Project[] }>("/api/projects"),
      this.request<{ tasks: Task[] }>(`/api/tasks${search.size ? `?${search}` : ""}`),
      this.request<{ summaries: DashboardTeamSummary[] }>("/api/dashboard/team-summary")
    ]);
    return {
      teams: teams.teams,
      users: users.users,
      projects: projects.projects,
      tasks: tasks.tasks,
      summaries: summaries.summaries
    };
  }

  /* --- tasks --- */
  getTask(taskId: string) { return this.request<{ task: TaskDetail }>(`/api/tasks/${taskId}`); }
  createTask(payload: CreateTaskPayload) {
    return this.request<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
  }
  updateTask(taskId: string, payload: UpdateTaskPayload) {
    return this.request<{ task: Task }>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  deleteTask(taskId: string) { return this.request<void>(`/api/tasks/${taskId}`, { method: "DELETE" }); }

  /* --- projects --- */
  createProject(payload: ProjectPayload) {
    return this.request<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify(payload) });
  }
  updateProject(projectId: string, payload: Partial<ProjectPayload>) {
    return this.request<{ project: Project }>(`/api/projects/${projectId}`, {
      method: "PATCH", body: JSON.stringify(payload)
    });
  }
  deleteProject(projectId: string) {
    return this.request<void>(`/api/projects/${projectId}`, { method: "DELETE" });
  }

  /* --- comments --- */
  addComment(taskId: string, body: string) {
    return this.request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      method: "POST", body: JSON.stringify({ body })
    });
  }
  updateComment(commentId: string, body: string) {
    return this.request<{ comment: Comment }>(`/api/comments/${commentId}`, {
      method: "PUT", body: JSON.stringify({ body })
    });
  }
  deleteComment(commentId: string) {
    return this.request<void>(`/api/comments/${commentId}`, { method: "DELETE" });
  }

  /* --- teams / users admin --- */
  createTeam(name: string) {
    return this.request<{ team: Team }>("/api/teams", { method: "POST", body: JSON.stringify({ name }) });
  }
  createUser(payload: CreateUserPayload) {
    return this.request<{ user: User }>("/api/users", { method: "POST", body: JSON.stringify(payload) });
  }
  updateUserTeam(userId: string, teamId: string | null) {
    return this.request<{ user: User }>(`/api/users/${userId}/team`, {
      method: "PATCH", body: JSON.stringify({ teamId })
    });
  }

  /* --- attachments — upload mode chosen at runtime --- */
  async uploadAttachment(taskId: string, file: File, uploadMode: "multipart" | "presigned") {
    if (uploadMode === "presigned") {
      const presigned = await this.request<{
        presigned: { attachmentId: string; uploadUrl: string; key: string; headers?: Record<string, string> };
      }>(`/api/tasks/${taskId}/attachments/presign`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size })
      });
      const putRes = await fetch(presigned.presigned.uploadUrl, {
        method: "PUT",
        headers: presigned.presigned.headers ?? { "Content-Type": file.type },
        body: file
      });
      if (!putRes.ok) throw new ApiError(putRes.status, `S3 upload failed (${putRes.status})`);
      return this.request<{ attachment: AttachmentVersion; task: Task }>(
        `/api/tasks/${taskId}/attachments`,
        {
          method: "POST",
          body: JSON.stringify({
            attachmentId: presigned.presigned.attachmentId,
            key: presigned.presigned.key,
            fileName: file.name,
            mimeType: file.type,
            size: file.size
          })
        }
      );
    }
    const form = new FormData();
    form.append("file", file);
    return this.request<{ attachment: AttachmentVersion; task: Task }>(
      `/api/tasks/${taskId}/attachments`,
      { method: "POST", body: form }
    );
  }
  deleteAttachment(taskId: string, attachmentId: string) {
    return this.request<void>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
  }
}

function readSessionToken(): string {
  try {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
  } catch { /* ignore */ }
  return "";
}

export const api = new ApiClient();
// Best-effort cleanup of the pre-fix localStorage token from older releases.
try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
