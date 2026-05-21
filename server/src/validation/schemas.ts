import { z } from "zod";
import { TASK_STATUSES } from "@mini-jira/shared";

const trimmedString = (field: string) =>
  z
    .string({ message: `${field} is required` })
    .trim()
    .min(1, `${field} is required`);

const isoDate = (field: string) =>
  trimmedString(field).refine((value) => Number.isFinite(Date.parse(value)), `${field} must be a valid ISO date`);

export const prioritySchema = z.enum(["low", "medium", "high", "urgent"], { message: "priority is invalid" });
export const statusSchema = z.enum(TASK_STATUSES as [string, ...string[]], { message: "status is invalid" });

export const demoLoginSchema = z.object({
  userId: trimmedString("userId")
});

export const createProjectSchema = z.object({
  name: trimmedString("name"),
  description: trimmedString("description"),
  teamId: z.string().trim().min(1).optional()
});

export const patchProjectSchema = z
  .object({
    name: trimmedString("name").optional(),
    description: trimmedString("description").optional(),
    teamId: z.string().trim().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field is required");

export const createTaskSchema = z.object({
  title: trimmedString("title"),
  description: trimmedString("description"),
  priority: prioritySchema,
  deadline: isoDate("deadline"),
  teamId: trimmedString("teamId"),
  assigneeId: trimmedString("assigneeId"),
  projectId: trimmedString("projectId"),
  status: statusSchema.optional()
});

export const patchTaskSchema = z
  .object({
    title: trimmedString("title").optional(),
    description: trimmedString("description").optional(),
    priority: prioritySchema.optional(),
    deadline: isoDate("deadline").optional(),
    teamId: trimmedString("teamId").optional(),
    assigneeId: trimmedString("assigneeId").optional(),
    projectId: trimmedString("projectId").optional(),
    status: statusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field is required");

export const createCommentSchema = z.object({
  body: trimmedString("body")
});

export const updateCommentSchema = z.object({
  body: trimmedString("body")
});

export const createTeamSchema = z.object({
  name: trimmedString("name")
});

export const roleSchema = z.enum(["manager", "employee", "admin"], { message: "role is invalid" });

export const createUserSchema = z.object({
  name: trimmedString("name"),
  email: trimmedString("email").refine((v) => /.+@.+\..+/.test(v), "email is invalid"),
  role: roleSchema,
  teamId: z.string().trim().min(1).optional(),
  // Required by Cognito (AWS mode); optional in local mode.
  password: z.string().min(8, "password must be at least 8 characters").optional()
});

export const updateUserTeamSchema = z.object({
  teamId: z.string().trim().nullable()
});

export const signupSchema = z.object({
  name: trimmedString("name"),
  email: trimmedString("email").refine((v) => /.+@.+\..+/.test(v), "email is invalid"),
  password: trimmedString("password")
});

export const updateMeSchema = z
  .object({
    name: trimmedString("name").optional()
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field is required");

export const updateUserSchema = z
  .object({
    name: trimmedString("name").optional(),
    role: roleSchema.optional(),
    teamId: z.string().trim().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field is required");

export const changeMyPasswordSchema = z.object({
  currentPassword: trimmedString("currentPassword"),
  newPassword: trimmedString("newPassword")
});

export const resetUserPasswordSchema = z.object({
  newPassword: trimmedString("newPassword")
});

export const presignAttachmentSchema = z.object({
  fileName: trimmedString("fileName"),
  mimeType: trimmedString("mimeType").refine((value) => value.startsWith("image/"), "Only image uploads are allowed"),
  size: z
    .number({ message: "size is required" })
    .int("size must be an integer")
    .positive("size must be positive")
    .max(5 * 1024 * 1024, "file too large")
});

export const confirmAttachmentSchema = z.object({
  attachmentId: trimmedString("attachmentId"),
  key: trimmedString("key"),
  fileName: trimmedString("fileName"),
  mimeType: trimmedString("mimeType"),
  size: z.number().int().positive()
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserTeamInput = z.infer<typeof updateUserTeamSchema>;
export type PresignAttachmentInput = z.infer<typeof presignAttachmentSchema>;
export type ConfirmAttachmentInput = z.infer<typeof confirmAttachmentSchema>;

export interface FieldError {
  field: string;
  message: string;
}

export class ValidationError extends Error {
  status = 400;
  errors: FieldError[];
  constructor(errors: FieldError[]) {
    super(errors[0]?.message ?? "Invalid request body");
    this.errors = errors;
  }
}

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join(".") : "_root",
      message: issue.message
    }));
    if (errors.length === 0) errors.push({ field: "_root", message: "Invalid request body" });
    throw new ValidationError(errors);
  }
  return result.data;
}
