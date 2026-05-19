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
export type PresignAttachmentInput = z.infer<typeof presignAttachmentSchema>;
export type ConfirmAttachmentInput = z.infer<typeof confirmAttachmentSchema>;

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first ? first.message : "Invalid request body";
    const error = new Error(message) as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return result.data;
}
