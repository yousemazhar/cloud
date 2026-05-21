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
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
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

/**
 * Table layout (see server/src/services/README.md):
 *   Tasks      PK id          GSIs teamId-deadline-index, assigneeId-deadline-index
 *   Projects   PK id          GSI  teamId-index
 *   Comments   PK taskId      SK   createdAt#id
 *   AuditLogs  PK taskId      SK   createdAt#id
 *   Users      PK id          GSI  email-index (sparse, not used here)
 *   Teams      PK id
 *
 * These repos do exactly one Dynamo call per method. Manager filtering is in the
 * handler; repos take simple filter args so we can pick the right Query when there's
 * a GSI to hit, and fall back to Scan only when no key path applies.
 */

export interface DynamoTableNames {
  tasks: string;
  projects: string;
  comments: string;
  auditLogs: string;
  users: string;
  teams: string;
}

interface RepoCtx {
  client: DynamoDBDocumentClient;
  tables: DynamoTableNames;
}

const SORT_KEY = "createdAt#id";

function sortKey(createdAt: string, id: string): string {
  return `${createdAt}#${id}`;
}

export class DynamoTaskRepo implements TaskRepo {
  constructor(private readonly ctx: RepoCtx) {}

  async list(filters: TaskListFilters): Promise<Task[]> {
    let items: Task[] = [];
    if (filters.teamId) {
      const result = await this.ctx.client.send(
        new QueryCommand({
          TableName: this.ctx.tables.tasks,
          IndexName: "teamId-deadline-index",
          KeyConditionExpression: "teamId = :teamId",
          ExpressionAttributeValues: { ":teamId": filters.teamId }
        })
      );
      items = (result.Items ?? []) as Task[];
    } else if (filters.assigneeId) {
      const result = await this.ctx.client.send(
        new QueryCommand({
          TableName: this.ctx.tables.tasks,
          IndexName: "assigneeId-deadline-index",
          KeyConditionExpression: "assigneeId = :assigneeId",
          ExpressionAttributeValues: { ":assigneeId": filters.assigneeId }
        })
      );
      items = (result.Items ?? []) as Task[];
    } else {
      const result = await this.ctx.client.send(new ScanCommand({ TableName: this.ctx.tables.tasks }));
      items = (result.Items ?? []) as Task[];
    }
    return items.filter((task) => {
      if (filters.assigneeId && task.assigneeId !== filters.assigneeId) return false;
      if (filters.projectId && task.projectId !== filters.projectId) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      return true;
    });
  }

  async get(id: string): Promise<Task | undefined> {
    const result = await this.ctx.client.send(
      new GetCommand({ TableName: this.ctx.tables.tasks, Key: { id } })
    );
    return (result.Item as Task | undefined) ?? undefined;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const task: Task = { ...input, attachments: [] };
    await this.ctx.client.send(new PutCommand({ TableName: this.ctx.tables.tasks, Item: task }));
    return task;
  }

