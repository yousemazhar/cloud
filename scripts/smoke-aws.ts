/**
 * End-to-end smoke test against the deployed CloudFront URL.
 * Validates the **graded demo scenario** from the spec:
 *
 *   Ali (manager) creates Task A -> Sara (Frontend) and Task B -> Omar (Backend).
 *   Sara sees only A. Omar sees only B. Ali sees both and can filter by team.
 *
 * Run:
 *   npx ts-node scripts/smoke-aws.ts \
 *     --base https://dXXXXXX.cloudfront.net \
 *     --user-pool-id us-east-1_xxxx \
 *     --client-id xxxxx \
 *     --region us-east-1
 */
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";

const DEFAULT_PASSWORD = "MiniJira#2026";

interface Args {
  base: string;
  userPoolId: string;
  clientId: string;
  region: string;
}

function parseArgs(): Args {
  const out: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = process.argv[i + 1];
  }
  if (!out.base || !out.userPoolId || !out.clientId) {
    throw new Error("Usage: smoke-aws.ts --base <cloudfront-url> --user-pool-id <id> --client-id <id> [--region us-east-1]");
  }
  if (out.base.endsWith("/")) out.base = out.base.slice(0, -1);
  return { base: out.base, userPoolId: out.userPoolId, clientId: out.clientId, region: out.region ?? "us-east-1" };
}

async function login(cog: CognitoIdentityProviderClient, args: Args, email: string): Promise<string> {
  const resp = await cog.send(new AdminInitiateAuthCommand({
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    UserPoolId: args.userPoolId,
    ClientId: args.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: DEFAULT_PASSWORD }
  }));
  const token = resp.AuthenticationResult?.IdToken;
  if (!token) throw new Error(`no id token for ${email}`);
  return token;
}

async function api(args: Args, token: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const resp = await fetch(`${args.base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = resp.status === 204 ? null : await resp.json().catch(() => null);
  return { status: resp.status, data };
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const cog = new CognitoIdentityProviderClient({ region: args.region });

  console.log("logging in as Ali, Sara, Omar...");
  const aliToken = await login(cog, args, "ali@minijira.test");
  const saraToken = await login(cog, args, "sara@minijira.test");
  const omarToken = await login(cog, args, "omar@minijira.test");

  console.log("looking up Cognito subs for Sara and Omar via /api/users...");
  const usersResp = await api(args, aliToken, "GET", "/api/users");
  assert(usersResp.status === 200, `/api/users returned ${usersResp.status}`);
  const users = (usersResp.data as { users: { id: string; email: string }[] }).users;
  const saraId = users.find((u) => u.email === "sara@minijira.test")?.id;
  const omarId = users.find((u) => u.email === "omar@minijira.test")?.id;
  assert(!!saraId && !!omarId, "Sara and Omar must exist in MiniJira_Users");

  console.log(`Sara id=${saraId}  Omar id=${omarId}`);

  console.log("Ali creates a Frontend project + Backend project...");
  const projA = await api(args, aliToken, "POST", "/api/projects",
    { name: "Frontend Sprint", description: "Smoke test", teamId: "team-frontend" });
  const projB = await api(args, aliToken, "POST", "/api/projects",
    { name: "Backend Sprint", description: "Smoke test", teamId: "team-backend" });
  if (projA.status !== 201 || projB.status !== 201) {
    console.error("projA:", projA.status, projA.data);
    console.error("projB:", projB.status, projB.data);
  }
  assert(projA.status === 201 && projB.status === 201, "project create returned 201");

  const projAId = (projA.data as { project: { id: string } }).project.id;
  const projBId = (projB.data as { project: { id: string } }).project.id;

  console.log("Ali creates Task A (Sara, Frontend) and Task B (Omar, Backend)...");
  const taskA = await api(args, aliToken, "POST", "/api/tasks", {
    title: "Task A - frontend", description: "smoke", priority: "medium",
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    assigneeId: saraId, teamId: "team-frontend", projectId: projAId
  });
  const taskB = await api(args, aliToken, "POST", "/api/tasks", {
    title: "Task B - backend", description: "smoke", priority: "high",
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    assigneeId: omarId, teamId: "team-backend", projectId: projBId
  });
  assert(taskA.status === 201 && taskB.status === 201, "task create returned 201");

  console.log("checking Sara sees ONLY Task A...");
  const saraList = await api(args, saraToken, "GET", "/api/tasks");
  const saraTitles = (saraList.data as { tasks: { title: string }[] }).tasks.map((t) => t.title);
  assert(saraTitles.includes("Task A - frontend"), "Sara should see Task A");
  assert(!saraTitles.includes("Task B - backend"), "Sara MUST NOT see Task B (cross-team leak)");

  console.log("checking Omar sees ONLY Task B...");
  const omarList = await api(args, omarToken, "GET", "/api/tasks");
  const omarTitles = (omarList.data as { tasks: { title: string }[] }).tasks.map((t) => t.title);
  assert(omarTitles.includes("Task B - backend"), "Omar should see Task B");
  assert(!omarTitles.includes("Task A - frontend"), "Omar MUST NOT see Task A (cross-team leak)");

  console.log("checking Ali sees BOTH tasks...");
  const aliList = await api(args, aliToken, "GET", "/api/tasks");
  const aliTitles = (aliList.data as { tasks: { title: string }[] }).tasks.map((t) => t.title);
  assert(aliTitles.includes("Task A - frontend") && aliTitles.includes("Task B - backend"),
    "Ali should see both tasks");

  console.log("checking Ali can filter by Frontend team...");
  const aliFrontend = await api(args, aliToken, "GET", "/api/tasks?teamId=team-frontend");
  const aliFrontTitles = (aliFrontend.data as { tasks: { title: string }[] }).tasks.map((t) => t.title);
  assert(aliFrontTitles.includes("Task A - frontend"), "Ali filter=frontend includes Task A");
  assert(!aliFrontTitles.includes("Task B - backend"), "Ali filter=frontend excludes Task B");

  console.log("\nSMOKE TEST PASSED. Team isolation enforced server-side.");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err.message);
  process.exit(1);
});
