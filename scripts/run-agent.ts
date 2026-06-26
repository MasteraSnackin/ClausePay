import "dotenv/config";
import { runRecoveryCampaign } from "../src/server/agent/runRecoveryAgent";

const campaign = await runRecoveryCampaign({
  researchCompanyName: process.env.DEMO_PUBLIC_COMPANY_NAME,
  researchDomain: process.env.DEMO_PUBLIC_COMPANY_DOMAIN
});

console.log(`Campaign ${campaign.id} complete`);
console.log(`Output directory: ${campaign.outputDir}`);
console.log(`Evidence sources: ${campaign.evidence.length}`);
console.log(`Payment link: ${campaign.paymentLink || "not available"}`);
console.log("Integration status:");
for (const status of campaign.integrationStatus) {
  console.log(`- ${status.name}: ${status.state} - ${status.detail}`);
}
