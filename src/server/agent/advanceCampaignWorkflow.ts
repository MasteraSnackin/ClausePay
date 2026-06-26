import crypto from "node:crypto";
import type { AgentEvent, CampaignRun, CampaignWorkflowStep, IntegrationRunStatus, RecoveryAction } from "../../shared/types";
import { appendWorkflowAdvanceToClickHouse } from "../integrations/clickhouse";
import { persistCampaign, readCampaign } from "../storage/localStore";

export async function advanceCampaignWorkflow(campaignId: string): Promise<CampaignRun | null> {
  const campaign = await readCampaign(campaignId);
  if (!campaign) return null;

  const nextStepIndex = campaign.workflow.findIndex((step) => step.state !== "completed" && step.state !== "blocked");
  if (nextStepIndex === -1) return campaign;

  const previousStep = campaign.workflow[nextStepIndex];
  const advancedStep: CampaignWorkflowStep = {
    ...previousStep,
    state: "completed"
  };
  const workflow = campaign.workflow.map((step, index) => (index === nextStepIndex ? advancedStep : step));
  const createdAt = new Date().toISOString();
  const event = buildAdvanceEvent(campaign, previousStep, advancedStep, createdAt);
  const action = buildAdvanceAction(campaign, previousStep, advancedStep, createdAt);

  const campaignBeforeLedger: CampaignRun = {
    ...campaign,
    workflow,
    events: [...campaign.events, event],
    actions: [...campaign.actions, action]
  };

  const clickhouse = await appendWorkflowAdvanceToClickHouse(campaignBeforeLedger, event, action, advancedStep);
  const updatedCampaign: CampaignRun = {
    ...campaignBeforeLedger,
    integrationStatus: updateIntegrationStatus(campaignBeforeLedger.integrationStatus, {
      name: "clickhouse",
      state: clickhouse.state,
      detail: clickhouse.detail
    })
  };

  await persistCampaign(updatedCampaign);
  return updatedCampaign;
}

function buildAdvanceEvent(
  campaign: CampaignRun,
  previousStep: CampaignWorkflowStep,
  advancedStep: CampaignWorkflowStep,
  occurredAt: string
): AgentEvent {
  return {
    id: `evt_${campaign.events.length + 1}_${crypto.randomUUID().slice(0, 6)}`,
    occurredAt,
    type: "workflow_step_advanced",
    sponsorTool: advancedStep.sponsorTool,
    summary: `Advanced campaign to Day ${advancedStep.day}: ${advancedStep.label}`,
    payload: {
      stepId: advancedStep.id,
      day: advancedStep.day,
      dueDate: advancedStep.dueDate,
      channel: advancedStep.channel,
      previousState: previousStep.state,
      newState: advancedStep.state,
      trigger: advancedStep.trigger
    }
  };
}

function buildAdvanceAction(
  campaign: CampaignRun,
  previousStep: CampaignWorkflowStep,
  advancedStep: CampaignWorkflowStep,
  createdAt: string
): RecoveryAction {
  return {
    id: `act_${campaign.actions.length + 1}`,
    type: "workflow_advance",
    label: `Advance Day ${advancedStep.day}`,
    state: "completed",
    sponsorTool: advancedStep.sponsorTool,
    detail: `${advancedStep.label} completed from ${previousStep.state.replace("_", " ")} state.`,
    createdAt,
    payload: {
      stepId: advancedStep.id,
      day: advancedStep.day,
      dueDate: advancedStep.dueDate,
      channel: advancedStep.channel,
      trigger: advancedStep.trigger,
      evidence: advancedStep.evidence,
      previousState: previousStep.state,
      newState: advancedStep.state
    }
  };
}

function updateIntegrationStatus(
  statuses: IntegrationRunStatus[],
  nextStatus: IntegrationRunStatus
): IntegrationRunStatus[] {
  const hasStatus = statuses.some((status) => status.name === nextStatus.name);
  if (!hasStatus) return [...statuses, nextStatus];
  return statuses.map((status) => (status.name === nextStatus.name ? nextStatus : status));
}
