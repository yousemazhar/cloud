import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Priority, TaskStatus, User } from "@mini-jira/shared";
import { STATUS_LABELS } from "@mini-jira/shared";
import {
  activeAttachment,
  canSeeTask,
  canWriteTask,
  createStore,
  db,
  isManager,
  nowIso,
  type DataStore,
  uid
} from "./store.js";
import { NoopNotifier, type AssignmentNotifier } from "./services/notifications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "../uploads");
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image uploads are allowed"));
    cb(null, true);
  }
});
const sessions = new Map<string, string>();

interface AuthedRequest extends Request {
  user: User;
  db: DataStore;
}

const priorities: Priority[] = ["low", "medium", "high", "urgent"];
const statuses: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw httpError(400, `${field} is required`);
  }
  return value.trim();
}

function requirePriority(value: unknown): Priority {
  if (typeof value === "string" && priorities.includes(value as Priority)) return value as Priority;
  throw httpError(400, "priority is invalid");
}

function requireStatus(value: unknown): TaskStatus {
  if (typeof value === "string" && statuses.includes(value as TaskStatus)) return value as TaskStatus;
  throw httpError(400, "status is invalid");
}

function requireIsoDate(value: unknown, field: string): string {
  const raw = requireString(value, field);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) throw httpError(400, `${field} must be a valid ISO date`);
  return new Date(timestamp).toISOString();
}

