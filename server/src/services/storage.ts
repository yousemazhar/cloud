import type { Request, Response } from "express";

/**
 * Upload mode is decided at boot from config.backend:
 * - "multipart" → LocalDiskStorage; client posts a multipart form, multer parses.
 * - "presigned" → S3Storage; client first calls /presign, PUTs to S3, then /confirm.
 *
 * The app.ts handler dispatches on storage.uploadMode so a single route file works
 * for both paths.
 */
export type UploadMode = "multipart" | "presigned";

export interface PresignedUpload {
  attachmentId: string;
  uploadUrl: string;
  key: string;
  headers?: Record<string, string>;
  publicUrl: string;
}

export interface ConfirmedUpload {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface MultipartUpload {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  key: string;
}

export interface PresignInput {
  taskId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ConfirmInput {
  attachmentId: string;
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface AttachmentStorage {
  readonly uploadMode: UploadMode;
  /** presigned-mode only: generate an upload URL. Throws when uploadMode==="multipart". */
  presignUpload(input: PresignInput): Promise<PresignedUpload>;
  /** presigned-mode only: verify the object exists after the client PUT. */
  confirm(input: ConfirmInput): Promise<ConfirmedUpload>;
  /** multipart-mode only: consume the multer file already attached to req.file. */
  consumeMultipart(req: Request, res: Response): Promise<MultipartUpload>;
  /** Generate a fresh, possibly time-limited URL for an attachment. */
  publicUrl(key: string, req: Request): Promise<string>;
  /** Soft-delete hook. S3 originals bucket keeps versions; local impl no-ops. */
  softDelete(key: string): Promise<void>;
}
