# Server services / AWS integration seams

The application keeps every external dependency behind a small interface in this folder so
swapping local impls for AWS impls is a config flag (`MINI_JIRA_BACKEND=aws`) — not a rewrite.

## Wiring

`src/index.ts` reads `loadConfig()` and instantiates the right implementation for the active
backend, then passes them to `createApp`. Today `createApp` accepts a `DataStore` and uses an
internal `NoopNotifier`; the deploy-time refactor extends it to accept a `Services` bag:

```ts
interface Services {
  store: DataStore;             // see store.ts (in-memory) or DynamoRepo (TODO)
  notifier: AssignmentNotifier; // see notifications.ts (Noop / Sns)
  storage: AttachmentStorage;   // TODO — see below
  auth: AuthVerifier;           // TODO — see below
}
```

## Implemented today

- `AssignmentNotifier` (notifications.ts) — `NoopNotifier` logs in local mode. SNS swap shown in code comments.

## To wire at deploy time

| Seam | Local impl | AWS impl | Spec line |
| --- | --- | --- | --- |
| `AuthVerifier` | `LocalAuth` (the existing `sessions` map + `demo-login` route, gated on `backend === "local"`) | `CognitoAuth` — verify JWT with `aws-jwt-verify`, extract `sub`, `custom:role`, `custom:teamId` | "Use AWS Cognito ... Tokens issued by Cognito must be validated by your backend on every request." |
| `TaskRepo` / `ProjectRepo` / `CommentRepo` | `InMemoryRepo` (wraps current `DataStore`) | `DynamoRepo` — `@aws-sdk/lib-dynamodb`, GSIs on `teamId` and `assigneeId` | "DynamoDB Integration ... GSI on teamId and one on assigneeId" |
| `AttachmentStorage` | `LocalDiskStorage` (the current `multer` flow) | `S3Storage` — `PutObjectCommand` + `GetSignedUrlCommand`; client uses presigned URLs | "S3 Image Upload ... old and new versions are retained" |
| `AssignmentNotifier` | `NoopNotifier` | `SnsNotifier` — see code comments in `notifications.ts` | "publish an event to an SNS topic" |

## Cognito custom attributes (User Pool setup)

When provisioning the Cognito User Pool, define these custom attributes (mutable, string):

- `custom:role` — one of `manager`, `employee`, `admin`
- `custom:teamId` — the user's team id (omit for managers)

`CognitoAuth` should map these claims onto the `User` shape in `shared/src/index.ts`.

## DynamoDB table layout

| Table | PK | SK | GSIs |
| --- | --- | --- | --- |
| `MiniJira_Users` | `id` | — | `email-index` (sparse) |
| `MiniJira_Teams` | `id` | — | — |
| `MiniJira_Projects` | `id` | — | `teamId-index` |
| `MiniJira_Tasks` | `id` | — | `teamId-deadline-index`, `assigneeId-deadline-index` |
| `MiniJira_Comments` | `taskId` | `createdAt#id` | — |
| `MiniJira_AuditLogs` | `taskId` | `createdAt#id` | — |

`teamId-deadline-index` is the load-bearing GSI for the spec's team-scoped query: employees
querying their own tasks page DynamoDB by `teamId` and sort by `deadline`.

## S3 flow (deploy-time)

1. Client `POST /api/tasks/:taskId/attachments/presign` → server returns `{ uploadUrl, attachmentId, s3Key }`.
2. Client PUTs the file directly to S3 originals bucket using `uploadUrl`.
3. Client `POST /api/tasks/:taskId/attachments` with `{ attachmentId, s3Key, fileName, mimeType, size }` to confirm.
4. The image-resize Lambda is triggered by the S3 `ObjectCreated:*` event and writes a thumbnail to the resized bucket.
5. On read, server generates a presigned GET URL with a 5-minute TTL.

Bucket policy: private. Object versioning enabled on originals bucket so "old versions are retained" is enforced by S3 itself, not just `attachment.active = false` in the row.

## CloudWatch metrics (consumed by the worker Lambda, not this service)

The worker Lambda reads from SQS and publishes a custom metric `TasksAssignedPerTeam` with
dimension `TeamId`. The dashboard renders this alongside `TasksClosedPerTeam` (published from
the PATCH-status handler in AWS mode via a CloudWatch PutMetric seam — add later if needed).
