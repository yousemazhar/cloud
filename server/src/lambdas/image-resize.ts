import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3Event } from "aws-lambda";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

/**
 * S3 PUT event on the originals bucket -> write a {THUMB_WIDTH}px-wide thumbnail
 * to RESIZED_BUCKET under the same key. Old originals are preserved by S3 versioning.
 */

const s3 = new S3Client({});
const RESIZED_BUCKET = process.env.RESIZED_BUCKET!;
const THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH ?? "400", 10);

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const srcBucket = record.s3.bucket.name;
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (srcBucket === RESIZED_BUCKET) {
      console.log("skip: event already from resized bucket", { srcKey });
      continue;
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: srcBucket, Key: srcKey }));
    if (!obj.Body) {
      console.warn("no body", { srcBucket, srcKey });
      continue;
    }

    const input = await streamToBuffer(obj.Body as NodeJS.ReadableStream);
    const resized = await sharp(input)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .toFormat("jpeg", { quality: 85 })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: RESIZED_BUCKET,
      Key: srcKey,
      Body: resized,
      ContentType: "image/jpeg",
      Metadata: {
        "source-bucket": srcBucket,
        "source-key": srcKey,
        "resized-width": String(THUMB_WIDTH)
      }
    }));

    console.log("resized", { srcBucket, srcKey, bytesIn: input.length, bytesOut: resized.length });
  }
}
