import type {
  AttachmentVersion,
  AuditLog,
  Comment,
  Project,
  Task,
  Team,
  User
} from "@mini-jira/shared";
import {
  auditLogs as seedAuditLogs,
  comments as seedComments,
  projects as seedProjects,
  tasks as seedTasks,
  teams as seedTeams,
  users as seedUsers
} from "../../seed.js";
import type {
  AuditRepo,
  CommentRepo,
  CreateAuditInput,
  CreateCommentInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateTeamInput,
  ProjectRepo,
  TaskListFilters,
  TaskRepo,
  TeamRepo,
  UpdateProjectPatch,
  UpdateTaskPatch,
  UserRepo
} from "../repos.js";

export interface InMemoryState {
  teams: Team[];
  users: User[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  auditLogs: AuditLog[];
}

export function createInMemoryState(): InMemoryState {
  return structuredClone({
    teams: seedTeams,
    users: seedUsers,
    projects: seedProjects,
    tasks: seedTasks,
    comments: seedComments,
    auditLogs: seedAuditLogs
  });
}

export class InMemoryTaskRepo implements TaskRepo {
  constructor(private readonly state: InMemoryState) {}

  async list(filters: TaskListFilters): Promise<Task[]> {
    return this.state.tasks.filter((task) => {
      if (filters.teamId && task.teamId !== filters.teamId) return false;
      if (filters.assigneeId && task.assigneeId !== filters.assigneeId) return false;
      if (filters.projectId && task.projectId !== filters.projectId) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      return true;
    });
  }

  async get(id: string): Promise<Task | undefined> {
    return this.state.tasks.find((task) => task.id === id);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const task: Task = { ...input, attachments: [] };
    this.state.tasks.unshift(task);
    return task;
  }

  async update(id: string, patch: UpdateTaskPatch): Promise<Task | undefined> {
    const task = this.state.tasks.find((candidate) => candidate.id === id);
    if (!task) return undefined;
    if (patch.title !== undefined) task.title = patch.title;
    if (patch.description !== undefined) task.description = patch.description;
    if (patch.priority !== undefined) task.priority = patch.priority;
    if (patch.deadline !== undefined) task.deadline = patch.deadline;
    if (patch.teamId !== undefined) task.teamId = patch.teamId;
    if (patch.assigneeId !== undefined) task.assigneeId = patch.assigneeId;
    if (patch.projectId !== undefined) task.projectId = patch.projectId;
    if (patch.status !== undefined) task.status = patch.status;
    if (patch.closedAt !== undefined) task.closedAt = patch.closedAt;
    task.updatedAt = patch.updatedAt;
    return task;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.state.tasks.length;
    this.state.tasks = this.state.tasks.filter((task) => task.id !== id);
    return this.state.tasks.length !== before;
  }

  async addAttachment(taskId: string, attachment: AttachmentVersion): Promise<Task | undefined> {
    const task = this.state.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return undefined;
    task.attachments.unshift(attachment);
    return task;
  }

  async setAttachmentActive(
    taskId: string,
    attachmentId: string,
    active: boolean
  ): Promise<AttachmentVersion | undefined> {
    const task = this.state.tasks.find((candidate) => candidate.id === taskId);
    const attachment = task?.attachments.find((entry) => entry.id === attachmentId);
    if (!attachment) return undefined;
    attachment.active = active;
    return attachment;
  }

  async touch(taskId: string, updatedAt: string): Promise<void> {
    const task = this.state.tasks.find((candidate) => candidate.id === taskId);
    if (task) task.updatedAt = updatedAt;
  }
}

export class InMemoryProjectRepo implements ProjectRepo {
  constructor(private readonly state: InMemoryState) {}

  async list(): Promise<Project[]> {
    return [...this.state.projects];
  }

  async get(id: string): Promise<Project | undefined> {
    return this.state.projects.find((project) => project.id === id);
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const project: Project = { ...input };
    this.state.projects.unshift(project);
    return project;
  }

