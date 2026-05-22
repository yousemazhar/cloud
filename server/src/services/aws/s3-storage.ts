import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Request, Response } from "express";
import type {
  AttachmentStorage,
  ConfirmInput,
  ConfirmedUpload,
  MultipartUpload,
  PresignInput,
  PresignedUpload,
  UploadMode
} from "../storage.js";

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

const PUT_TTL_SECONDS = 60 * 5;
const GET_TTL_SECONDS = 60 * 5;

export interface S3StorageConfig {
  client: S3Client;
  originalsBucket: string;
}

/**
 * S3Storage uses the presigned-URL flow described in services/README.md:
 *   1. POST /presign -> { uploadUrl, key, attachmentId }
 *   2. Client PUTs the file directly to S3 originals bucket (versioning enabled).
 *   3. POST /attachments -> server HEADs the object then writes the row.
 * Old versions are retained by S3 object versioning, not application-level flags.
 */
export class S3Storage implements AttachmentStorage {
  readonly uploadMode: UploadMode = "presigned";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.client = config.client;
    this.bucket = config.originalsBucket;
  }

  async presignUpload(input: PresignInput): Promise<PresignedUpload> {
    if (!input.mimeType.startsWith("image/")) throw httpError(400, "Only image uploads are allowed");
    const attachmentId = `attachment-${crypto.randomUUID()}`;
    const safeName = input.fileName.replace(/[^A-Za-z0-9._-]+/g, "_");
    const key = `tasks/${input.taskId}/${attachmentId}-${safeName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.mimeType,
      ContentLength: input.size
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: PUT_TTL_SECONDS });
    const publicUrl = await this.signGet(key);
    return {
      attachmentId,
      uploadUrl,
      key,
      headers: { "Content-Type": input.mimeType },
      publicUrl
    };
  }

  async confirm(input: ConfirmInput): Promise<ConfirmedUpload> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }));
    } catch {
      throw httpError(400, "Uploaded object was not found in S3");
    }
    const url = await this.signGet(input.key);
    return {
      attachmentId: input.attachmentId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      url,
      key: input.key
    };
  }

  async consumeMultipart(_req: Request, _res: Response): Promise<MultipartUpload> {
    throw httpError(400, "Multipart uploads are not available in AWS mode");
  }

  async publicUrl(key: string, _req: Request): Promise<string> {
    return this.signGet(key);
  }

  async softDelete(_key: string): Promise<void> {
    // No-op: S3 object versioning retains prior versions; the row's active=false is
    // enough to mark a logical deletion.
  }

  private async signGet(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: GET_TTL_SECONDS
    });
  }
}
