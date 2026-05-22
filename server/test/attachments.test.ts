import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type {
  AttachmentStorage,
  ConfirmInput,
  ConfirmedUpload,
  MultipartUpload,
  PresignInput,
  PresignedUpload
} from "../src/services/storage.js";
import { auth, buildServices, login, newApp, type App } from "./helpers.js";

const onePixelPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf00000003000100184d4d000000000049454e44ae426082",
  "hex"
);

describe("Attachments", () => {
  let app: App;

  beforeEach(() => {
    app = newApp();
  });

  it("uploads an image, marks it active, and replaces the previous active version", async () => {
    const sara = await login(app, "user-sara");

    const first = await request(app)
      .post("/api/tasks/task-a/attachments")
      .set("Authorization", `Bearer ${sara}`)
      .attach("file", onePixelPng, { filename: "a.png", contentType: "image/png" })
      .expect(201);
    expect(first.body.attachment.active).toBe(true);

    await request(app)
      .post("/api/tasks/task-a/attachments")
      .set("Authorization", `Bearer ${sara}`)
      .attach("file", onePixelPng, { filename: "b.png", contentType: "image/png" })
      .expect(201);

    const list = await auth(app, sara).get("/api/tasks/task-a/attachments").expect(200);
    const attachments = list.body.attachments as { fileName: string; active: boolean }[];
    expect(attachments).toHaveLength(2);
    expect(attachments.find((entry) => entry.fileName === "a.png")?.active).toBe(false);
    expect(attachments.find((entry) => entry.fileName === "b.png")?.active).toBe(true);
  });

  it("soft-deletes an attachment instead of removing it", async () => {
    const sara = await login(app, "user-sara");
    const upload = await request(app)
      .post("/api/tasks/task-a/attachments")
      .set("Authorization", `Bearer ${sara}`)
      .attach("file", onePixelPng, { filename: "c.png", contentType: "image/png" })
      .expect(201);
    const attachmentId = upload.body.attachment.id as string;

    await auth(app, sara).delete(`/api/tasks/task-a/attachments/${attachmentId}`).expect(204);

    const list = await auth(app, sara).get("/api/tasks/task-a/attachments").expect(200);
    expect(list.body.attachments.find((entry: { id: string }) => entry.id === attachmentId).active).toBe(false);
  });

  it("rejects non-image mime types", async () => {
    const sara = await login(app, "user-sara");
    await request(app)
      .post("/api/tasks/task-a/attachments")
      .set("Authorization", `Bearer ${sara}`)
      .attach("file", Buffer.from("hello"), { filename: "note.txt", contentType: "text/plain" })
      .expect(400);
  });

  it("re-signs the attachment URL on every read", async () => {
    class FakePresignedStorage implements AttachmentStorage {
      readonly uploadMode = "presigned" as const;
      private signCount = 0;
      async presignUpload(input: PresignInput): Promise<PresignedUpload> {
        const attachmentId = `attachment-${input.fileName}`;
        const key = `tasks/${input.taskId}/${attachmentId}`;
        return {
          attachmentId,
          uploadUrl: `https://fake.invalid/put/${key}`,
          key,
          publicUrl: await this.publicUrl(key)
        };
      }
      async confirm(input: ConfirmInput): Promise<ConfirmedUpload> {
        return {
          attachmentId: input.attachmentId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          size: input.size,
          key: input.key,
          url: await this.publicUrl(input.key)
        };
      }
      async consumeMultipart(): Promise<MultipartUpload> {
        throw new Error("not used");
      }
      async publicUrl(key: string): Promise<string> {
        this.signCount += 1;
        return `https://fake.invalid/get/${key}?sig=${this.signCount}`;
      }
      async softDelete(): Promise<void> {}
    }

    const services = buildServices();
    const storage = new FakePresignedStorage();
    services.storage = storage;
    const app = createApp(services);
    const sara = await login(app, "user-sara");

    const presign = await auth(app, sara)
      .post("/api/tasks/task-a/attachments/presign")
      .send({ fileName: "x.png", mimeType: "image/png", size: 10 })
      .expect(201);
    const { attachmentId, key } = presign.body.presigned as { attachmentId: string; key: string };

    await auth(app, sara)
      .post("/api/tasks/task-a/attachments")
      .send({ attachmentId, key, fileName: "x.png", mimeType: "image/png", size: 10 })
      .expect(201);

    const first = await auth(app, sara).get("/api/tasks/task-a/attachments").expect(200);
    const second = await auth(app, sara).get("/api/tasks/task-a/attachments").expect(200);
    const firstUrl = first.body.attachments[0].url as string;
    const secondUrl = second.body.attachments[0].url as string;
    expect(firstUrl).not.toEqual(secondUrl);
    expect(firstUrl).toContain(`/get/${key}?sig=`);
    expect(secondUrl).toContain(`/get/${key}?sig=`);
  });

  it("blocks cross-team employees from uploading", async () => {
    const omar = await login(app, "user-omar");
    await request(app)
      .post("/api/tasks/task-a/attachments")
      .set("Authorization", `Bearer ${omar}`)
      .attach("file", onePixelPng, { filename: "d.png", contentType: "image/png" })
      .expect(404);
  });
});
