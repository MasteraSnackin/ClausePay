import type { CampaignRun } from "../../shared/types";
import { fetchWithTimeout } from "./fetchWithTimeout";

export async function postSlackNotification(
  campaign: CampaignRun
): Promise<{ state: "completed" | "simulated" | "failed"; message: string; detail: string }> {
  const message = [
    `ClausePay campaign ${campaign.id} queued for approval`,
    `Invoice: ${campaign.invoice.id} (${formatCurrency(campaign.invoice.amount, campaign.invoice.currency)})`,
    `Days overdue: ${campaign.daysOverdue}`,
    `Draft email: approval required`,
    `Payment link: ${campaign.paymentLink || "pending"}`
  ].join("\n");

  if (!process.env.SLACK_WEBHOOK_URL) {
    return {
      state: "simulated",
      message,
      detail: "SLACK_WEBHOOK_URL is missing; notification was generated but not posted."
    };
  }

  try {
    const response = await fetchWithTimeout(
      process.env.SLACK_WEBHOOK_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message })
      },
      10_000,
      "Slack"
    );

    if (!response.ok) {
      throw new Error(`Slack returned ${response.status}: ${await response.text()}`);
    }

    return {
      state: "completed",
      message,
      detail: "Slack webhook notification posted."
    };
  } catch (error) {
    return {
      state: "failed",
      message,
      detail: error instanceof Error ? error.message : "Slack notification failed."
    };
  }
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency
  }).format(amount);
}
