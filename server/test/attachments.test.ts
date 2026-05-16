import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { auth, login, newApp, type App } from "./helpers.js";

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

  it("blocks cross-team employees from uploading", async () => {
    const omar = await login(app, "user-omar");
    await request(app)
      .post("/api/tasks/task-a/attachments")
      .set("Authorization", `Bearer ${omar}`)
      .attach("file", onePixelPng, { filename: "d.png", contentType: "image/png" })
      .expect(404);
  });
});
