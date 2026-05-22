import type {
  AttachmentVersion,
  AuditLog,
  Comment,
  Project,
  Task,
  Team,
  User
} from "@mini-jira/shared";

/**
 * Repository interfaces. Filtering by role lives in handlers — repos take simple
 * filter args and stay role-agnostic so the DynamoDB impls can target a GSI directly.
 */

export interface TaskListFilters {
  teamId?: string;
  assigneeId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
}

export interface CreateTaskInput {
  id: string;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string;
  priority?: Task["priority"];
  deadline?: string;
  teamId?: string;
  assigneeId?: string;
  projectId?: string;
  status?: Task["status"];
  closedAt?: string;
  updatedAt: string;
}

export interface TaskRepo {
  list(filters: TaskListFilters): Promise<Task[]>;
  get(id: string): Promise<Task | undefined>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: string, patch: UpdateTaskPatch): Promise<Task | undefined>;
  delete(id: string): Promise<boolean>;
  addAttachment(taskId: string, attachment: AttachmentVersion): Promise<Task | undefined>;
  /** Mark an attachment active=true|false (used to soft-delete and to flip prior active). */
  setAttachmentActive(taskId: string, attachmentId: string, active: boolean): Promise<AttachmentVersion | undefined>;
  /** Update updatedAt without changing other fields (used after attachment ops). */
  touch(taskId: string, updatedAt: string): Promise<void>;
}

export interface CreateProjectInput {
  id: string;
  name: string;
  description: string;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string;
  teamId?: string | null; // null clears
  updatedAt: string;
}

export interface ProjectRepo {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, patch: UpdateProjectPatch): Promise<Project | undefined>;
  delete(id: string): Promise<boolean>;
}

export interface CreateCommentInput {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface CommentRepo {
  listForTask(taskId: string): Promise<Comment[]>;
  get(commentId: string): Promise<Comment | undefined>;
  create(input: CreateCommentInput): Promise<Comment>;
  update(commentId: string, patch: { body: string; updatedAt: string }): Promise<Comment | undefined>;
  delete(commentId: string): Promise<boolean>;
  deleteForTask(taskId: string): Promise<void>;
}

export interface CreateAuditInput {
  id: string;
  taskId: string;
  actorId: string;
  actorName?: string;
  type?: "created" | "status_changed";
  fromStatus?: Task["status"];
  toStatus?: Task["status"];
  createdAt: string;
}

export interface AuditRepo {
  listForTask(taskId: string): Promise<AuditLog[]>;
  create(input: CreateAuditInput): Promise<AuditLog>;
  deleteForTask(taskId: string): Promise<void>;
}

export interface CreateUserInput {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  teamId?: string;
}

export interface UpdateUserPatch {
  name?: string;
  role?: User["role"];
  teamId?: string | null;
}

export interface UserRepo {
  list(): Promise<User[]>;
  get(id: string): Promise<User | undefined>;
  listByTeam(teamId: string): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
  updateTeam(userId: string, teamId: string | null): Promise<User | undefined>;
  update(userId: string, patch: UpdateUserPatch): Promise<User | undefined>;
}

export interface CreateTeamInput {
  id: string;
  name: string;
}

export interface TeamRepo {
  list(): Promise<Team[]>;
  get(id: string): Promise<Team | undefined>;
  create(input: CreateTeamInput): Promise<Team>;
}
