#!/usr/bin/env node
// Bypass AWS CLI Windows encoding bug by using the Node SDK directly.
import { SSMClient, GetCommandInvocationCommand, SendCommandCommand } from "@aws-sdk/client-ssm";

const region = "us-east-1";
const profile = "mini-jira";
process.env.AWS_PROFILE = profile;

const cmdId = process.argv[2];
const instanceId = process.argv[3];
if (!cmdId || !instanceId) {
  console.error("Usage: node scripts/ssm-get.mjs <commandId> <instanceId>");
  process.exit(1);
}

const client = new SSMClient({ region });

const result = await client.send(new GetCommandInvocationCommand({
  CommandId: cmdId,
  InstanceId: instanceId
}));

console.log("=== STATUS ===", result.Status);
console.log("=== STDOUT ===");
process.stdout.write((result.StandardOutputContent ?? "").toString());
console.log("\n=== STDERR ===");
process.stdout.write((result.StandardErrorContent ?? "").toString());
