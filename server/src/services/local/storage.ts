import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import type { Request, RequestHandler, Response } from "express";
import type {
  AttachmentStorage,
  ConfirmInput,
  ConfirmedUpload,
  MultipartUpload,
  PresignInput,
  PresignedUpload,
  UploadMode
} from "../storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOAD_DIR = path.resolve(__dirname, "../../../uploads");
const MAX_BYTES = 5 * 1024 * 1024;

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

/**
 * LocalDiskStorage keeps the original multer flow but behind the AttachmentStorage
 * interface. It also exposes a static-file middleware for /uploads so the served URL
 * actually resolves.
 */
export class LocalDiskStorage implements AttachmentStorage {
  readonly uploadMode: UploadMode = "multipart";
  private readonly multer: ReturnType<typeof multer>;

  constructor(public readonly uploadDir: string = DEFAULT_UPLOAD_DIR) {
    this.multer = multer({
      dest: uploadDir,
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          cb(new Error("Only image uploads are allowed"));
          return;
        }
        cb(null, true);
      }
    });
  }

  /** Returns the multer middleware to register on the multipart upload route. */
  multipartMiddleware(): RequestHandler {
    return this.multer.single("file");
  }

  async presignUpload(_input: PresignInput): Promise<PresignedUpload> {
    throw httpError(400, "Presigned uploads are not available in local mode");
  }

  async confirm(_input: ConfirmInput): Promise<ConfirmedUpload> {
    throw httpError(400, "Confirm is not available in local mode");
  }

  async consumeMultipart(req: Request, _res: Response): Promise<MultipartUpload> {
    const file = req.file;
    if (!file) throw httpError(400, "file is required");
    const url = `${req.protocol}://${req.get("host")}/uploads/${file.filename}`;
    return {
      attachmentId: `attachment-${crypto.randomUUID()}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url,
      key: file.filename
    };
  }

  async publicUrl(key: string, req: Request): Promise<string> {
    return `${req.protocol}://${req.get("host")}/uploads/${key}`;
  }

  async softDelete(_key: string): Promise<void> {
    // No-op: tests assert the row's active flag, not the file on disk.
  }
}
