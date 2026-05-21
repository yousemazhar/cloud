# Mini-Jira on AWS — project conventions

Course project for Software Cloud Computing 2026 (Dr. John Zaki). Spec lives in
[`Cloud Computing Project S'26.md`](Cloud Computing Project S'26.md). Deadline **2026-05-22**.

## Project shape

Three-workspace npm monorepo:

- `shared/` — pure TypeScript types and label maps. The single source of truth for domain shapes (`Task`, `User`, `Project`, etc.). **Never** redefine these types in `client/` or `server/` — import from `@mini-jira/shared`.
- `server/` — Express 5 + TypeScript API. All external dependencies (auth, persistence, storage, notifications) live behind interfaces in [`server/src/services/`](server/src/services); local mode uses in-memory + disk impls so the spec demo runs without AWS, AWS mode swaps in Cognito / DynamoDB / S3 / SNS via `MINI_JIRA_BACKEND=aws`.
- `client/` — Vite + React 19 + TypeScript. Single-page app, custom CSS (no Tailwind).

`shared` builds first; the root `build` script handles ordering. If types changed in `shared/`, run `npm run build -w shared` before re-running the server type-check.

## Commands

```
npm install            # at repo root, hoists all workspaces
npm run dev            # client + server in parallel
npm test               # vitest in server workspace
npm run typecheck      # all three workspaces
npm run build          # shared -> server -> client
```

## The load-bearing rule: server-side team isolation

The spec is explicit: an employee on the Backend team must not be able to fetch a Frontend
task even by guessing its ID. Every task/comment/attachment route in [`server/src/app.ts`](server/src/app.ts)
**must** funnel its task lookup through `getVisibleTask` (which calls `canSeeTask`). Never
filter only in the React layer — the spec demo (Sara/Omar/Ali) is graded against the API.

When you add a new route that touches a task: read it via `getVisibleTask`, check
`canWriteTask` before mutating, and check `isManager` for manager-only operations. These
helpers live in [`server/src/auth/policy.ts`](server/src/auth/policy.ts) and are role-only —
the repos themselves are role-agnostic.

## Auth model

- `role: "manager" | "admin"` → bypasses team filters, sees everything.
- `role: "employee"` → bound to `user.teamId`; sees only tasks where `task.teamId === user.teamId`.
- **Local mode** uses `POST /api/auth/demo-login` with a seeded `userId` and an in-memory bearer token. The route is mounted by `LocalAuth.mountRoutes()` only — **do not remove it**, the spec's demo day script depends on it.
- **AWS mode** (`MINI_JIRA_BACKEND=aws`) instantiates `CognitoAuth`, which verifies a Cognito ID token via `aws-jwt-verify` and reads `sub`, `email`, `name`, `custom:role`, `custom:teamId` from the claims. `CognitoAuth` intentionally does **not** mount `demo-login`, so it 404s in AWS mode (asserted by [`server/test/auth.aws.test.ts`](server/test/auth.aws.test.ts)).

## Service abstraction (AWS seams)

Every external dependency lives behind an interface in [`server/src/services/`](server/src/services).
Both Local and AWS impls exist today for all four seams:

| Seam | Interface | Local impl | AWS impl |
| --- | --- | --- | --- |
| Auth | [`AuthVerifier`](server/src/services/auth.ts) | `LocalAuth` (sessions map + demo-login) | `CognitoAuth` (`aws-jwt-verify`) |
| Repos | [`TaskRepo` / `ProjectRepo` / `CommentRepo` / `AuditRepo` / `UserRepo` / `TeamRepo`](server/src/services/repos.ts) | `InMemory*Repo` (seed-cloned per app) | `Dynamo*Repo` (`@aws-sdk/lib-dynamodb`) |
| Storage | [`AttachmentStorage`](server/src/services/storage.ts) | `LocalDiskStorage` (multer + `/uploads`) | `S3Storage` (presigned PUT/GET) |
| Notifications | [`AssignmentNotifier`](server/src/services/notifications.ts) | `NoopNotifier` (logs via pino) | `SnsNotifier` (publishes JSON to topic ARN) |

Wiring lives in [`server/src/buildServices.ts`](server/src/buildServices.ts) — `buildServices(config)`
returns the right `AppServices` bag based on `loadConfig().backend`. [`server/src/index.ts`](server/src/index.ts)
just calls `createApp(buildServices(config))`. The test helpers call `buildLocalServices()`
for the same reason, so tests always exercise the same wiring path as the entry point.

**Rules when adding a new seam:**

1. Define the interface in `server/src/services/<name>.ts`.
2. Add a `Local<Name>` under `server/src/services/local/` and an `Aws<Name>` under `server/src/services/aws/`.
3. Extend `AppServices` in [`server/src/services/index.ts`](server/src/services/index.ts) and wire both branches in `buildServices.ts`.
4. **Never** import `@aws-sdk/*` directly from a route handler — always go through a service.

End-to-end deployment notes (DynamoDB table layout, S3 versioning, SNS message shape) are in
[`server/src/services/README.md`](server/src/services/README.md).

## Validation

Request bodies are validated with **zod** schemas in
[`server/src/validation/schemas.ts`](server/src/validation/schemas.ts). Every route calls
`parseBody(schema, req.body)`, which throws a 400 with the first issue message. **Never**
sprinkle ad-hoc `typeof` checks across handlers — add or extend a schema instead.

Payload limits enforced at the boundary:
- JSON body capped at 100 KB (`express.json({ limit: "100kb" })`).
- Multipart uploads capped at 5 MB and `image/*` MIME (multer fileFilter in `LocalDiskStorage`).
- Presigned uploads validate `size <= 5 MB` and `mimeType` startsWith `image/` in `presignAttachmentSchema`.

## Logging

Structured logging via **pino** + **pino-http** ([`server/src/logger.ts`](server/src/logger.ts)).
Local mode uses `pino-pretty` for readable dev output; AWS mode emits JSON so CloudWatch Logs
can parse fields directly. Every request gets a `requestId`; the auth middleware adds
`userId`, `role`, `teamId` as child-logger bindings. **Never use `console.log`** — use
`req.log` inside a handler, `logger` at startup, or the service's injected logger.

## Attachments

Two upload paths share the same `POST /api/tasks/:taskId/attachments` route; the handler
dispatches on `storage.uploadMode`:

- **`multipart`** (local) — multer parses the file, writes to `uploads/`, returns the URL.
- **`presigned`** (AWS) — client first calls `POST /api/tasks/:taskId/attachments/presign` to get a presigned S3 PUT URL + `attachmentId`, uploads directly to the originals bucket, then calls the create route with `{ attachmentId, key, fileName, mimeType, size }`. The server HEAD-checks the object before writing the row.

Old attachment versions are retained: `active: false` flips on the previous version in the
row, and S3 originals bucket has object versioning enabled (so even overwrites preserve the
prior bytes). The client picks the upload path via `VITE_BACKEND=aws`.

## Tests

Vitest + Supertest, in [`server/test/`](server/test). Conventions:

- One file per resource (`tasks.crud.test.ts`, `projects.test.ts`, `comments.test.ts`, `attachments.test.ts`, `access.test.ts`, `auth.test.ts`), plus `services.notifier.test.ts` and `auth.aws.test.ts` for cross-cutting service wiring.
- Shared `buildServices()` / `newApp()` / `login()` / `auth()` helpers in [`test/helpers.ts`](server/test/helpers.ts). `newApp()` returns a fresh `AppServices` bag per call, so tests never share state.
- **Every new route gets at least one positive case and one access-denied case** (404 on cross-team, 403 on wrong role).
- When wiring a new service or notifier, write a regression test that **captures** the call by passing a fake into `services` before `createApp(services)` — see `CapturingNotifier` in `services.notifier.test.ts`.
- Run `npm test` before declaring a change done. Don't push red.

## What NOT to do

- **Do not reintroduce mock auth in AWS mode.** `LocalAuth` is the only thing that mounts `demo-login`; `CognitoAuth` deliberately omits `mountRoutes`.
- **Do not store images as base64 inside DynamoDB.** Originals go to S3 (versioned), the row keeps the S3 key and a presigned GET URL with short TTL.
- **Do not bypass `getVisibleTask`.** Even a "small read endpoint" needs the visibility check.
- **Do not put role checks only in React.** The frontend is untrusted; the API is the boundary.
- **Do not remove old attachment versions.** Soft-delete only (`active: false`) — S3 versioning enforces retention on the bytes.
- **Do not import `@aws-sdk/*` from a route handler.** Go through a service.
- **Do not call `console.log` in committed code.** Use the pino logger.
- **Do not assume `task` is immutable after `tasks.update(...)`.** The in-memory repo returns the live reference and mutates in place — if you need the pre-update value (e.g. to compare `wasAssigneeId` for notifier dispatch), capture it before the update call.
- **Do not terminate AWS resources after submission.** The spec is explicit: stop, don't terminate.

## Spec-driven deployment checklist (out of scope for app commits)

The deployment workstream provisions: VPC + public/private subnets across 2 AZs, ALB, ASG of EC2
running this server, CloudFront in front of the ALB, Cognito User Pool (with `custom:role` /
`custom:teamId` attributes), DynamoDB tables + GSIs (`teamId-deadline-index`,
`assigneeId-deadline-index` on Tasks), S3 originals (versioned) + resized buckets, image-resize
Lambda, SNS topic + SQS + assignment-worker Lambda, EventBridge 9 AM rule + daily-digest Lambda,
CloudWatch dashboard + alarms. The app code in this repo is the producer side; those resources
consume from it. When infra exists, exercise the AWS impls end-to-end with a smoke-test script
(`scripts/smoke-aws.ts` — TBD) before pointing the ALB at the new build.
