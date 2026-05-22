# Mini-Jira on AWS

A lightweight team task tracker built for the Software Cloud Computing 2026 course
project (Dr. John Zaki). The app runs end-to-end locally against an in-memory store
today and is wired behind service interfaces so a single env flag swaps it onto Cognito
+ DynamoDB + S3 + SNS for the AWS deployment.

The full spec lives in [`Cloud Computing Project S'26.md`](Cloud%20Computing%20Project%20S%2726.md).

## Submission links

- **Live web app (CloudFront):** <https://d2r9r2l6xg406y.cloudfront.net/>
- **Architecture diagram (Lucidchart, AWS 2024 icons):** <https://lucid.app/lucidchart/edeb630b-f41c-47a4-9ac5-03a005b86f81/edit?invitationId=inv_311351d4-8a87-4323-865d-eb098a9d7816>
- **Demo video:** <https://drive.google.com/file/d/1ucmXCX7bRXMyN00QVbDdQJc1id28wIni/view?usp=sharing>

## Demo accounts on Cognito (password MiniJira#2026 for all): 
- ali@minijira.test — manager (all teams) 
- sara@minijira.test — employee (Frontend) 
- omar@minijira.test — employee (Backend) 
- jess@minijira.test — admin 
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
npm test             # vitest (server workspace) — 163 tests across 32 files
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
files. `npm test` from the repo root runs all 163 tests.

## AWS deployment

Live deployment: **<https://d2r9r2l6xg406y.cloudfront.net/>** (region `us-east-1`,
account `839629614250`). Eight CDK stacks under [`infra/lib/`](infra/lib) — `MiniJira-Network`,
`-Data`, `-Auth`, `-Messaging`, `-Lambdas`, `-Compute`, `-Edge`, `-Observability`. Full
provisioning + rollout steps live in [`DEPLOYMENT.md`](DEPLOYMENT.md). The infrastructure
the app consumes:

- **VPC** `10.20.0.0/16` across 2 AZs (`us-east-1a`, `us-east-1b`); public subnets for the
  ALB, private subnets (with egress via a single NAT) for the EC2 ASG.
- **ALB + Auto Scaling Group** — internet-facing ALB on `:80` with health check
  `GET /api/health`; ASG of `t3.micro` running this server (min 2 / max 4 / desired 2,
  one instance per AZ).
- **CloudFront** in front of the ALB, HTTPS-redirecting, `/assets/*` cached.
- **Cognito** User Pool `mini-jira-users` with `custom:role` / `custom:teamId` attributes.
- **DynamoDB** — six tables (`MiniJira_Tasks` + GSIs `teamId-deadline-index`,
  `assigneeId-deadline-index`; `MiniJira_Projects` + `teamId-index`; `MiniJira_Comments`;
  `MiniJira_AuditLogs`; `MiniJira_Users` + `email-index`; `MiniJira_Teams`), on-demand.
- **S3** — originals (versioned), resized (30-day TTL), web (React build), artifacts
  (server bundle).
- **Lambdas** — `mini-jira-image-resize` (S3 PUT → 400 px thumbnail with `sharp`),
  `mini-jira-assignment-worker` (SQS → audit log + CloudWatch metric),
  `mini-jira-daily-digest` (EventBridge cron → scan tasks → SNS).
- **SNS** — `mini-jira-tasks-assigned` (filtered-email fan-out + SQS subscription),
  `mini-jira-daily-digest`, `mini-jira-alerts`.
- **SQS** — `mini-jira-assignment-events` (`visibilityTimeout` 60 s, 4-day retention) with
  a DLQ `mini-jira-assignment-events-dlq` (14-day retention, `maxReceiveCount` 5).
- **EventBridge** rule `mini-jira-daily-9am-gmt3` (`cron(0 6 * * ? *)` UTC ≡ 09:00 GMT+3)
  → `mini-jira-daily-digest`.
- **CloudWatch** — dashboard `MiniJira-Main` (TasksCreated, TasksClosed per team,
  TaskTimeToCloseMs, EC2 CPU, OverdueTasks) and alarm `MiniJira-OverdueTasks-GT5` that
  publishes to `mini-jira-alerts`. Both Lambda `cloudwatch:PutMetricData` grants are
  scoped via a `cloudwatch:namespace = MiniJira` condition.

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
