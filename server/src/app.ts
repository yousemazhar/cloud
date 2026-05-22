import cors from "cors";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import * as path from "node:path";
import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { pinoHttp } from "pino-http";

// Polyfill globalThis.crypto.randomUUID for Node 18 (only available as global in 19+).
if (!(globalThis as any).crypto?.randomUUID) {
  (globalThis as any).crypto = { ...((globalThis as any).crypto ?? {}), randomUUID };
}
import { STATUS_LABELS, type AttachmentVersion, type Task, type User } from "@mini-jira/shared";
import { canSeeTask, canWriteTask, isAdmin, isManager } from "./auth/policy.js";
import type { AppServices } from "./services/index.js";
import { LocalDiskStorage } from "./services/local/storage.js";
import {
  changeMyPasswordSchema,
  confirmAttachmentSchema,
  createCommentSchema,
  createProjectSchema,
  createTaskSchema,
  createTeamSchema,
  createUserSchema,
  parseBody,
  patchProjectSchema,
  patchTaskSchema,
  presignAttachmentSchema,
  resetUserPasswordSchema,
  signupSchema,
  updateCommentSchema,
  updateMeSchema,
  updateUserSchema,
  updateUserTeamSchema,
  ValidationError
} from "./validation/schemas.js";
import { assertPasswordPolicy } from "./auth/password.js";
import type { Logger } from "./logger.js";

interface AuthedRequest extends Request {
  user: User;
  log: Logger;
}

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function authedRequest(req: Request): AuthedRequest {
  return req as unknown as AuthedRequest;
}

function activeAttachment(task: Task): AttachmentVersion | undefined {
  return task.attachments.find((attachment) => attachment.active);
}

