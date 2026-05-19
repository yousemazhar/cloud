# Mini-Jira on AWS

A lightweight task tracker built for the Software Cloud Computing 2026 course project
(Dr. John Zaki). The app demonstrates a team-isolated Jira-style workflow that runs
locally against an in-memory store today and is designed to deploy onto AWS (Cognito,
DynamoDB, S3, SNS, Lambda, EC2 behind an ALB + CloudFront).

The full spec lives in [`Cloud Computing Project S'26.md`](Cloud%20Computing%20Project%20S%2726.md).

## Repository layout

Three-workspace npm monorepo:

| Workspace | Stack | Purpose |
|-----------|-------|---------|
| [`shared/`](shared) | TypeScript | Single source of truth for domain types (`Task`, `User`, `Project`, …) and label maps. |
| [`server/`](server) | Express 5 + TypeScript | REST API. In-memory store today; AWS services plugged in behind `server/src/services/` seams. |
| [`client/`](client) | Vite + React 19 + TypeScript | Single-page UI with custom CSS. |

`shared` builds first; the root `build` script enforces ordering.

## Getting started

```bash
npm install      # at repo root — hoists all three workspaces
npm run dev      # client + server in parallel
```

The client runs on the Vite dev server; the API runs on Express. Use
`POST /api/auth/demo-login` with a seeded `userId` to obtain a bearer token in local mode.

## Common scripts

```bash
npm run dev          # client + server in watch mode
npm test             # vitest (server workspace)
npm run typecheck    # tsc across shared, server, client
npm run build        # shared -> server -> client
```

## Auth & team isolation

- `role: "manager" | "admin"` — bypasses team filters, sees everything.
- `role: "employee"` — bound to `user.teamId`; only sees tasks where `task.teamId === user.teamId`.

Team isolation is enforced **on the server**. Every task/comment/attachment route funnels
its lookup through `getVisibleTask` (which calls `canSeeTask`) so a Backend employee
cannot fetch a Frontend task even by guessing its ID. Frontend filters are UX only.

## AWS service seams

External dependencies are abstracted in [`server/src/services/`](server/src/services).
Each service exposes a `Local` implementation (default) and an `Aws` implementation
selected by `MINI_JIRA_BACKEND=aws`. Route handlers never import `@aws-sdk/*` directly.

See [`server/src/services/README.md`](server/src/services/README.md) for the end-to-end
notes on the DynamoDB GSI layout, presigned-URL S3 upload flow, Cognito JWT verification,
and SNS message shape.

## Constraints worth knowing

- JSON bodies are capped at 100 KB; attachment uploads at 5 MB and `image/*` MIME only.
- Attachments are soft-deleted (`active: false`); old versions are retained per spec.
- The `demo-login` route returns 404 in AWS mode — production auth is Cognito only.

## Tests

Vitest + Supertest under [`server/test/`](server/test). One file per resource, each new
route ships with at least one positive case and one access-denied case (404 cross-team,
403 wrong role). Run `npm test` before opening a PR.
