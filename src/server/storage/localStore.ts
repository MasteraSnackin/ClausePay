import { promises as fs } from "node:fs";
import path from "node:path";
import type { CampaignRun } from "../../shared/types";

export function getCampaignOutputDir(campaignId: string): string {
  return path.join(getCampaignsRoot(), campaignId);
}

export async function persistCampaign(campaign: CampaignRun): Promise<void> {
  const outputDir = getCampaignOutputDir(campaign.id);
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, "campaign.json"), JSON.stringify(campaign, null, 2)),
    fs.writeFile(path.join(outputDir, "brief.md"), campaign.briefMarkdown),
    fs.writeFile(path.join(outputDir, "email.md"), campaign.emailMarkdown),
    fs.writeFile(path.join(outputDir, "ontology.vadalog"), campaign.ontology.programme),
    fs.writeFile(
      path.join(outputDir, "ontology.json"),
      JSON.stringify(
        {
          nodes: campaign.ontology.nodes,
          edges: campaign.ontology.edges,
          result: campaign.ontology.result,
          state: campaign.ontology.state,
          error: campaign.ontology.error
        },
        null,
        2
      )
    ),
    fs.writeFile(path.join(outputDir, "source-action-trace.json"), JSON.stringify(campaign.sourceActionTrace, null, 2)),
    fs.writeFile(path.join(outputDir, "workflow.json"), JSON.stringify(campaign.workflow, null, 2)),
    fs.writeFile(
      path.join(outputDir, "ledger.jsonl"),
      campaign.events.map((event) => JSON.stringify(event)).join("\n") + "\n"
    )
  ]);
}

export async function listCampaigns(): Promise<CampaignRun[]> {
  const root = getCampaignsRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const campaigns = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(root, entry.name, "campaign.json"), "utf8");
          return JSON.parse(raw) as CampaignRun;
        })
    );

    return campaigns.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function getCampaignsRoot(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "clausepay", "generated", "campaigns");
  }

  return path.join(process.cwd(), "generated", "campaigns");
}

export async function readCampaign(campaignId: string): Promise<CampaignRun | null> {
  try {
    const raw = await fs.readFile(path.join(getCampaignOutputDir(campaignId), "campaign.json"), "utf8");
    return JSON.parse(raw) as CampaignRun;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function renameCampaign(campaignId: string, label: string): Promise<CampaignRun | null> {
  const campaign = await readCampaign(campaignId);
  if (!campaign) return null;

  const renamedCampaign: CampaignRun = {
    ...campaign,
    label
  };

  await persistCampaign(renamedCampaign);
  return renamedCampaign;
}