export function createApp(services: AppServices) {
  const app = express();
  const { auth, tasks, projects, comments, audit, users, teams, storage, notifier, metrics, userAdmin, logger } = services;

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }) }
    })
  );
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  if (storage instanceof LocalDiskStorage) {
    app.use("/uploads", express.static(storage.uploadDir));
  }

  // Serve the React SPA build if bundled alongside the server (deployed mode).
  const clientDist = path.resolve(process.cwd(), "client", "dist");
  const indexHtmlPath = path.join(clientDist, "index.html");
  if (existsSync(indexHtmlPath)) {
    app.use(express.static(clientDist));
    // SPA fallback as a use() so Express 5 doesn't try to compile a path pattern.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
      return res.sendFile(indexHtmlPath);
    });
    logger.info({ clientDist }, "serving SPA static bundle");
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Runtime config so the SPA doesn't need build-time env vars to choose upload mode.
  app.get("/api/config", (_req, res) => {
    res.json({ uploadMode: storage.uploadMode, backend: auth.constructor.name === "CognitoAuth" ? "aws" : "local" });
  });

  // Auth verifier may register its own routes (local mode mounts /demo-login).
  auth.mountRoutes?.(app as unknown as Router);

  // Public signup: anyone can create an employee account with no team. Admins are
  // still responsible for assigning the new user to a team afterwards. Password
  // policy is enforced here so we fail fast before hitting Cognito.
  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const body = parseBody(signupSchema, req.body);
      assertPasswordPolicy(body.password);
      const user = await userAdmin.createUser({
        name: body.name,
        email: body.email,
        password: body.password,
        role: "employee",
        teamId: undefined
      });
      // Subscribe to SNS topics so the new user gets task / digest / alert emails
      // once they confirm. Failures are logged inside the notifier; never block signup.
      try {
        await notifier.subscribeUser(user.email);
      } catch (error) {
        logger.warn({ err: error, userId: user.id }, "subscribeUser failed during signup");
      }
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", async (req, _res, next) => {
    try {
      const user = await auth.authenticate(req);
      (req as AuthedRequest).user = user;
      req.log = req.log.child({ userId: user.id, role: user.role, teamId: user.teamId });
      next();
    } catch (error) {
      next(error);
    }
  });

  async function getVisibleTask(req: AuthedRequest, taskId: string): Promise<Task> {
    const task = await tasks.get(taskId);
    if (!task || !canSeeTask(req.user, task)) throw httpError(404, "Task not found");
    return task;
  }

  app.get("/api/me", (req, res) => {
    res.json({ user: authedRequest(req).user });
  });

  app.get("/api/teams", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const all = await teams.list();
      const visible = isManager(authed.user)
        ? all
        : all.filter((team) => team.id === authed.user.teamId);
      res.json({ teams: visible });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/teams", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers or admins can create teams");
      const body = parseBody(createTeamSchema, req.body);
      const team = await teams.create({ id: uid("team"), name: body.name });
      res.status(201).json({ team });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const all = await users.list();
      let visible: User[];
      if (authed.user.role === "admin") {
        visible = all;
      } else if (authed.user.role === "manager") {
        // Managers see everyone except other admins.
        visible = all.filter((user) => user.role !== "admin");
      } else {
        // Employees see teammates and themselves only — used to render assignee
        // names/avatars on cards. The UI hides the Teams & Users page for them.
        visible = all.filter(
          (user) => user.teamId === authed.user.teamId || user.id === authed.user.id
        );
      }
      res.json({ users: visible });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isAdmin(authed.user)) throw httpError(403, "Only admins can create users");
      const body = parseBody(createUserSchema, req.body);
      if (body.teamId) {
        const team = await teams.get(body.teamId);
        if (!team) throw httpError(400, "teamId is invalid");
      }
      if (body.password) assertPasswordPolicy(body.password);
      // userAdmin handles Cognito creation in AWS mode, in-memory write in local mode.
      const user = await userAdmin.createUser({
        name: body.name,
        email: body.email,
        role: body.role,
        teamId: body.teamId,
        password: body.password
      });
      try {
        await notifier.subscribeUser(user.email);
      } catch (error) {
        req.log.warn({ err: error, userId: user.id }, "subscribeUser failed on admin createUser");
      }
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/me", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const body = parseBody(updateMeSchema, req.body);
      const user = await userAdmin.updateUser(authed.user.id, { name: body.name });
      if (!user) throw httpError(404, "User not found");
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/me/password", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const body = parseBody(changeMyPasswordSchema, req.body);
      assertPasswordPolicy(body.newPassword);
      const ok = await userAdmin.verifyPassword(authed.user.email, body.currentPassword);
      if (!ok) throw httpError(400, "Current password is incorrect");
      await userAdmin.setUserPassword(authed.user.id, body.newPassword);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/users/:userId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isAdmin(authed.user)) throw httpError(403, "Only admins can update users");
      const body = parseBody(updateUserSchema, req.body);
      if (body.teamId) {
        const team = await teams.get(body.teamId);
        if (!team) throw httpError(400, "teamId is invalid");
      }
      const user = await userAdmin.updateUser(req.params.userId, {
        name: body.name,
        role: body.role,
        teamId: body.teamId === undefined ? undefined : body.teamId
      });
      if (!user) throw httpError(404, "User not found");
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/:userId/password", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isAdmin(authed.user)) throw httpError(403, "Only admins can reset user passwords");
      const body = parseBody(resetUserPasswordSchema, req.body);
      assertPasswordPolicy(body.newPassword);
      await userAdmin.setUserPassword(req.params.userId, body.newPassword);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/users/:userId/team", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isAdmin(authed.user)) throw httpError(403, "Only admins can move users between teams");
      const body = parseBody(updateUserTeamSchema, req.body);
      if (body.teamId) {
        const team = await teams.get(body.teamId);
        if (!team) throw httpError(400, "teamId is invalid");
      }
      const user = await userAdmin.updateUserTeam(req.params.userId, body.teamId);
      if (!user) throw httpError(404, "User not found");
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const all = await projects.list();
      const visible = isManager(authed.user)
        ? all
        : all.filter((project) => !project.teamId || project.teamId === authed.user.teamId);
      res.json({ projects: visible });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can create projects");
      const body = parseBody(createProjectSchema, req.body);
      const timestamp = nowIso();
      const project = await projects.create({
        id: uid("project"),
        name: body.name,
        description: body.description,
        teamId: body.teamId,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      res.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can update projects");
      const body = parseBody(patchProjectSchema, req.body);
      const project = await projects.update(req.params.projectId, {
        name: body.name,
        description: body.description,
        teamId: body.teamId === undefined ? undefined : body.teamId || null,
        updatedAt: nowIso()
      });
      if (!project) throw httpError(404, "Project not found");
      res.json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can delete projects");
      const existing = await projects.get(req.params.projectId);
      if (!existing) throw httpError(404, "Project not found");
      const taskList = await tasks.list({ projectId: req.params.projectId });
      if (taskList.length > 0) throw httpError(409, "Cannot delete a project with tasks");
      await projects.delete(req.params.projectId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const { teamId, assigneeId, projectId, priority, status } = req.query;
      const filters: Parameters<typeof tasks.list>[0] = {};
      if (isManager(authed.user)) {
        if (typeof teamId === "string" && teamId) filters.teamId = teamId;
      } else {
        if (!authed.user.teamId) {
          res.json({ tasks: [] });
          return;
        }
        filters.teamId = authed.user.teamId;
      }
      if (typeof assigneeId === "string" && assigneeId) filters.assigneeId = assigneeId;
      if (typeof projectId === "string" && projectId) filters.projectId = projectId;
      if (typeof priority === "string" && priority) filters.priority = priority;
      if (typeof status === "string" && status) filters.status = status;
      const list = await tasks.list(filters);
      const visible = list.filter((task) => canSeeTask(authed.user, task));
      res.json({ tasks: visible });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can create tasks");
      const body = parseBody(createTaskSchema, req.body);
      const team = await teams.get(body.teamId);
      if (!team) throw httpError(400, "teamId is invalid");
      const assignee = await users.get(body.assigneeId);
      if (!assignee || assignee.teamId !== body.teamId) {
        throw httpError(400, "assignee must belong to the selected team");
      }
      const project = await projects.get(body.projectId);
      if (!project) throw httpError(400, "projectId is invalid");
      const timestamp = nowIso();
      const task = await tasks.create({
        id: uid("task"),
        title: body.title,
        description: body.description,
        priority: body.priority,
        deadline: new Date(body.deadline).toISOString(),
        assigneeId: body.assigneeId,
        teamId: body.teamId,
        projectId: body.projectId,
        status: (body.status as Task["status"]) ?? "todo",
        createdAt: timestamp,
        updatedAt: timestamp
      });
      await audit.create({
        id: uid("audit"),
        taskId: task.id,
        actorId: authed.user.id,
        actorName: authed.user.name,
        type: "created",
        createdAt: timestamp
      });
      await notifier.publishAssignment(task, assignee);
      metrics.taskCreated(task.teamId);
      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      const [taskComments, taskAudit] = await Promise.all([
        comments.listForTask(task.id),
        audit.listForTask(task.id)
      ]);
      res.json({ task: { ...task, comments: taskComments, auditLogs: taskAudit } });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tasks/:taskId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
      const body = parseBody(patchTaskSchema, req.body);
      const editsDetails =
        body.title !== undefined ||
        body.description !== undefined ||
        body.priority !== undefined ||
        body.deadline !== undefined;
      if (editsDetails && !isManager(authed.user)) throw httpError(403, "Only managers can edit task details");
      const reassigns = body.teamId !== undefined || body.assigneeId !== undefined || body.projectId !== undefined;
      if (reassigns && !isManager(authed.user)) throw httpError(403, "Only managers can reassign tasks");

      let nextAssignee: User | undefined;
      let nextTeamId = task.teamId;
      let nextAssigneeId = task.assigneeId;
      let nextProjectId = task.projectId;
      if (reassigns) {
        nextTeamId = body.teamId ?? task.teamId;
        nextAssigneeId = body.assigneeId ?? task.assigneeId;
        nextProjectId = body.projectId ?? task.projectId;
        const assignee = await users.get(nextAssigneeId);
        if (!assignee || assignee.teamId !== nextTeamId) {
          throw httpError(400, "assignee must belong to the selected team");
        }
        const project = await projects.get(nextProjectId);
        if (!project) throw httpError(400, "projectId is invalid");
        nextAssignee = assignee;
      }

      const wasStatus = task.status;
      const wasAssigneeId = task.assigneeId;
      const nextStatus = (body.status as Task["status"] | undefined) ?? task.status;
      const statusChanged = body.status !== undefined && nextStatus !== wasStatus;
      const updatedAt = nowIso();
      const closedAt = statusChanged && nextStatus === "done" ? updatedAt : undefined;

      const updated = await tasks.update(task.id, {
        title: body.title,
        description: body.description,
        priority: body.priority as Task["priority"] | undefined,
        deadline: body.deadline ? new Date(body.deadline).toISOString() : undefined,
        teamId: reassigns ? nextTeamId : undefined,
        assigneeId: reassigns ? nextAssigneeId : undefined,
        projectId: reassigns ? nextProjectId : undefined,
        status: body.status as Task["status"] | undefined,
        closedAt,
        updatedAt
      });
      if (!updated) throw httpError(404, "Task not found");

      if (statusChanged) {
        await audit.create({
          id: uid("audit"),
          taskId: updated.id,
          actorId: authed.user.id,
          actorName: authed.user.name,
          type: "status_changed",
          fromStatus: wasStatus,
          toStatus: nextStatus,
          createdAt: updatedAt
        });
        if (nextStatus === "done") {
          const elapsed = new Date(updatedAt).getTime() - new Date(updated.createdAt).getTime();
          metrics.taskClosed(updated.teamId, Math.max(0, elapsed));
        }
      }
      if (reassigns && nextAssignee && wasAssigneeId !== nextAssigneeId) {
        await notifier.publishAssignment(updated, nextAssignee);
      }

      res.json({ task: updated, statusLabel: STATUS_LABELS[updated.status] });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:taskId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      if (!isManager(authed.user)) throw httpError(403, "Only managers can delete tasks");
      await tasks.delete(task.id);
      await Promise.all([comments.deleteForTask(task.id), audit.deleteForTask(task.id)]);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId/comments", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      const list = await comments.listForTask(task.id);
      res.json({ comments: list });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/comments", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      const body = parseBody(createCommentSchema, req.body);
      const comment = await comments.create({
        id: uid("comment"),
        taskId: task.id,
        authorId: authed.user.id,
        body: body.body,
        createdAt: nowIso()
      });
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  });

  // Author-or-manager can edit; team-isolation check uses the parent task.
  app.put("/api/comments/:commentId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const existing = await comments.get(req.params.commentId);
      if (!existing) throw httpError(404, "Comment not found");
      await getVisibleTask(authed, existing.taskId);
      if (existing.authorId !== authed.user.id && !isManager(authed.user)) {
        throw httpError(403, "You cannot edit this comment");
      }
      const body = parseBody(updateCommentSchema, req.body);
      const updated = await comments.update(existing.id, { body: body.body, updatedAt: nowIso() });
      if (!updated) throw httpError(404, "Comment not found");
      res.json({ comment: updated });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/comments/:commentId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const existing = await comments.get(req.params.commentId);
      if (!existing) throw httpError(404, "Comment not found");
      await getVisibleTask(authed, existing.taskId);
      if (existing.authorId !== authed.user.id && !isManager(authed.user)) {
        throw httpError(403, "You cannot delete this comment");
      }
      const removed = await comments.delete(existing.id);
      if (!removed) throw httpError(404, "Comment not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:taskId/attachments", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      res.json({ attachments: task.attachments });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/attachments/presign", async (req, res, next) => {
    try {
      if (storage.uploadMode !== "presigned") throw httpError(404, "Not found");
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
      const body = parseBody(presignAttachmentSchema, req.body);
      const presigned = await storage.presignUpload({ taskId: task.id, ...body });
      res.status(201).json({ presigned });
    } catch (error) {
      next(error);
    }
  });

  // Single attachment-create endpoint that dispatches to multipart vs presign-confirm
  // based on storage mode. Tests register multipart; AWS mode expects JSON.
  if (storage instanceof LocalDiskStorage) {
    app.post(
      "/api/tasks/:taskId/attachments",
      storage.multipartMiddleware(),
      async (req, res, next) => {
        try {
          const authed = authedRequest(req);
          const taskId = String(req.params.taskId);
          const task = await getVisibleTask(authed, taskId);
          if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
          const file = await storage.consumeMultipart(req, res);
          const current = activeAttachment(task);
          if (current) await tasks.setAttachmentActive(task.id, current.id, false);
          const attachment: AttachmentVersion = {
            id: file.attachmentId,
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size,
            url: file.url,
            uploadedAt: nowIso(),
            uploadedBy: authed.user.id,
            active: true
          };
          const updated = await tasks.addAttachment(task.id, attachment);
          res.status(201).json({ attachment, task: updated ?? task });
        } catch (error) {
          next(error);
        }
      }
    );
  } else {
    app.post("/api/tasks/:taskId/attachments", async (req, res, next) => {
      try {
        const authed = authedRequest(req);
        const task = await getVisibleTask(authed, req.params.taskId);
        if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
        const body = parseBody(confirmAttachmentSchema, req.body);
        const confirmed = await storage.confirm(body);
        const current = activeAttachment(task);
        if (current) await tasks.setAttachmentActive(task.id, current.id, false);
        const attachment: AttachmentVersion = {
          id: confirmed.attachmentId,
          fileName: confirmed.fileName,
          mimeType: confirmed.mimeType,
          size: confirmed.size,
          url: confirmed.url,
          uploadedAt: nowIso(),
          uploadedBy: authed.user.id,
          active: true
        };
        const updated = await tasks.addAttachment(task.id, attachment);
        res.status(201).json({ attachment, task: updated ?? task });
      } catch (error) {
        next(error);
      }
    });
  }

  app.delete("/api/tasks/:taskId/attachments/:attachmentId", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const task = await getVisibleTask(authed, req.params.taskId);
      if (!canWriteTask(authed.user, task)) throw httpError(403, "You cannot update this task");
      const attachment = task.attachments.find((entry) => entry.id === req.params.attachmentId);
      if (!attachment) throw httpError(404, "Attachment not found");
      await tasks.setAttachmentActive(task.id, attachment.id, false);
      await tasks.touch(task.id, nowIso());
      await storage.softDelete(attachment.url);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/team-summary", async (req, res, next) => {
    try {
      const authed = authedRequest(req);
      const allTeams = await teams.list();
      const visibleTeams = isManager(authed.user)
        ? allTeams
        : allTeams.filter((team) => team.id === authed.user.teamId);
      const summaries = await Promise.all(
        visibleTeams.map(async (team) => {
          const teamTasks = (await tasks.list({ teamId: team.id })).filter((task) =>
            canSeeTask(authed.user, task)
          );
          return {
            teamId: team.id,
            total: teamTasks.length,
            todo: teamTasks.filter((task) => task.status === "todo").length,
            inProgress: teamTasks.filter((task) => task.status === "in_progress").length,
            inReview: teamTasks.filter((task) => task.status === "in_review").length,
            done: teamTasks.filter((task) => task.status === "done").length
          };
        })
      );
      res.json({ summaries });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: Error & { status?: number; code?: string }, req: Request, res: Response, _next: NextFunction) => {
    let status = error.status ?? 500;
    if (error.code === "LIMIT_FILE_SIZE") status = 413;
    else if (error.message === "Only image uploads are allowed") status = 400;
    else if (status === 500 && !error.status && /file/i.test(error.message)) status = 400;
    const log = req.log ?? logger;
    log.warn({ err: error, status }, "request failed");
    const body: { message: string; errors?: { field: string; message: string }[] } = {
      message: error.message || "Internal server error"
    };
    if (error instanceof ValidationError) body.errors = error.errors;
    else if (Array.isArray((error as unknown as { errors?: unknown }).errors)) {
      body.errors = (error as unknown as { errors: { field: string; message: string }[] }).errors;
    }
    res.status(status).json(body);
  });

  return app;
}
