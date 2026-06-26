export type IntegrationName =
  | "tavily"
  | "clickhouse"
  | "prometheux"
  | "stripe"
  | "slack"
  | "local";

export type IntegrationState =
  | "configured"
  | "missing"
  | "completed"
  | "simulated"
  | "skipped"
  | "failed";

export interface EnvStatus {
  tavily: boolean;
  clickhouse: boolean;
  prometheux: boolean;
  stripe: boolean;
  slack: boolean;
}

export interface ClickHouseLedgerStats {
  configured: boolean;
  state: "live" | "missing" | "failed";
  detail: string;
  rows: {
    agent_actions: number;
    agent_events: number;
    evidence_sources: number;
    source_action_trace: number;
    workflow_steps: number;
  };
}

export interface Invoice {
  id: string;
  debtorName: string;
  debtorEmail: string;
  amount: number;
  currency: "GBP" | "USD" | "EUR";
  issuedDate: string;
  dueDate: string;
  status: "overdue" | "paid" | "draft";
  description: string;
}

export interface ContractClause {
  id: string;
  title: string;
  page: number;
  text: string;
}

export interface Contract {
  id: string;
  title: string;
  effectiveDate: string;
  governingLaw: string;
  clauses: ContractClause[];
  sourceLabel: string;
}

export interface PublicContextTarget {
  companyName: string;
  domain: string;
  contextOnly: boolean;
}

export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: IntegrationName | "fallback";
  confidence: number;
  retrievedAt: string;
}

export interface OntologyNode {
  id: string;
  label: string;
  type: string;
  data: Record<string, string | number | boolean>;
}

export interface OntologyEdge {
  from: string;
  to: string;
  label: string;
}

export interface OntologyResult {
  state: IntegrationState;
  programme: string;
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  result?: unknown;
  error?: string;
}

export interface AgentEvent {
  id: string;
  occurredAt: string;
  type: string;
  sponsorTool: IntegrationName;
  summary: string;
  payload: Record<string, unknown>;
}

export interface RecoveryAction {
  id: string;
  type:
    | "contract_extract"
    | "web_research"
    | "ontology_reasoning"
    | "payment_link"
    | "slack_notification"
    | "email_draft"
    | "follow_up_schedule"
    | "workflow_advance"
    | "clickhouse_write";
  label: string;
  state: "completed" | "approval_required" | "scheduled" | "simulated" | "skipped" | "failed";
  sponsorTool: IntegrationName;
  detail: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface SourceActionTrace {
  id: string;
  claim: string;
  sourceLabel: string;
  sourceType: "invoice" | "contract" | "web" | "payment" | "system";
  action: string;
  actionType: RecoveryAction["type"];
  confidence: number;
}

export interface CampaignWorkflowStep {
  id: string;
  day: number;
  dueDate: string;
  label: string;
  state: "completed" | "approval_required" | "scheduled" | "monitoring" | "blocked";
  channel: "email" | "web" | "payment" | "slack" | "system";
  sponsorTool: IntegrationName;
  trigger: string;
  evidence: string[];
}

export interface IntegrationRunStatus {
  name: IntegrationName;
  state: IntegrationState;
  detail: string;
}

export interface CampaignRun {
  id: string;
  createdAt: string;
  asOfDate: string;
  invoice: Invoice;
  contract: Contract;
  publicContextTarget: PublicContextTarget;
  daysOverdue: number;
  riskScore: number;
  recoveryStage: "initial" | "firm_reminder" | "escalation";
  evidence: EvidenceSource[];
  clausesUsed: ContractClause[];
  actions: RecoveryAction[];
  sourceActionTrace: SourceActionTrace[];
  workflow: CampaignWorkflowStep[];
  events: AgentEvent[];
  ontology: OntologyResult;
  briefMarkdown: string;
  emailMarkdown: string;
  paymentLink?: string;
  slackMessage?: string;
  outputDir: string;
  integrationStatus: IntegrationRunStatus[];
}

export interface DemoPayload {
  invoice: Invoice;
  contract: Contract;
  publicContextTarget: PublicContextTarget;
  envStatus: EnvStatus;
}

export interface RunCampaignRequest {
  researchCompanyName?: string;
  researchDomain?: string;
}
