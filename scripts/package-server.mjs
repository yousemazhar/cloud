#!/usr/bin/env node
/**
 * Packages the server + shared workspaces into server-bundle.tgz and uploads
 * it to the artifacts S3 bucket. Cross-platform replacement for the .ps1 version.
 *
 * Usage:
 *   AWS_PROFILE=mini-jira node scripts/package-server.mjs \
 *     --artifacts mini-jira-artifacts-839629614250
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
process.chdir(repoRoot);

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const artifactsBucket = arg("--artifacts", process.env.ARTIFACTS_BUCKET);
const profile = arg("--profile", process.env.AWS_PROFILE || "mini-jira");
const region = arg("--region", process.env.AWS_REGION || "us-east-1");
if (!artifactsBucket) {
  console.error("Missing --artifacts <bucket-name>");
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (result.status !== 0) {
    console.error(`failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status || 1);
  }
}

console.log("==> Building shared, server, client");
run("npm", ["run", "build", "-w", "shared"]);
run("npm", ["run", "build", "-w", "server"]);
run("npm", ["run", "build", "-w", "client"]);

const stage = mkdtempSync(join(tmpdir(), "mini-jira-bundle-"));
console.log(`==> Staging in ${stage}`);

// Server dist + package.json
cpSync("server/dist", join(stage, "server", "dist"), { recursive: true });
cpSync("server/package.json", join(stage, "server", "package.json"));

// Shared dist + package.json (rewritten so node can load compiled JS, not TS source)
cpSync("shared/dist", join(stage, "shared", "dist"), { recursive: true });
const sharedPkg = JSON.parse(
  (await import("node:fs")).readFileSync("shared/package.json", "utf8")
);
sharedPkg.main = "dist/index.js";
sharedPkg.types = "dist/index.d.ts";
sharedPkg.exports = {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
};
writeFileSync(join(stage, "shared", "package.json"), JSON.stringify(sharedPkg, null, 2));

// Client dist (served as static files by the Node server via express.static)
cpSync("client/dist", join(stage, "client", "dist"), { recursive: true });

// Top-level package.json declaring workspaces so `npm install --omit=dev` resolves shared@workspace
writeFileSync(join(stage, "package.json"), JSON.stringify({
  name: "mini-jira-deployed",
  private: true,
  version: "1.0.0",
  workspaces: ["server", "shared"]
}, null, 2));

if (existsSync("package-lock.json")) {
  cpSync("package-lock.json", join(stage, "package-lock.json"));
}

// Create the tarball. On Windows, create by local filename so tar does not
// misread a drive-qualified path like "P:" as a remote host.
const tarName = "server-bundle.tgz";
const tarFullPath = join(repoRoot, tarName);
if (existsSync(tarFullPath)) rmSync(tarFullPath);
console.log("==> Creating tarball");
run("tar", ["-czf", process.platform === "win32" ? tarName : tarFullPath, "-C", stage, "."]);

const size = statSync(tarFullPath).size;
console.log(`==> Bundle: ${tarFullPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);

console.log(`==> Uploading to s3://${artifactsBucket}/server-bundle.tgz`);
run("aws", ["s3", "cp", tarFullPath, `s3://${artifactsBucket}/server-bundle.tgz`,
  "--profile", profile, "--region", region]);

console.log("==> Done. To redeploy after a bundle update:");
console.log(`    aws autoscaling start-instance-refresh --auto-scaling-group-name <name> --profile ${profile} --region ${region}`);
