import crypto from "node:crypto";
import path from "node:path";
import type {
  AgentEvent,
  CampaignRun,
  CampaignWorkflowStep,
  ContractClause,
  IntegrationRunStatus,
  PublicContextTarget,
  RecoveryAction,
  RunCampaignRequest,
  SourceActionTrace
} from "../../shared/types";
import { demoContract, demoInvoice, getDefaultPublicContextTarget } from "../data/demoData";
import { createInvoicePaymentLink } from "../integrations/stripe";
import { postSlackNotification } from "../integrations/slack";
import { researchPublicContext } from "../integrations/tavily";
import { runPrometheuxOntology } from "../integrations/prometheux";
import { appendClickHouseOutcome, writeCampaignToClickHouse } from "../integrations/clickhouse";
import { getCampaignOutputDir, persistCampaign } from "../storage/localStore";

export async function runRecoveryCampaign(request: RunCampaignRequest = {}): Promise<CampaignRun> {
  const campaignId = `camp_${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const asOfDate = createdAt;
  const publicContextTarget = resolvePublicContextTarget(request);
  const events: AgentEvent[] = [];

  const logEvent = (type: string, sponsorTool: AgentEvent["sponsorTool"], summary: string, payload = {}) => {
    const event: AgentEvent = {
      id: `evt_${events.length + 1}_${crypto.randomUUID().slice(0, 6)}`,
      occurredAt: new Date().toISOString(),
      type,
      sponsorTool,
      summary,
      payload
    };
    events.push(event);
    return event;
  };

  logEvent("campaign_started", "local", `Started recovery campaign for ${demoInvoice.id}`, {
    invoiceId: demoInvoice.id,
    contextOnly: publicContextTarget.contextOnly
  });

  const clausesUsed = selectCollectionClauses();
  logEvent("contract_clauses_extracted", "local", `Extracted ${clausesUsed.length} recovery clauses`, {
    clauseIds: clausesUsed.map((clause) => clause.id)
  });

  const daysOverdue = calculateDaysOverdue(demoInvoice.dueDate, asOfDate);
  const recoveryStage = daysOverdue > 30 ? "firm_reminder" : "initial";
  const tavily = await researchPublicContext(publicContextTarget, campaignId);
  logEvent("web_research_completed", "tavily", tavily.detail, {
    sourceCount: tavily.evidence.length,
    state: tavily.state
  });

  const riskScore = calculateRiskScore(daysOverdue, tavily.evidence.length);
  const ontology = await runPrometheuxOntology({
    invoice: demoInvoice,
    clauses: clausesUsed,
    target: publicContextTarget,
    daysOverdue,
    riskScore
  });
  logEvent("ontology_processed", "prometheux", `Prometheux ontology state: ${ontology.state}`, {
    nodes: ontology.nodes.length,
    edges: ontology.edges.length,
    state: ontology.state,
    error: ontology.error
  });

  const stripe = await createInvoicePaymentLink(demoInvoice, campaignId);
  logEvent("payment_link_prepared", "stripe", stripe.detail, {
    state: stripe.state,
    paymentLink: stripe.url
  });
  const finalWorkflow = buildWorkflow({
    asOfDate,
    clausesUsed,
    tavilyState: tavily.state,
    paymentLink: stripe.url
  });

  const briefMarkdown = buildBrief({
    campaignId,
    publicContextTarget,
    daysOverdue,
    riskScore,
    clausesUsed,
    evidence: tavily.evidence,
    paymentLink: stripe.url,
    workflow: finalWorkflow
  });

  const emailMarkdown = buildEmailDraft({
    clausesUsed,
    daysOverdue,
    paymentLink: stripe.url
  });
  logEvent("email_drafted_for_approval", "local", "Generated human-approved collection email draft", {
    autoSent: false
  });

  const actions = buildActions({
    createdAt,
    clausesUsed,
    tavilyState: tavily.state,
    ontologyState: ontology.state,
    stripeState: stripe.state,
    paymentLink: stripe.url
  });
  const sourceActionTrace = buildSourceActionTrace({
    clausesUsed,
    evidence: tavily.evidence,
    daysOverdue,
    paymentLink: stripe.url
  });
  const campaignBeforeSlack: CampaignRun = {
    id: campaignId,
    createdAt,
    asOfDate,
    invoice: demoInvoice,
    contract: demoContract,
    publicContextTarget,
    daysOverdue,
    riskScore,
    recoveryStage,
    evidence: tavily.evidence,
    clausesUsed,
    actions,
    sourceActionTrace,
    workflow: finalWorkflow,
    events,
    ontology,
    briefMarkdown,
    emailMarkdown,
    paymentLink: stripe.url,
    outputDir: getCampaignOutputDir(campaignId),
    integrationStatus: []
  };

  const slack = await postSlackNotification(campaignBeforeSlack);
  logEvent("slack_notification_processed", "slack", slack.detail, {
    state: slack.state,
    message: slack.message
  });

  actions.push({
    id: `act_${actions.length + 1}`,
    type: "slack_notification",
    label: "Notify finance channel",
    state: slack.state === "completed" ? "completed" : slack.state === "failed" ? "failed" : "simulated",
    sponsorTool: "slack",
    detail: slack.detail,
    createdAt: new Date().toISOString(),
    payload: { message: slack.message }
  });

  const campaignBeforeClickHouse: CampaignRun = {
    ...campaignBeforeSlack,
    actions,
    sourceActionTrace,
    workflow: finalWorkflow,
    events,
    slackMessage: slack.message,
    integrationStatus: buildIntegrationStatus({
      tavily: tavily.state,
      prometheux: ontology.state,
      prometheuxDetail: ontology.error,
      stripe: stripe.state,
      slack: slack.state,
      clickhouse: "skipped",
      clickhouseDetail: "ClickHouse write pending."
    })
  };

  let clickhouse = await writeCampaignToClickHouse(campaignBeforeClickHouse);
  const clickhouseEvent = logEvent("clickhouse_write_processed", "clickhouse", clickhouse.detail, {
    state: clickhouse.state
  });

  const clickhouseAction: RecoveryAction = {
    id: `act_${actions.length + 1}`,
    type: "clickhouse_write",
    label: "Persist action ledger",
    state:
      clickhouse.state === "completed" ? "completed" : clickhouse.state === "failed" ? "failed" : "simulated",
    sponsorTool: "clickhouse",
    detail: clickhouse.detail,
    createdAt: new Date().toISOString(),
    payload: {
      tables: ["agent_events", "evidence_sources", "agent_actions"]
    }
  };
  actions.push(clickhouseAction);

  if (clickhouse.state === "completed") {
    const finalClickHouseDetail = buildClickHouseDetail({
      eventCount: events.length,
      sourceCount: campaignBeforeClickHouse.evidence.length,
      actionCount: actions.length,
      traceCount: campaignBeforeClickHouse.sourceActionTrace.length,
      workflowCount: campaignBeforeClickHouse.workflow.length
    });
    clickhouse.detail = finalClickHouseDetail;
    clickhouseEvent.summary = finalClickHouseDetail;
    clickhouseEvent.payload = { state: clickhouse.state, finalLedgerAppend: true };
    clickhouseAction.detail = finalClickHouseDetail;

    const appendOutcome = await appendClickHouseOutcome(campaignBeforeClickHouse, clickhouseEvent, clickhouseAction);
    if (appendOutcome.state !== "completed") {
      clickhouse = {
        state: "completed",
        detail: `${finalClickHouseDetail} Final outcome append warning: ${appendOutcome.detail}`
      };
      clickhouseEvent.summary = clickhouse.detail;
      clickhouseAction.detail = clickhouse.detail;
    }
  }

  const campaign: CampaignRun = {
    ...campaignBeforeClickHouse,
    actions,
    sourceActionTrace,
    workflow: finalWorkflow,
    events,
    integrationStatus: buildIntegrationStatus({
      tavily: tavily.state,
      prometheux: ontology.state,
      prometheuxDetail: ontology.error,
      stripe: stripe.state,
      slack: slack.state,
      clickhouse: clickhouse.state,
      clickhouseDetail: clickhouse.detail
    })
  };

  await persistCampaign(campaign);
  return campaign;
}

function buildClickHouseDetail(params: {
  eventCount: number;
  sourceCount: number;
  actionCount: number;
  traceCount: number;
  workflowCount: number;
}): string {
  return `Wrote ${params.eventCount} events, ${params.sourceCount} sources, ${params.actionCount} actions, ${params.traceCount} trace links, and ${params.workflowCount} workflow steps to ClickHouse.`;
}

function resolvePublicContextTarget(request: RunCampaignRequest): PublicContextTarget {
  const fallback = getDefaultPublicContextTarget();
  return {
    companyName: request.researchCompanyName?.trim() || fallback.companyName,
    domain: stripProtocol(request.researchDomain?.trim() || fallback.domain),
    contextOnly: true
  };
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

function selectCollectionClauses(): ContractClause[] {
  return demoContract.clauses.filter((clause) => ["5.1", "5.3", "5.4", "9.2"].includes(clause.id));
}

function calculateDaysOverdue(dueDate: string, asOfDate: string): number {
  const delta = Date.parse(asOfDate) - Date.parse(dueDate);
  return Math.max(0, Math.floor(delta / 86_400_000));
}

function calculateRiskScore(daysOverdue: number, sourceCount: number): number {
  const overdueScore = Math.min(70, daysOverdue * 1.3);
  const evidenceScore = Math.min(15, sourceCount * 1.8);
  return Math.round(15 + overdueScore + evidenceScore);
}

function buildSourceActionTrace(params: {
  clausesUsed: ContractClause[];
  evidence: Array<{ id: string; title: string; url: string; confidence: number }>;
  daysOverdue: number;
  paymentLink?: string;
}): SourceActionTrace[] {
  const paymentClause = params.clausesUsed.find((clause) => clause.id === "5.1");
  const interestClause = params.clausesUsed.find((clause) => clause.id === "5.3");
  const disputeClause = params.clausesUsed.find((clause) => clause.id === "5.4");
  const suspensionClause = params.clausesUsed.find((clause) => clause.id === "9.2");
  const webSource = params.evidence[0];

  return [
    {
      id: "trace_1",
      claim: `Invoice ${demoInvoice.id} is ${params.daysOverdue} days overdue.`,
      sourceLabel: `${demoInvoice.id} due date ${demoInvoice.dueDate}`,
      sourceType: "invoice",
      action: "Set campaign stage to firm reminder and require recovery follow-up.",
      actionType: "follow_up_schedule",
      confidence: 0.99
    },
    {
      id: "trace_2",
      claim: paymentClause?.text || "Payment terms extracted from contract.",
      sourceLabel: `Contract clause ${paymentClause?.id || "5.1"}, page ${paymentClause?.page || 18}`,
      sourceType: "contract",
      action: "Cite payment terms in the first collection email.",
      actionType: "email_draft",
      confidence: 0.97
    },
    {
      id: "trace_3",
      claim: disputeClause?.text || "Dispute process extracted from contract.",
      sourceLabel: `Contract clause ${disputeClause?.id || "5.4"}, page ${disputeClause?.page || 19}`,
      sourceType: "contract",
      action: "Invite dispute details before escalation.",
      actionType: "email_draft",
      confidence: 0.96
    },
    {
      id: "trace_4",
      claim: interestClause?.text || "Late payment interest clause extracted from contract.",
      sourceLabel: `Contract clause ${interestClause?.id || "5.3"}, page ${interestClause?.page || 19}`,
      sourceType: "contract",
      action: "Include late-interest notice in the firm reminder sequence.",
      actionType: "follow_up_schedule",
      confidence: 0.95
    },
    {
      id: "trace_5",
      claim: suspensionClause?.text || "Service suspension clause extracted from contract.",
      sourceLabel: `Contract clause ${suspensionClause?.id || "9.2"}, page ${suspensionClause?.page || 34}`,
      sourceType: "contract",
      action: "Schedule day-14 escalation warning if no payment or dispute arrives.",
      actionType: "follow_up_schedule",
      confidence: 0.93
    },
    {
      id: "trace_6",
      claim: webSource
        ? `Public web context checked: ${webSource.title}.`
        : "Public context source unavailable.",
      sourceLabel: webSource ? `${webSource.id}: ${webSource.url}` : "Tavily source pending",
      sourceType: "web",
      action: "Attach grounded debtor context to the recovery brief.",
      actionType: "web_research",
      confidence: webSource ? webSource.confidence : 0.35
    },
    {
      id: "trace_7",
      claim: params.paymentLink ? "Payment route is available." : "Payment route is pending test credentials.",
      sourceLabel: params.paymentLink || "Stripe test key pending",
      sourceType: "payment",
      action: "Add payment link to email draft and campaign record.",
      actionType: "payment_link",
      confidence: params.paymentLink ? 0.9 : 0.5
    }
  ];
}

function buildWorkflow(params: {
  asOfDate: string;
  clausesUsed: ContractClause[];
  tavilyState: string;
  paymentLink?: string;
}): CampaignWorkflowStep[] {
  const due = (day: number) => addDays(params.asOfDate, day);
  const clauseIds = params.clausesUsed.map((clause) => `Clause ${clause.id}`);
  const webEvidence = params.tavilyState === "completed" ? ["Tavily live web sources"] : ["Tavily live source pending"];

  return [
    {
      id: "wf_day_0",
      day: 0,
      dueDate: due(0),
      label: "Prepare first recovery email",
      state: "approval_required",
      channel: "email",
      sponsorTool: "local",
      trigger: "Invoice is overdue and no dispute is logged.",
      evidence: [`Invoice ${demoInvoice.id}`, ...clauseIds.slice(0, 3), ...webEvidence]
    },
    {
      id: "wf_day_1",
      day: 1,
      dueDate: due(1),
      label: "Monitor payment and replies",
      state: "monitoring",
      channel: "payment",
      sponsorTool: "clickhouse",
      trigger: "Watch for payment event, remittance reply, or dispute response.",
      evidence: ["ClickHouse action ledger", params.paymentLink ? "Payment link created" : "Payment link pending"]
    },
    {
      id: "wf_day_3",
      day: 3,
      dueDate: due(3),
      label: "Send polite follow-up",
      state: "scheduled",
      channel: "email",
      sponsorTool: "local",
      trigger: "No payment, reply, or dispute after three days.",
      evidence: [`Invoice ${demoInvoice.id}`, "Clause 5.1"]
    },
    {
      id: "wf_day_7",
      day: 7,
      dueDate: due(7),
      label: "Send firm notice with interest reminder",
      state: "scheduled",
      channel: "email",
      sponsorTool: "local",
      trigger: "No payment after seven days.",
      evidence: ["Clause 5.1", "Clause 5.3", "ClickHouse monitoring event"]
    },
    {
      id: "wf_day_14",
      day: 14,
      dueDate: due(14),
      label: "Notify finance and prepare escalation",
      state: "scheduled",
      channel: "slack",
      sponsorTool: "slack",
      trigger: "No payment after fourteen days.",
      evidence: ["Clause 9.2", "Campaign action history"]
    },
    {
      id: "wf_day_30",
      day: 30,
      dueDate: due(30),
      label: "Recommend collections handoff",
      state: "scheduled",
      channel: "system",
      sponsorTool: "prometheux",
      trigger: "No payment, no dispute, and risk remains high at day thirty.",
      evidence: ["Prometheux ontology", "ClickHouse event history", "Contract clauses"]
    }
  ];
}

function addDays(date: string, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function buildActions(params: {
  createdAt: string;
  clausesUsed: ContractClause[];
  tavilyState: string;
  ontologyState: string;
  stripeState: string;
  paymentLink?: string;
}): RecoveryAction[] {
  return [
    {
      id: "act_1",
      type: "contract_extract",
      label: "Extract contract terms",
      state: "completed",
      sponsorTool: "local",
      detail: `Extracted clauses ${params.clausesUsed.map((clause) => clause.id).join(", ")}.`,
      createdAt: params.createdAt,
      payload: { clauses: params.clausesUsed }
    },
    {
      id: "act_2",
      type: "web_research",
      label: "Research debtor context",
      state: params.tavilyState === "completed" ? "completed" : params.tavilyState === "failed" ? "failed" : "simulated",
      sponsorTool: "tavily",
      detail: "Open-web evidence collected for context grounding.",
      createdAt: new Date().toISOString(),
      payload: { state: params.tavilyState }
    },
    {
      id: "act_3",
      type: "ontology_reasoning",
      label: "Map recovery ontology",
      state:
        params.ontologyState === "completed"
          ? "completed"
          : params.ontologyState === "failed"
            ? "failed"
            : "simulated",
      sponsorTool: "prometheux",
      detail: "Invoice, clauses, debtor, evidence, action, and payment objects mapped to the recovery ontology.",
      createdAt: new Date().toISOString(),
      payload: { state: params.ontologyState }
    },
    {
      id: "act_4",
      type: "payment_link",
      label: "Create payment link",
      state: params.stripeState === "completed" ? "completed" : params.stripeState === "failed" ? "failed" : "simulated",
      sponsorTool: "stripe",
      detail: params.paymentLink ? "Payment link is ready." : "Payment link could not be created.",
      createdAt: new Date().toISOString(),
      payload: { paymentLink: params.paymentLink }
    },
    {
      id: "act_5",
      type: "email_draft",
      label: "Draft collection email",
      state: "approval_required",
      sponsorTool: "local",
      detail: "Email is generated but not automatically sent.",
      createdAt: new Date().toISOString(),
      payload: { autoSent: false }
    },
    {
      id: "act_6",
      type: "follow_up_schedule",
      label: "Schedule follow-up",
      state: "scheduled",
      sponsorTool: "local",
      detail: "Next follow-up scheduled for three business days after approval.",
      createdAt: new Date().toISOString(),
      payload: { offsetBusinessDays: 3 }
    }
  ];
}

function buildIntegrationStatus(params: {
  tavily: string;
  prometheux: string;
  prometheuxDetail?: string;
  stripe: string;
  slack: string;
  clickhouse: string;
  clickhouseDetail: string;
}): IntegrationRunStatus[] {
  return [
    {
      name: "tavily",
      state: params.tavily as IntegrationRunStatus["state"],
      detail: params.tavily === "completed" ? "Live web research completed" : "Open-web research"
    },
    {
      name: "prometheux",
      state: params.prometheux as IntegrationRunStatus["state"],
      detail:
        params.prometheux === "completed"
          ? "Ontology reasoning completed"
          : params.prometheuxDetail || "Ontology processing"
    },
    {
      name: "stripe",
      state: params.stripe as IntegrationRunStatus["state"],
      detail: "Checkout payment link"
    },
    {
      name: "slack",
      state: params.slack as IntegrationRunStatus["state"],
      detail: "Finance notification"
    },
    {
      name: "clickhouse",
      state: params.clickhouse as IntegrationRunStatus["state"],
      detail: params.clickhouseDetail
    }
  ];
}

function buildBrief(params: {
  campaignId: string;
  publicContextTarget: PublicContextTarget;
  daysOverdue: number;
  riskScore: number;
  clausesUsed: ContractClause[];
  evidence: Array<{ id: string; title: string; url: string; snippet: string }>;
  paymentLink?: string;
  workflow: CampaignWorkflowStep[];
}): string {
  const sources = params.evidence
    .map((source) => `- [${source.id}] ${source.title}: ${source.url}\n  ${source.snippet}`)
    .join("\n");
  const clauses = params.clausesUsed
    .map((clause) => `- Clause ${clause.id}, page ${clause.page}: ${clause.text}`)
    .join("\n");
  const workflow = params.workflow
    .map(
      (step) =>
        `- Day ${step.day} (${step.dueDate}): ${step.label} — ${step.trigger} [${step.state}]`
    )
    .join("\n");

  return `# Recovery Brief: ${demoInvoice.id}

Campaign: ${params.campaignId}

This is a synthetic invoice recovery scenario. Public web research about ${params.publicContextTarget.companyName} (${params.publicContextTarget.domain}) is used only to demonstrate source-grounded context gathering.

## Invoice

- Debtor: ${demoInvoice.debtorName}
- Amount: ${formatCurrency(demoInvoice.amount, demoInvoice.currency)}
- Due date: ${demoInvoice.dueDate}
- Days overdue: ${params.daysOverdue}
- Risk score: ${params.riskScore}/100

## Contract Grounds

${clauses}

## Open Web Evidence

${sources}

## 30-Day Autonomous Workflow

${workflow}

## Recommended Action

Prepare a firm but non-accusatory collection email. Cite Clause 5.1 for payment terms, Clause 5.3 for interest, and Clause 5.4 to invite any good-faith dispute details. Do not auto-send. Require human approval.

Payment link: ${params.paymentLink || "Pending Stripe test key"}
`;
}

function buildEmailDraft(params: {
  clausesUsed: ContractClause[];
  daysOverdue: number;
  paymentLink?: string;
}): string {
  const paymentClause = params.clausesUsed.find((clause) => clause.id === "5.1");
  const interestClause = params.clausesUsed.find((clause) => clause.id === "5.3");
  const disputeClause = params.clausesUsed.find((clause) => clause.id === "5.4");

  return `Subject: Action required: overdue invoice ${demoInvoice.id}

To: ${demoInvoice.debtorEmail}

Hi Accounts Payable team,

I am following up on invoice ${demoInvoice.id} for ${formatCurrency(
    demoInvoice.amount,
    demoInvoice.currency
  )}, issued on ${demoInvoice.issuedDate} and due on ${demoInvoice.dueDate}. It is currently ${params.daysOverdue} days overdue.

Under Clause ${paymentClause?.id} of ${demoContract.title}, ${paymentClause?.text}

If there is a good-faith dispute, Clause ${disputeClause?.id} asks that written notice include reasonable detail for the disputed line item. We have not logged a dispute against this invoice.

Please arrange payment using this link:
${params.paymentLink || "[Payment link pending Stripe test key]"}

If payment has already been sent, please reply with the remittance advice so we can reconcile it. If the invoice remains unpaid, Clause ${interestClause?.id} notes that late amounts may accrue interest as set out in the agreement.

Regards,

Finance Operations

---
Human approval required before sending. This draft was generated for a synthetic demo invoice and has not been sent automatically.
`;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency
  }).format(amount);
}
