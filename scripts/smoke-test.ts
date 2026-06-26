import "dotenv/config";
import { access } from "node:fs/promises";
import path from "node:path";
import { runRecoveryCampaign } from "../src/server/agent/runRecoveryAgent";
import { getEnvStatus } from "../src/server/env";

const envStatus = getEnvStatus();
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

async function assertFileExists(filePath: string) {
  try {
    await access(filePath);
  } catch {
    failures.push(`Expected generated artefact: ${filePath}`);
  }
}

const campaign = await runRecoveryCampaign({
  researchCompanyName: process.env.DEMO_PUBLIC_COMPANY_NAME,
  researchDomain: process.env.DEMO_PUBLIC_COMPANY_DOMAIN
});

const integrations = Object.fromEntries(campaign.integrationStatus.map((status) => [status.name, status.state]));
const clickhouseStatus = campaign.integrationStatus.find((status) => status.name === "clickhouse");
const expectedClickHouseDetail = `Wrote ${campaign.events.length} events, ${campaign.evidence.length} sources, ${campaign.actions.length} actions, ${campaign.sourceActionTrace.length} trace links, and ${campaign.workflow.length} workflow steps to ClickHouse.`;

assert(campaign.evidence.length >= 2, "Expected at least 2 evidence sources.");
assert(campaign.actions.length === 8, "Expected 8 recovery actions.");
assert(campaign.events.length === 8, "Expected 8 agent events.");
assert(campaign.sourceActionTrace.length === 7, "Expected 7 source-action trace rows.");
assert(campaign.workflow.length === 6, "Expected 6 workflow steps.");
assert(Boolean(campaign.briefMarkdown), "Expected a recovery brief.");
assert(Boolean(campaign.emailMarkdown), "Expected an email draft.");
assert(campaign.actions.some((action) => action.type === "email_draft" && action.state === "approval_required"), "Expected approval-gated email draft action.");
assert(campaign.events.some((event) => event.type === "clickhouse_write_processed"), "Expected ClickHouse write event.");

await Promise.all(
  [
    "campaign.json",
    "brief.md",
    "email.md",
    "ontology.json",
    "ontology.vadalog",
    "source-action-trace.json",
    "workflow.json",
    "ledger.jsonl"
  ].map((fileName) => assertFileExists(path.join(campaign.outputDir, fileName)))
);

if (envStatus.tavily) {
  assert(integrations.tavily === "completed", "Tavily is configured but did not complete.");
}

if (envStatus.prometheux) {
  assert(integrations.prometheux === "completed", "Prometheux is configured but did not complete.");
}

if (envStatus.clickhouse) {
  assert(integrations.clickhouse === "completed", "ClickHouse is configured but did not complete.");
  assert(clickhouseStatus?.detail === expectedClickHouseDetail, "ClickHouse final ledger detail did not match the campaign shape.");
}

const summary = {
  campaignId: campaign.id,
  evidence: campaign.evidence.length,
  actions: campaign.actions.length,
  events: campaign.events.length,
  trace: campaign.sourceActionTrace.length,
  workflow: campaign.workflow.length,
  integrations,
  passed: failures.length === 0,
  failures
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
