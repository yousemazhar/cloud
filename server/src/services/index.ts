import type {
  AuditRepo,
  CommentRepo,
  ProjectRepo,
  TaskRepo,
  TeamRepo,
  UserRepo
} from "./repos.js";
import type { AuthVerifier } from "./auth.js";
import type { AttachmentStorage } from "./storage.js";
import type { AssignmentNotifier } from "./notifications.js";
import type { MetricsEmitter } from "./metrics.js";
import type { UserAdmin } from "./user-admin.js";
import type { Logger } from "../logger.js";

export interface AppServices {
  auth: AuthVerifier;
  tasks: TaskRepo;
  projects: ProjectRepo;
  comments: CommentRepo;
  audit: AuditRepo;
  users: UserRepo;
  teams: TeamRepo;
  storage: AttachmentStorage;
  notifier: AssignmentNotifier;
  metrics: MetricsEmitter;
  userAdmin: UserAdmin;
  logger: Logger;
}
