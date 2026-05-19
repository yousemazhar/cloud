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

export class ApiClient {
  token = localStorage.getItem("mini-jira-token") ?? "";
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("mini-jira-token", token);
  }

  clearToken() {
    this.token = "";
    localStorage.removeItem("mini-jira-token");
  }

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 401) {
      this.clearToken();
      this.onUnauthorized?.();
      throw new Error("Your session has expired. Please sign in again.");
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(payload.message ?? `Request failed with ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  demoLogin(userId: string) {
    return this.request<{ token: string; user: User }>("/api/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({ userId })
    });
  }

  cognitoLogin(email: string, password: string) {
    return this.request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  me() {
    return this.request<{ user: User }>("/api/me");
  }

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

  getTask(taskId: string) {
    return this.request<{ task: TaskDetail }>(`/api/tasks/${taskId}`);
  }

  createTask(payload: CreateTaskPayload) {
    return this.request<{ task: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  updateTask(taskId: string, payload: UpdateTaskPayload) {
    return this.request<{ task: Task }>(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  deleteTask(taskId: string) {
    return this.request<void>(`/api/tasks/${taskId}`, { method: "DELETE" });
  }

  createProject(payload: ProjectPayload) {
    return this.request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  updateProject(projectId: string, payload: Partial<ProjectPayload>) {
    return this.request<{ project: Project }>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  deleteProject(projectId: string) {
    return this.request<void>(`/api/projects/${projectId}`, { method: "DELETE" });
  }

  addComment(taskId: string, body: string) {
    return this.request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
  }

  async uploadAttachment(taskId: string, file: File) {
    if (import.meta.env.VITE_BACKEND === "aws") {
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
      if (!putRes.ok) throw new Error(`S3 upload failed (${putRes.status})`);
      return this.request<{ attachment: AttachmentVersion; task: Task }>(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          attachmentId: presigned.presigned.attachmentId,
          key: presigned.presigned.key,
          fileName: file.name,
          mimeType: file.type,
          size: file.size
        })
      });
    }
    const form = new FormData();
    form.append("file", file);
    return this.request<{ attachment: AttachmentVersion; task: Task }>(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      body: form
    });
  }

  deleteAttachment(taskId: string, attachmentId: string) {
    return this.request<void>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
  }
}

export const api = new ApiClient();