function publicTaskUrl(req: Request, fileName: string): string {
  return `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
}

function authMiddleware(store: DataStore) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const userId = token ? sessions.get(token) : undefined;
    const user = userId ? store.users.find((candidate) => candidate.id === userId) : undefined;
    if (!user) return next(httpError(401, "Unauthorized"));
    (req as AuthedRequest).user = user;
    (req as AuthedRequest).db = store;
    return next();
  };
}

function authedRequest(req: Request): AuthedRequest {
  return req as unknown as AuthedRequest;
}

function getVisibleTask(req: AuthedRequest) {
  const task = req.db.tasks.find((candidate) => candidate.id === req.params.taskId);
  if (!task || !canSeeTask(req.user, task)) throw httpError(404, "Task not found");
  return task;
}

export interface AppServices {
  notifier?: AssignmentNotifier;
}

export function createApp(store: DataStore = db, services: AppServices = {}) {
  const app = express();
  const notifier: AssignmentNotifier = services.notifier ?? new NoopNotifier();

  app.use(cors());
  app.use(express.json({ limit: "100kb" }));
  app.use("/uploads", express.static(uploadDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/demo-login", (req, res, next) => {
    try {
      const userId = requireString(req.body?.userId, "userId");
      const user = store.users.find((candidate) => candidate.id === userId);
      if (!user) throw httpError(404, "Demo user not found");
      const token = uid("session");
      sessions.set(token, user.id);
      res.json({ token, user });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", authMiddleware(store));

  app.get("/api/me", (req, res) => {
    res.json({ user: authedRequest(req).user });
  });

  app.get("/api/teams", (req, res) => {
    const authed = authedRequest(req);
    res.json({ teams: isManager(authed.user) ? authed.db.teams : authed.db.teams.filter((team) => team.id === authed.user.teamId) });
  });

  app.get("/api/users", (req, res) => {
    const authed = authedRequest(req);
    const visibleUsers = isManager(authed.user)
      ? authed.db.users
      : authed.db.users.filter((user) => user.teamId === authed.user.teamId || user.id === authed.user.id);
    res.json({ users: visibleUsers });
  });

  app.get("/api/projects", (req, res) => {
    const authed = authedRequest(req);
    // Policy: projects with no teamId are company-wide and visible to everyone;
    // projects scoped to a team are only visible to that team and to managers.
    const projects = isManager(authed.user)
      ? authed.db.projects
      : authed.db.projects.filter((project) => !project.teamId || project.teamId === authed.user.teamId);
    res.json({ projects });
  });

  app.post("/api/projects", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can create projects");
      const timestamp = nowIso();
      const project = {
        id: uid("project"),
        name: requireString(req.body?.name, "name"),
        description: requireString(req.body?.description, "description"),
        teamId: typeof req.body?.teamId === "string" && req.body.teamId ? req.body.teamId : undefined,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      authed.db.projects.unshift(project);
      res.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectId", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can update projects");
      const project = authed.db.projects.find((candidate) => candidate.id === req.params.projectId);
      if (!project) throw httpError(404, "Project not found");
      if (req.body?.name !== undefined) project.name = requireString(req.body.name, "name");
      if (req.body?.description !== undefined) project.description = requireString(req.body.description, "description");
      if (req.body?.teamId !== undefined) project.teamId = req.body.teamId || undefined;
      project.updatedAt = nowIso();
      res.json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can delete projects");
      if (authed.db.tasks.some((task) => task.projectId === req.params.projectId)) {
        throw httpError(409, "Cannot delete a project with tasks");
      }
      authed.db.projects = authed.db.projects.filter((project) => project.id !== req.params.projectId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks", (req, res) => {
    const authed = authedRequest(req);
    let tasks = authed.db.tasks.filter((task) => canSeeTask(authed.user, task));
    const { teamId, assigneeId, projectId, priority, status } = req.query;
    if (isManager(authed.user) && typeof teamId === "string" && teamId) tasks = tasks.filter((task) => task.teamId === teamId);
    if (typeof assigneeId === "string" && assigneeId) tasks = tasks.filter((task) => task.assigneeId === assigneeId);
    if (typeof projectId === "string" && projectId) tasks = tasks.filter((task) => task.projectId === projectId);
    if (typeof priority === "string" && priority) tasks = tasks.filter((task) => task.priority === priority);
    if (typeof status === "string" && status) tasks = tasks.filter((task) => task.status === status);
    res.json({ tasks });
  });

  app.post("/api/tasks", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can create tasks");
      const teamId = requireString(req.body?.teamId, "teamId");
      const assigneeId = requireString(req.body?.assigneeId, "assigneeId");
      const projectId = requireString(req.body?.projectId, "projectId");
      if (!authed.db.teams.some((team) => team.id === teamId)) throw httpError(400, "teamId is invalid");
      const assignee = authed.db.users.find((user) => user.id === assigneeId && user.teamId === teamId);
      if (!assignee) throw httpError(400, "assignee must belong to the selected team");
      if (!authed.db.projects.some((project) => project.id === projectId)) throw httpError(400, "projectId is invalid");
      const timestamp = nowIso();
      const task = {
        id: uid("task"),
        title: requireString(req.body?.title, "title"),
        description: requireString(req.body?.description, "description"),
        priority: requirePriority(req.body?.priority),
        deadline: requireIsoDate(req.body?.deadline, "deadline"),
        assigneeId,
        teamId,
        projectId,
        status: req.body?.status ? requireStatus(req.body.status) : "todo",
        attachments: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      authed.db.tasks.unshift(task);
      void notifier.publishAssignment(task, assignee);
      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      res.json({
        task: {
          ...task,
          comments: authed.db.comments.filter((comment) => comment.taskId === task.id),
          auditLogs: authed.db.auditLogs.filter((entry) => entry.taskId === task.id)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tasks/:taskId", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
      const wasStatus = task.status;
      if (req.body?.title !== undefined) {
        if (!isManager(authed.user)) throw httpError(403, "Only managers can edit task details");
        task.title = requireString(req.body.title, "title");
      }
      if (req.body?.description !== undefined) {
        if (!isManager(authed.user)) throw httpError(403, "Only managers can edit task details");
        task.description = requireString(req.body.description, "description");
      }
      if (req.body?.priority !== undefined) {
        if (!isManager(authed.user)) throw httpError(403, "Only managers can edit task details");
        task.priority = requirePriority(req.body.priority);
      }
      if (req.body?.deadline !== undefined) {
        if (!isManager(authed.user)) throw httpError(403, "Only managers can edit task details");
        task.deadline = requireIsoDate(req.body.deadline, "deadline");
      }
      if (req.body?.teamId !== undefined || req.body?.assigneeId !== undefined || req.body?.projectId !== undefined) {
        if (!isManager(authed.user)) throw httpError(403, "Only managers can reassign tasks");
        const teamId = req.body?.teamId ? requireString(req.body.teamId, "teamId") : task.teamId;
        const assigneeId = req.body?.assigneeId ? requireString(req.body.assigneeId, "assigneeId") : task.assigneeId;
        const projectId = req.body?.projectId ? requireString(req.body.projectId, "projectId") : task.projectId;
        const assignee = authed.db.users.find((user) => user.id === assigneeId && user.teamId === teamId);
        if (!assignee) throw httpError(400, "assignee must belong to the selected team");
        if (!authed.db.projects.some((project) => project.id === projectId)) throw httpError(400, "projectId is invalid");
        const reassigned = task.assigneeId !== assigneeId;
        task.teamId = teamId;
        task.assigneeId = assigneeId;
        task.projectId = projectId;
        if (reassigned) void notifier.publishAssignment(task, assignee);
      }
      if (req.body?.status !== undefined) {
        const nextStatus = requireStatus(req.body.status);
        task.status = nextStatus;
        if (wasStatus !== nextStatus) {
          authed.db.auditLogs.unshift({
            id: uid("audit"),
            taskId: task.id,
            actorId: authed.user.id,
            fromStatus: wasStatus,
            toStatus: nextStatus,
            createdAt: nowIso()
          });
          if (nextStatus === "done") task.closedAt = nowIso();
        }
      }
      task.updatedAt = nowIso();
      res.json({ task, statusLabel: STATUS_LABELS[task.status] });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:taskId", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can delete tasks");
      authed.db.tasks = authed.db.tasks.filter((candidate) => candidate.id !== task.id);
      authed.db.comments = authed.db.comments.filter((comment) => comment.taskId !== task.id);
      authed.db.auditLogs = authed.db.auditLogs.filter((entry) => entry.taskId !== task.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId/comments", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      res.json({ comments: authed.db.comments.filter((comment) => comment.taskId === task.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/comments", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      const comment = {
        id: uid("comment"),
        taskId: task.id,
        authorId: authed.user.id,
        body: requireString(req.body?.body, "body"),
        createdAt: nowIso()
      };
      authed.db.comments.push(comment);
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId/attachments", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      res.json({ attachments: task.attachments });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/attachments", upload.single("file"), (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
      if (!req.file) throw httpError(400, "file is required");
      const current = activeAttachment(task);
      if (current) current.active = false;
      const attachment = {
        id: uid("attachment"),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: publicTaskUrl(req, req.file.filename),
        uploadedAt: nowIso(),
        uploadedBy: authed.user.id,
        active: true
      };
      task.attachments.unshift(attachment);
      task.updatedAt = nowIso();
      res.status(201).json({ attachment, task });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:taskId/attachments/:attachmentId", (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = getVisibleTask(authed);
      if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
      const attachment = task.attachments.find((candidate) => candidate.id === req.params.attachmentId);
      if (!attachment) throw httpError(404, "Attachment not found");
      attachment.active = false;
      task.updatedAt = nowIso();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/team-summary", (req, res) => {
    const authed = authedRequest(req);
    const visibleTeams = isManager(authed.user) ? authed.db.teams : authed.db.teams.filter((team) => team.id === authed.user.teamId);
    const summaries = visibleTeams.map((team) => {
      const tasks = authed.db.tasks.filter((task) => task.teamId === team.id && canSeeTask(authed.user, task));
      return {
        teamId: team.id,
        total: tasks.length,
        todo: tasks.filter((task) => task.status === "todo").length,
        inProgress: tasks.filter((task) => task.status === "in_progress").length,
        inReview: tasks.filter((task) => task.status === "in_review").length,
        done: tasks.filter((task) => task.status === "done").length
      };
    });
    res.json({ summaries });
  });

  app.use((error: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    let status = error.status ?? 500;
    if (error.code === "LIMIT_FILE_SIZE") status = 413;
    else if (error.message === "Only image uploads are allowed") status = 400;
    else if (status === 500 && !error.status) {
      // Multer fileFilter errors arrive without a status field
      if (/file/i.test(error.message)) status = 400;
    }
    res.status(status).json({ message: error.message || "Internal server error" });
  });

  return app;
}

export { createStore };
