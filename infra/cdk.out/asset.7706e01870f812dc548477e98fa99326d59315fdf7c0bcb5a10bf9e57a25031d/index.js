"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// asset-input/server/src/lambdas/image-resize.ts
var image_resize_exports = {};
__export(image_resize_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(image_resize_exports);
var import_client_s3 = require("@aws-sdk/client-s3");
var sharp = require("sharp");
var s3 = new import_client_s3.S3Client({});
var RESIZED_BUCKET = process.env.RESIZED_BUCKET;
var THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH ?? "400", 10);
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
async function handler(event) {
  for (const record of event.Records) {
    const srcBucket = record.s3.bucket.name;
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    if (srcBucket === RESIZED_BUCKET) {
      console.log("skip: event already from resized bucket", { srcKey });
      continue;
    }
    const obj = await s3.send(new import_client_s3.GetObjectCommand({ Bucket: srcBucket, Key: srcKey }));
    if (!obj.Body) {
      console.warn("no body", { srcBucket, srcKey });
      continue;
    }
    const input = await streamToBuffer(obj.Body);
    const resized = await sharp(input).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).toFormat("jpeg", { quality: 85 }).toBuffer();
    await s3.send(new import_client_s3.PutObjectCommand({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
