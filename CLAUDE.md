# Mini-Jira on AWS — project conventions

Course project for Software Cloud Computing 2026 (Dr. John Zaki). Spec lives in
[`Cloud Computing Project S'26.md`](Cloud Computing Project S'26.md). Deadline **2026-05-22**.

## Project shape

Three-workspace npm monorepo:

- `shared/` — pure TypeScript types and label maps. The single source of truth for domain shapes (`Task`, `User`, `Project`, etc.). **Never** redefine these types in `client/` or `server/` — import from `@mini-jira/shared`.
- `server/` — Express 5 + TypeScript API. Today it's backed by an in-memory store (`src/store.ts`) so the spec demo runs without AWS.
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
task even by guessing its ID. Every task/comment/attachment route in `server/src/app.ts`
**must** funnel its task lookup through `getVisibleTask` (which calls `canSeeTask`). Never
filter only in the React layer — the spec demo (Sara/Omar/Ali) is graded against the API.

When you add a new route that touches a task: read it via `getVisibleTask`, check
`canWriteTask` before mutating, and check `isManager` for manager-only operations.

## Auth model

- `role: "manager" | "admin"` → bypasses team filters, sees everything.
- `role: "employee"` → bound to `user.teamId`; sees only tasks where `task.teamId === user.teamId`.
- Local mode uses `POST /api/auth/demo-login` with a seeded `userId` and an in-memory bearer token. **Do not remove this route** — the spec's demo day script depends on it.
- AWS mode (when `MINI_JIRA_BACKEND=aws`) verifies a Cognito JWT and reads `custom:role` and `custom:teamId` as the source of truth. See [`server/src/services/README.md`](server/src/services/README.md).

## Service abstraction (AWS seams)

External dependencies live behind small interfaces in `server/src/services/`. Today only
`AssignmentNotifier` is wired (Noop in local, SNS at deploy time). When adding a new AWS
service (DynamoDB repo, S3 storage, Cognito verifier), follow the same pattern:

1. Define the interface in `server/src/services/<name>.ts`.
2. Provide a `Local` implementation that the existing in-memory code can satisfy.
3. Provide an `Aws` implementation that imports the relevant `@aws-sdk/client-*` package.
4. Switch on `loadConfig().backend` in `index.ts` to pick the implementation.
5. **Never** import `@aws-sdk/*` directly from a route handler. Always go through a service.

The seams are documented end-to-end in [`server/src/services/README.md`](server/src/services/README.md), including the DynamoDB GSI layout, the presigned-URL S3 upload flow, and the SNS message shape.

## Validation

Request body validation lives in `server/src/app.ts` (hand-rolled `requireString`,
`requirePriority`, `requireStatus`, `requireIsoDate`). When the route surface grows, swap
these for `zod` schemas — don't sprinkle ad-hoc `typeof` checks across handlers. Always
validate at the API boundary; never trust `req.body` shape inside a handler.

Payload limits already enforced:
- JSON body capped at 100 KB (`express.json({ limit: "100kb" })`).
- Attachment uploads capped at 5 MB (`multer`), MIME type must start with `image/`.

## Logging

Today: plain `console.log` only at startup. Before the AWS deployment, switch the server
to `pino` + `pino-http` and include `requestId`, `userId`, `teamId` on every line —
CloudWatch is only useful with structured logs.

## Tests

Vitest + Supertest, in `server/test/`. Conventions:

- One file per resource (`tasks.crud.test.ts`, `projects.test.ts`, `comments.test.ts`, `attachments.test.ts`, `access.test.ts`, `auth.test.ts`).
- Shared `newApp()` / `login()` / `auth()` helpers in `test/helpers.ts`.
- **Every new route gets at least one positive case and one access-denied case** (404 on cross-team, 403 on wrong role).
- Run `npm test` before declaring a change done. Don't push red.

## What NOT to do

- **Do not reintroduce mock auth in AWS mode.** The `demo-login` route must 404 when `MINI_JIRA_BACKEND=aws`.
- **Do not store images as base64 inside DynamoDB.** Originals go to S3, the row keeps the S3 key.
- **Do not bypass `getVisibleTask`.** Even a "small read endpoint" needs the visibility check.
- **Do not put role checks only in React.** The frontend is untrusted; the API is the boundary.
- **Do not remove old attachment versions.** Soft-delete only (`active: false`) — the spec requires retention.
- **Do not terminate AWS resources after submission.** The spec is explicit: stop, don't terminate.

## Spec-driven deployment checklist (out of scope for app commits)

The deployment workstream provisions: VPC + public/private subnets across 2 AZs, ALB, ASG of EC2
running this server, CloudFront in front of the ALB, Cognito User Pool, DynamoDB tables + GSIs,
S3 originals + resized buckets, image-resize Lambda, SQS + worker Lambda, EventBridge 9am rule
+ digest Lambda, CloudWatch dashboard + alarms. The app code in this repo is the producer side;
those resources consume from it.
