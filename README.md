# Mini-Jira on AWS

A lightweight team task tracker built for the Software Cloud Computing 2026 course
project (Dr. John Zaki). The app runs end-to-end locally against an in-memory store
today and is wired behind service interfaces so a single env flag swaps it onto Cognito
+ DynamoDB + S3 + SNS for the AWS deployment.

The full spec lives in [`Cloud Computing Project S'26.md`](Cloud%20Computing%20Project%20S%2726.md).

## Repository layout

Three-workspace npm monorepo:

| Workspace | Stack | Purpose |
|-----------|-------|---------|
| [`shared/`](shared) | TypeScript | Single source of truth for domain types (`Task`, `User`, `Project`, …) and label maps. |
| [`server/`](server) | Express 5 + TypeScript | REST API. Every external dependency lives behind a service interface in [`server/src/services/`](server/src/services). |
| [`client/`](client) | Vite + React 19 + TypeScript | Single-page UI with custom CSS, drag-and-drop Kanban, task detail modal. |

`shared` builds first; the root `build` script enforces ordering.

## Getting started

```bash
npm install      # at repo root — hoists all three workspaces
npm run dev      # client + server in parallel
```

Local mode boots with three seeded users — sign in as **Ali** (manager), **Sara** (Frontend),
or **Omar** (Backend) via the demo login screen to walk the spec's grading scenario.

## Common scripts

```bash
npm run dev          # client + server in watch mode
npm test             # vitest (server workspace) — 116 tests across 24 files
npm run typecheck    # tsc across shared, server, client
npm run build        # shared -> server -> client
```

## Local vs AWS mode

The server is keyed on `MINI_JIRA_BACKEND`:

- **`local`** (default) — in-memory repos seeded from [`server/src/seed.ts`](server/src/seed.ts), bearer tokens from a sessions map, attachments on disk via `multer`. No AWS account required.
- **`aws`** — Cognito JWTs verified by `aws-jwt-verify`, persistence on DynamoDB, attachments on S3 with presigned PUT/GET, task-assignment events published to SNS. Required env vars are validated at boot — see [`server/src/config.ts`](server/src/config.ts).

The same `createApp(services)` runs in both modes. Implementation selection happens in
[`server/src/buildServices.ts`](server/src/buildServices.ts).

## Service interfaces

Every cross-cutting dependency has a Local impl and an AWS impl behind a small interface:

| Seam | Interface | Local | AWS |
| --- | --- | --- | --- |
| Auth | [`AuthVerifier`](server/src/services/auth.ts) | `LocalAuth` — sessions map + `demo-login` route | `CognitoAuth` — `aws-jwt-verify`, reads `custom:role` / `custom:teamId` |
| Repos | [`TaskRepo`, `ProjectRepo`, `CommentRepo`, `AuditRepo`, `UserRepo`, `TeamRepo`](server/src/services/repos.ts) | `InMemory*Repo` | `Dynamo*Repo` (`@aws-sdk/lib-dynamodb`) |
| Storage | [`AttachmentStorage`](server/src/services/storage.ts) | `LocalDiskStorage` (multer) | `S3Storage` (presigned URLs, versioned originals bucket) |
| Notifications | [`AssignmentNotifier`](server/src/services/notifications.ts) | `NoopNotifier` | `SnsNotifier` — SNS assignment event, filtered assignee email subscriptions, SQS fanout |

Route handlers never import `@aws-sdk/*` directly — they only see the interface. End-to-end
deployment notes (DynamoDB GSIs, S3 versioning, SNS message shape) live in
[`server/src/services/README.md`](server/src/services/README.md).

## Auth & team isolation

- `role: "manager" | "admin"` — bypasses team filters, sees everything.
- `role: "employee"` — bound to `user.teamId`; only sees tasks where `task.teamId === user.teamId`.

Isolation is enforced **on the server**. Every task/comment/attachment route funnels its
lookup through `getVisibleTask`, which calls `canSeeTask` from
[`server/src/auth/policy.ts`](server/src/auth/policy.ts). A Backend employee cannot fetch a
Frontend task even by guessing its ID. Frontend filters are UX only.

`POST /api/auth/demo-login` is only mounted by `LocalAuth.mountRoutes()`, so it 404s in
AWS mode (asserted by [`server/test/auth.aws.test.ts`](server/test/auth.aws.test.ts)).

## Validation, logging, errors

- **Validation** — every route body parsed by a `zod` schema from [`server/src/validation/schemas.ts`](server/src/validation/schemas.ts). Failures throw a 400 with the first issue message.
- **Logging** — structured logs via `pino` + `pino-http` ([`server/src/logger.ts`](server/src/logger.ts)). Local mode pretty-prints; AWS mode emits JSON. Every request gets a `requestId`; the auth middleware adds `userId` / `role` / `teamId` as child bindings.
- **Payload limits** — JSON body capped at 100 KB; attachments capped at 5 MB and `image/*` MIME, enforced in both upload paths.

## Attachments

Two upload paths share one route, dispatched on `storage.uploadMode`:

- **Multipart (local)** — client posts a multipart form, `multer` parses, file lands in `uploads/`.
- **Presigned (AWS)** — client `POST /api/tasks/:taskId/attachments/presign` → server returns `{ uploadUrl, key, attachmentId }`. Client PUTs the file directly to the S3 originals bucket. Client confirms with `POST /api/tasks/:taskId/attachments` and `{ attachmentId, key, fileName, mimeType, size }`; the server HEAD-checks the object before writing the row.

The client picks the path via `VITE_BACKEND=aws`. Old versions are retained: the row's
previous `active: true` attachment flips to `false`, and the S3 originals bucket has object
versioning enabled so the bytes survive overwrites.

## Tests

Vitest + Supertest under [`server/test/`](server/test). One file per resource; each new
route ships with at least one positive case and one access-denied case (404 cross-team,
403 wrong role). Service wiring (notifier, AWS-mode auth surface) gets its own regression
files. `npm test` from the repo root runs all 116 tests.

## AWS deployment

The live AWS deployment is documented in [`DEPLOYMENT.md`](DEPLOYMENT.md). It provisions
the infrastructure the app consumes: VPC across 2 AZs,
ALB + Auto Scaling Group of EC2 running this server, CloudFront, Cognito User Pool with
`custom:role` / `custom:teamId` attributes, DynamoDB tables with GSIs
(`teamId-deadline-index`, `assigneeId-deadline-index` on Tasks), S3 originals (versioned) +
resized buckets, image-resize Lambda, SNS topic + SQS + assignment-worker Lambda,
EventBridge 9 AM rule + daily-digest Lambda, and a CloudWatch dashboard with the required
widgets and alarms.

Assignment notifications use SNS fanout:

- The API publishes every `TaskAssigned` event to `mini-jira-tasks-assigned`.
- SQS receives every event and triggers `mini-jira-assignment-worker`.
- The API creates or repairs one filtered SNS email subscription per assignee email
  using the `assigneeEmail` message attribute.
- Each assignee must confirm the AWS SNS subscription email once before task-assignment
  emails are delivered to that inbox.

To pre-create/repair current assignee subscriptions before a demo:

```bash
npx ts-node scripts/sync-assignee-sns-subscriptions.ts \
  --topic-arn arn:aws:sns:us-east-1:839629614250:mini-jira-tasks-assigned \
  --users-table MiniJira_Users \
  --region us-east-1
```