  async update(id: string, patch: UpdateTaskPatch): Promise<Task | undefined> {
    const sets: string[] = ["updatedAt = :updatedAt"];
    const values: Record<string, unknown> = { ":updatedAt": patch.updatedAt };
    const names: Record<string, string> = {};
    const assign = (field: keyof UpdateTaskPatch, alias: string) => {
      const value = patch[field];
      if (value === undefined) return;
      names[`#${alias}`] = field as string;
      values[`:${alias}`] = value;
      sets.push(`#${alias} = :${alias}`);
    };
    assign("title", "title");
    assign("description", "description");
    assign("priority", "priority");
    assign("deadline", "deadline");
    assign("teamId", "teamId");
    assign("assigneeId", "assigneeId");
    assign("projectId", "projectId");
    assign("status", "status");
    assign("closedAt", "closedAt");
    const result = await this.ctx.client.send(
      new UpdateCommand({
        TableName: this.ctx.tables.tasks,
        Key: { id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW"
      })
    );
    return (result.Attributes as Task | undefined) ?? undefined;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.ctx.client.send(
        new DeleteCommand({
          TableName: this.ctx.tables.tasks,
          Key: { id },
          ConditionExpression: "attribute_exists(id)"
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async addAttachment(taskId: string, attachment: AttachmentVersion): Promise<Task | undefined> {
    const result = await this.ctx.client.send(
      new UpdateCommand({
        TableName: this.ctx.tables.tasks,
        Key: { id: taskId },
        UpdateExpression:
          "SET attachments = list_append(if_not_exists(attachments, :empty), :new), updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":empty": [],
          ":new": [attachment],
          ":updatedAt": attachment.uploadedAt
        },
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW"
      })
    );
    return (result.Attributes as Task | undefined) ?? undefined;
  }

  async setAttachmentActive(
    taskId: string,
    attachmentId: string,
    active: boolean
  ): Promise<AttachmentVersion | undefined> {
    // Dynamo can't update a list item by predicate in a single expression — read,
    // modify, write back. Acceptable for a 5-MB-max attachment list.
    const task = await this.get(taskId);
    if (!task) return undefined;
    const attachment = task.attachments.find((entry) => entry.id === attachmentId);
    if (!attachment) return undefined;
    attachment.active = active;
    await this.ctx.client.send(
      new UpdateCommand({
        TableName: this.ctx.tables.tasks,
        Key: { id: taskId },
        UpdateExpression: "SET attachments = :attachments, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":attachments": task.attachments,
          ":updatedAt": new Date().toISOString()
        }
      })
    );
    return attachment;
  }

  async touch(taskId: string, updatedAt: string): Promise<void> {
    await this.ctx.client.send(
      new UpdateCommand({
        TableName: this.ctx.tables.tasks,
        Key: { id: taskId },
        UpdateExpression: "SET updatedAt = :updatedAt",
        ExpressionAttributeValues: { ":updatedAt": updatedAt }
      })
    );
  }
}

export class DynamoProjectRepo implements ProjectRepo {
  constructor(private readonly ctx: RepoCtx) {}

  async list(): Promise<Project[]> {
    const result = await this.ctx.client.send(new ScanCommand({ TableName: this.ctx.tables.projects }));
    return (result.Items ?? []) as Project[];
  }

  async get(id: string): Promise<Project | undefined> {
    const result = await this.ctx.client.send(
      new GetCommand({ TableName: this.ctx.tables.projects, Key: { id } })
    );
    return (result.Item as Project | undefined) ?? undefined;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const project: Project = { ...input };
    await this.ctx.client.send(new PutCommand({ TableName: this.ctx.tables.projects, Item: project }));
    return project;
  }

  async update(id: string, patch: UpdateProjectPatch): Promise<Project | undefined> {
    const sets: string[] = ["updatedAt = :updatedAt"];
    const removes: string[] = [];
    const values: Record<string, unknown> = { ":updatedAt": patch.updatedAt };
    const names: Record<string, string> = {};
    if (patch.name !== undefined) {
      names["#name"] = "name";
      values[":name"] = patch.name;
      sets.push("#name = :name");
    }
    if (patch.description !== undefined) {
      names["#description"] = "description";
      values[":description"] = patch.description;
      sets.push("#description = :description");
    }
    if (patch.teamId !== undefined) {
      if (patch.teamId === null || patch.teamId === "") {
        removes.push("teamId");
      } else {
        values[":teamId"] = patch.teamId;
        sets.push("teamId = :teamId");
      }
    }
    let expression = `SET ${sets.join(", ")}`;
    if (removes.length) expression += ` REMOVE ${removes.join(", ")}`;
    const result = await this.ctx.client.send(
      new UpdateCommand({
        TableName: this.ctx.tables.projects,
        Key: { id },
        UpdateExpression: expression,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW"
      })
    );
    return (result.Attributes as Project | undefined) ?? undefined;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.ctx.client.send(
        new DeleteCommand({
          TableName: this.ctx.tables.projects,
          Key: { id },
          ConditionExpression: "attribute_exists(id)"
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}

export class DynamoCommentRepo implements CommentRepo {
  constructor(private readonly ctx: RepoCtx) {}

  async listForTask(taskId: string): Promise<Comment[]> {
    const result = await this.ctx.client.send(
      new QueryCommand({
        TableName: this.ctx.tables.comments,
        KeyConditionExpression: "taskId = :taskId",
        ExpressionAttributeValues: { ":taskId": taskId }
      })
    );
    return (result.Items ?? []).map(stripSortKey) as Comment[];
  }

  // Comments are stored under PK=taskId + SK=createdAt#id. Looking one up by id alone
  // requires either a GSI on id or a scan. We scan because the volume per task is small
  // and global comment-by-id lookups happen rarely (only on edit/delete).
  async get(commentId: string): Promise<Comment | undefined> {
    const result = await this.ctx.client.send(
      new ScanCommand({
        TableName: this.ctx.tables.comments,
        FilterExpression: "id = :id",
        ExpressionAttributeValues: { ":id": commentId },
        Limit: 1
      })
    );
    const item = (result.Items ?? [])[0];
    return item ? (stripSortKey(item) as Comment) : undefined;
  }

  async create(input: CreateCommentInput): Promise<Comment> {
    const comment: Comment = { ...input };
    await this.ctx.client.send(
      new PutCommand({
        TableName: this.ctx.tables.comments,
        Item: { ...comment, [SORT_KEY]: sortKey(input.createdAt, input.id) }
      })
    );
    return comment;
  }

  async update(commentId: string, patch: { body: string; updatedAt: string }): Promise<Comment | undefined> {
    const existing = await this.get(commentId);
    if (!existing) return undefined;
    const updated: Comment = { ...existing, body: patch.body, updatedAt: patch.updatedAt };
    await this.ctx.client.send(
      new PutCommand({
        TableName: this.ctx.tables.comments,
        Item: { ...updated, [SORT_KEY]: sortKey(existing.createdAt, existing.id) }
      })
    );
    return updated;
  }

  async delete(commentId: string): Promise<boolean> {
    const existing = await this.get(commentId);
    if (!existing) return false;
    await this.ctx.client.send(
      new DeleteCommand({
        TableName: this.ctx.tables.comments,
        Key: { taskId: existing.taskId, [SORT_KEY]: sortKey(existing.createdAt, existing.id) }
      })
    );
    return true;
  }

  async deleteForTask(taskId: string): Promise<void> {
    const result = await this.ctx.client.send(
      new QueryCommand({
        TableName: this.ctx.tables.comments,
        KeyConditionExpression: "taskId = :taskId",
        ExpressionAttributeValues: { ":taskId": taskId },
        ProjectionExpression: `taskId, #sk`,
        ExpressionAttributeNames: { "#sk": SORT_KEY }
      })
    );
    for (const item of result.Items ?? []) {
      await this.ctx.client.send(
        new DeleteCommand({
          TableName: this.ctx.tables.comments,
          Key: { taskId, [SORT_KEY]: (item as Record<string, string>)[SORT_KEY] }
        })
      );
    }
  }
}

export class DynamoAuditRepo implements AuditRepo {
  constructor(private readonly ctx: RepoCtx) {}

  async listForTask(taskId: string): Promise<AuditLog[]> {
    const result = await this.ctx.client.send(
      new QueryCommand({
        TableName: this.ctx.tables.auditLogs,
        KeyConditionExpression: "taskId = :taskId",
        ExpressionAttributeValues: { ":taskId": taskId },
        ScanIndexForward: false
      })
    );
    return (result.Items ?? []).map(stripSortKey) as AuditLog[];
  }

  async create(input: CreateAuditInput): Promise<AuditLog> {
    const entry: AuditLog = { ...input };
    await this.ctx.client.send(
      new PutCommand({
        TableName: this.ctx.tables.auditLogs,
        Item: { ...entry, [SORT_KEY]: sortKey(input.createdAt, input.id) }
      })
    );
    return entry;
  }

  async deleteForTask(taskId: string): Promise<void> {
    const result = await this.ctx.client.send(
      new QueryCommand({
        TableName: this.ctx.tables.auditLogs,
        KeyConditionExpression: "taskId = :taskId",
        ExpressionAttributeValues: { ":taskId": taskId },
        ProjectionExpression: `taskId, #sk`,
        ExpressionAttributeNames: { "#sk": SORT_KEY }
      })
    );
    for (const item of result.Items ?? []) {
      await this.ctx.client.send(
        new DeleteCommand({
          TableName: this.ctx.tables.auditLogs,
          Key: { taskId, [SORT_KEY]: (item as Record<string, string>)[SORT_KEY] }
        })
      );
    }
  }
}

export class DynamoUserRepo implements UserRepo {
  constructor(private readonly ctx: RepoCtx) {}

  async list(): Promise<User[]> {
    const result = await this.ctx.client.send(new ScanCommand({ TableName: this.ctx.tables.users }));
    return (result.Items ?? []) as User[];
  }

  async get(id: string): Promise<User | undefined> {
    const result = await this.ctx.client.send(
      new GetCommand({ TableName: this.ctx.tables.users, Key: { id } })
    );
    return (result.Item as User | undefined) ?? undefined;
  }

  async listByTeam(teamId: string): Promise<User[]> {
    const all = await this.list();
    return all.filter((user) => user.teamId === teamId);
  }

  async create(input: { id: string; name: string; email: string; role: User["role"]; teamId?: string }): Promise<User> {
    const user: User = {
      id: input.id,
      name: input.name,
      email: input.email,
      role: input.role,
      teamId: input.teamId
    };
    await this.ctx.client.send(new PutCommand({ TableName: this.ctx.tables.users, Item: user }));
    return user;
  }

  async updateTeam(userId: string, teamId: string | null): Promise<User | undefined> {
    const expression = teamId === null
      ? "REMOVE teamId"
      : "SET teamId = :teamId";
    const values = teamId === null ? undefined : { ":teamId": teamId };
    try {
      const result = await this.ctx.client.send(
        new UpdateCommand({
          TableName: this.ctx.tables.users,
          Key: { id: userId },
          UpdateExpression: expression,
          ExpressionAttributeValues: values,
          ConditionExpression: "attribute_exists(id)",
          ReturnValues: "ALL_NEW"
        })
      );
      return (result.Attributes as User | undefined) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async update(
    userId: string,
    patch: { name?: string; role?: User["role"]; teamId?: string | null }
  ): Promise<User | undefined> {
    const sets: string[] = [];
    const removes: string[] = [];
    const values: Record<string, unknown> = {};
    const names: Record<string, string> = {};
    if (patch.name !== undefined) {
      names["#name"] = "name";
      values[":name"] = patch.name;
      sets.push("#name = :name");
    }
    if (patch.role !== undefined) {
      names["#role"] = "role";
      values[":role"] = patch.role;
      sets.push("#role = :role");
    }
    if (patch.teamId !== undefined) {
      if (patch.teamId === null || patch.teamId === "") {
        removes.push("teamId");
      } else {
        values[":teamId"] = patch.teamId;
        sets.push("teamId = :teamId");
      }
    }
    if (sets.length === 0 && removes.length === 0) {
      return this.get(userId);
    }
    let expression = "";
    if (sets.length) expression += `SET ${sets.join(", ")}`;
    if (removes.length) expression += `${expression ? " " : ""}REMOVE ${removes.join(", ")}`;
    try {
      const result = await this.ctx.client.send(
        new UpdateCommand({
          TableName: this.ctx.tables.users,
          Key: { id: userId },
          UpdateExpression: expression,
          ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
          ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
          ConditionExpression: "attribute_exists(id)",
          ReturnValues: "ALL_NEW"
        })
      );
      return (result.Attributes as User | undefined) ?? undefined;
    } catch {
      return undefined;
    }
  }
}

export class DynamoTeamRepo implements TeamRepo {
  constructor(private readonly ctx: RepoCtx) {}

  async list(): Promise<Team[]> {
    const result = await this.ctx.client.send(new ScanCommand({ TableName: this.ctx.tables.teams }));
    return (result.Items ?? []) as Team[];
  }

  async get(id: string): Promise<Team | undefined> {
    const result = await this.ctx.client.send(
      new GetCommand({ TableName: this.ctx.tables.teams, Key: { id } })
    );
    return (result.Item as Team | undefined) ?? undefined;
  }

  async create(input: CreateTeamInput): Promise<Team> {
    const team: Team = { id: input.id, name: input.name };
    await this.ctx.client.send(new PutCommand({ TableName: this.ctx.tables.teams, Item: team }));
    return team;
  }
}

function stripSortKey<T extends Record<string, unknown>>(item: T): Omit<T, typeof SORT_KEY> {
  const { [SORT_KEY]: _drop, ...rest } = item as T & Record<string, unknown>;
  return rest;
}