  async update(id: string, patch: UpdateProjectPatch): Promise<Project | undefined> {
    const project = this.state.projects.find((candidate) => candidate.id === id);
    if (!project) return undefined;
    if (patch.name !== undefined) project.name = patch.name;
    if (patch.description !== undefined) project.description = patch.description;
    if (patch.teamId !== undefined) project.teamId = patch.teamId ?? undefined;
    project.updatedAt = patch.updatedAt;
    return project;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.state.projects.length;
    this.state.projects = this.state.projects.filter((project) => project.id !== id);
    return this.state.projects.length !== before;
  }
}

export class InMemoryCommentRepo implements CommentRepo {
  constructor(private readonly state: InMemoryState) {}

  async listForTask(taskId: string): Promise<Comment[]> {
    return this.state.comments.filter((comment) => comment.taskId === taskId);
  }

  async get(commentId: string): Promise<Comment | undefined> {
    return this.state.comments.find((comment) => comment.id === commentId);
  }

  async create(input: CreateCommentInput): Promise<Comment> {
    const comment: Comment = { ...input };
    this.state.comments.push(comment);
    return comment;
  }

  async update(commentId: string, patch: { body: string; updatedAt: string }): Promise<Comment | undefined> {
    const comment = this.state.comments.find((entry) => entry.id === commentId);
    if (!comment) return undefined;
    comment.body = patch.body;
    comment.updatedAt = patch.updatedAt;
    return comment;
  }

  async delete(commentId: string): Promise<boolean> {
    const before = this.state.comments.length;
    this.state.comments = this.state.comments.filter((comment) => comment.id !== commentId);
    return this.state.comments.length !== before;
  }

  async deleteForTask(taskId: string): Promise<void> {
    this.state.comments = this.state.comments.filter((comment) => comment.taskId !== taskId);
  }
}

export class InMemoryAuditRepo implements AuditRepo {
  constructor(private readonly state: InMemoryState) {}

  async listForTask(taskId: string): Promise<AuditLog[]> {
    return this.state.auditLogs.filter((entry) => entry.taskId === taskId);
  }

  async create(input: CreateAuditInput): Promise<AuditLog> {
    const entry: AuditLog = { ...input };
    this.state.auditLogs.unshift(entry);
    return entry;
  }

  async deleteForTask(taskId: string): Promise<void> {
    this.state.auditLogs = this.state.auditLogs.filter((entry) => entry.taskId !== taskId);
  }
}

export class InMemoryUserRepo implements UserRepo {
  constructor(private readonly state: InMemoryState) {}

  async list(): Promise<User[]> {
    return [...this.state.users];
  }

  async get(id: string): Promise<User | undefined> {
    return this.state.users.find((user) => user.id === id);
  }

  async listByTeam(teamId: string): Promise<User[]> {
    return this.state.users.filter((user) => user.teamId === teamId);
  }

  async create(input: { id: string; name: string; email: string; role: User["role"]; teamId?: string }): Promise<User> {
    const user: User = {
      id: input.id,
      name: input.name,
      email: input.email,
      role: input.role,
      teamId: input.teamId
    };
    this.state.users.push(user);
    return user;
  }

  async updateTeam(userId: string, teamId: string | null): Promise<User | undefined> {
    const user = this.state.users.find((entry) => entry.id === userId);
    if (!user) return undefined;
    user.teamId = teamId ?? undefined;
    return user;
  }

  async update(
    userId: string,
    patch: { name?: string; role?: User["role"]; teamId?: string | null }
  ): Promise<User | undefined> {
    const user = this.state.users.find((entry) => entry.id === userId);
    if (!user) return undefined;
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.teamId !== undefined) user.teamId = patch.teamId ?? undefined;
    return user;
  }
}

export class InMemoryTeamRepo implements TeamRepo {
  constructor(private readonly state: InMemoryState) {}

  async list(): Promise<Team[]> {
    return [...this.state.teams];
  }

  async get(id: string): Promise<Team | undefined> {
    return this.state.teams.find((team) => team.id === id);
  }

  async create(input: CreateTeamInput): Promise<Team> {
    const team: Team = { id: input.id, name: input.name };
    this.state.teams.push(team);
    return team;
  }
}
