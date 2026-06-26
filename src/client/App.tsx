import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Link2,
  ListChecks,
  Mail,
  MousePointerClick,
  Pencil,
  Play,
  Search,
  Send,
  ShieldCheck,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CampaignRun,
  CampaignWorkflowStep,
  ClickHouseLedgerStats,
  DemoPayload,
  IntegrationName,
  IntegrationRunStatus,
  RecoveryAction,
  SourceActionTrace
} from "../shared/types";

interface ReadinessPayload {
  clickhouse: ClickHouseLedgerStats;
}

interface ReceiptField {
  label: string;
  value: string;
  href?: string;
}

interface ActionReceipt {
  id: string;
  label: string;
  sponsorTool: IntegrationName;
  state: RecoveryAction["state"];
  detail: string;
  fields: ReceiptField[];
}

interface SponsorProof {
  sponsor: Exclude<IntegrationName, "local">;
  title: string;
  role: string;
  state: IntegrationRunStatus["state"];
  metric: string;
  detail: string;
  proofs: string[];
}

export function App() {
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRun[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<CampaignRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchCompanyName, setResearchCompanyName] = useState("");
  const [researchDomain, setResearchDomain] = useState("");
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [approvedCampaignIds, setApprovedCampaignIds] = useState<Set<string>>(() => new Set());
  const [advancingCampaignId, setAdvancingCampaignId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [editingCampaignLabel, setEditingCampaignLabel] = useState("");
  const [renamingCampaignId, setRenamingCampaignId] = useState<string | null>(null);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    const [demoResponse, campaignsResponse, readinessResponse] = await Promise.all([
      fetch("/api/demo"),
      fetch("/api/campaigns"),
      fetch("/api/readiness")
    ]);
    const demoPayload = (await demoResponse.json()) as DemoPayload;
    const campaignPayload = (await campaignsResponse.json()) as CampaignRun[];
    const readinessPayload = (await readinessResponse.json()) as ReadinessPayload;
    setDemo(demoPayload);
    setReadiness(readinessPayload);
    setResearchCompanyName(demoPayload.publicContextTarget.companyName);
    setResearchDomain(demoPayload.publicContextTarget.domain);
    setCampaigns(campaignPayload);
    setActiveCampaign(campaignPayload[0] || null);
  }

  async function runAgent() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/recovery/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ researchCompanyName, researchDomain })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const campaign = (await response.json()) as CampaignRun;
      setActiveCampaign(campaign);
      setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      await refreshReadiness();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Agent run failed");
    } finally {
      setIsRunning(false);
    }
  }

  async function refreshReadiness() {
    const response = await fetch("/api/readiness");
    setReadiness((await response.json()) as ReadinessPayload);
  }

  async function advanceCampaign(campaignId: string) {
    setAdvancingCampaignId(campaignId);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/advance`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const campaign = (await response.json()) as CampaignRun;
      setActiveCampaign(campaign);
      setCampaigns((current) => current.map((item) => (item.id === campaign.id ? campaign : item)));
      await refreshReadiness();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Campaign advance failed");
    } finally {
      setAdvancingCampaignId(null);
    }
  }

  function startRenamingCampaign(campaign: CampaignRun) {
    setEditingCampaignId(campaign.id);
    setEditingCampaignLabel(getCampaignDisplayName(campaign));
    setError(null);
  }

  function cancelRenamingCampaign() {
    setEditingCampaignId(null);
    setEditingCampaignLabel("");
  }

  async function renameCampaign(campaignId: string) {
    const label = editingCampaignLabel.trim();
    if (!label) {
      setError("Run name cannot be empty.");
      return;
    }

    setRenamingCampaignId(campaignId);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const campaign = (await response.json()) as CampaignRun;
      setActiveCampaign((current) => (current?.id === campaign.id ? campaign : current));
      setCampaigns((current) => current.map((item) => (item.id === campaign.id ? campaign : item)));
      cancelRenamingCampaign();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Run rename failed");
    } finally {
      setRenamingCampaignId(null);
    }
  }

  function markApproved(campaignId: string) {
    setApprovedCampaignIds((current) => new Set(current).add(campaignId));
  }

  const invoice = demo?.invoice;
  const statusCounts = useMemo(() => {
    if (!activeCampaign) return { completed: 0, review: 0, pending: 0 };
    return {
      completed: activeCampaign.actions.filter((action) => action.state === "completed").length,
      review: activeCampaign.actions.filter((action) => action.state === "approval_required").length,
      pending: activeCampaign.actions.filter((action) => ["scheduled", "simulated"].includes(action.state)).length
    };
  }, [activeCampaign]);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">ClausePay</p>
          <h1>Evidence-backed invoice recovery</h1>
        </div>
        <div className="sponsor-strip" aria-label="Sponsor integrations">
          <SponsorPill label="Tavily" active={demo?.envStatus.tavily} />
          <SponsorPill label="ClickHouse" active={demo?.envStatus.clickhouse} />
          <SponsorPill label="Prometheux" active={demo?.envStatus.prometheux} />
          <SponsorPill label="Stripe" active={demo?.envStatus.stripe} />
          <SponsorPill label="Slack" active={demo?.envStatus.slack} />
        </div>
      </section>

      <section className="layout-grid">
        <aside className="left-rail">
          <section className="panel">
            <div className="panel-heading">
              <FileText size={18} />
              <h2>Invoice</h2>
            </div>
            {invoice ? (
              <div className="invoice-block">
                <strong>{invoice.id}</strong>
                <span>{invoice.debtorName}</span>
                <b>{formatCurrency(invoice.amount, invoice.currency)}</b>
                <small>Due {invoice.dueDate}</small>
              </div>
            ) : (
              <div className="skeleton" />
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <Search size={18} />
              <h2>Public context</h2>
            </div>
            <label className="field-label" htmlFor="company">
              Company
            </label>
            <input
              id="company"
              value={researchCompanyName}
              onChange={(event) => setResearchCompanyName(event.target.value)}
              placeholder="ClickHouse"
            />
            <label className="field-label" htmlFor="domain">
              Domain
            </label>
            <input
              id="domain"
              value={researchDomain}
              onChange={(event) => setResearchDomain(event.target.value)}
              placeholder="clickhouse.com"
            />
            <p className="context-note">
              The debt is synthetic. This target is used only for live web grounding.
            </p>
            <button className="primary-button" type="button" onClick={runAgent} disabled={isRunning} aria-busy={isRunning}>
              {isRunning ? <Clock3 size={18} className="spin" /> : <Play size={18} />}
              {isRunning ? "Running agent" : "Run recovery agent"}
            </button>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <Activity size={18} />
              <h2>Runs</h2>
            </div>
            <div className="run-list">
              {campaigns.length === 0 && <span className="muted">No campaigns yet.</span>}
              {campaigns.map((campaign) => (
                <div className={campaign.id === activeCampaign?.id ? "run-item active" : "run-item"} key={campaign.id}>
                  {editingCampaignId === campaign.id ? (
                    <form
                      className="run-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void renameCampaign(campaign.id);
                      }}
                    >
                      <input
                        aria-label={`Rename run ${campaign.id}`}
                        autoFocus
                        maxLength={80}
                        value={editingCampaignLabel}
                        onChange={(event) => setEditingCampaignLabel(event.target.value)}
                      />
                      <div className="run-actions">
                        <button
                          aria-label="Save run name"
                          className="icon-button"
                          disabled={renamingCampaignId === campaign.id}
                          type="submit"
                        >
                          {renamingCampaignId === campaign.id ? <Clock3 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                        </button>
                        <button
                          aria-label="Cancel rename"
                          className="icon-button"
                          disabled={renamingCampaignId === campaign.id}
                          onClick={cancelRenamingCampaign}
                          type="button"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button className="run-select-button" type="button" onClick={() => setActiveCampaign(campaign)}>
                        <span>{getCampaignDisplayName(campaign)}</span>
                        {campaign.label && <small className="run-id">{campaign.id}</small>}
                        <small>{new Date(campaign.createdAt).toLocaleString()}</small>
                      </button>
                      <button
                        aria-label={`Rename run ${getCampaignDisplayName(campaign)}`}
                        className="icon-button run-edit-button"
                        type="button"
                        onClick={() => startRenamingCampaign(campaign)}
                      >
                        <Pencil size={16} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <Database size={18} />
              <h2>ClickHouse proof</h2>
            </div>
            <ClickHouseProof stats={readiness?.clickhouse} />
          </section>
        </aside>

        <section className="main-panel">
          {!activeCampaign ? (
            <EmptyState />
          ) : (
            <>
              <section className="metric-grid">
                <Metric icon={<Clock3 size={20} />} label="Days overdue" value={String(activeCampaign.daysOverdue)} />
                <Metric icon={<ShieldCheck size={20} />} label="Risk score" value={`${activeCampaign.riskScore}/100`} />
                <Metric icon={<CheckCircle2 size={20} />} label="Completed" value={String(statusCounts.completed)} />
                <Metric icon={<CalendarDays size={20} />} label="30-day steps" value={String(activeCampaign.workflow?.length || 0)} />
                <Metric
                  icon={<Mail size={20} />}
                  label="Needs approval"
                  value={approvedCampaignIds.has(activeCampaign.id) ? "0" : String(statusCounts.review)}
                />
              </section>

              <section className="content-grid">
                <SponsorProofPanel campaign={activeCampaign} clickHouseStats={readiness?.clickhouse} />
              </section>

              <section className="content-grid">
                <div className="panel wide">
                  <div className="panel-heading split">
                    <div>
                      <div className="heading-row">
                        <Database size={18} />
                        <h2>Agent timeline</h2>
                      </div>
                      <p>{activeCampaign.outputDir}</p>
                    </div>
                    <span className="status-badge">{activeCampaign.recoveryStage.replace("_", " ")}</span>
                  </div>
                  <div className="timeline">
                    {activeCampaign.actions.map((action) => (
                      <div className="timeline-row" key={action.id}>
                        <StatusDot state={action.state} />
                        <div>
                          <strong>{action.label}</strong>
                          <span>{action.detail}</span>
                        </div>
                        <small>{action.sponsorTool}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <Link2 size={18} />
                    <h2>Integrations</h2>
                  </div>
                  <div className="integration-list">
                    {activeCampaign.integrationStatus.map((status) => (
                      <IntegrationRow key={status.name} status={status} />
                    ))}
                  </div>
                </div>
              </section>

              <section className="content-grid">
                <ActionReceiptsPanel campaign={activeCampaign} clickHouseStats={readiness?.clickhouse} />
                <WorkflowPanel
                  campaign={activeCampaign}
                  isAdvancing={advancingCampaignId === activeCampaign.id}
                  onAdvance={advanceCampaign}
                />
              </section>

              <section className="content-grid">
                <TracePanel traces={activeCampaign.sourceActionTrace || []} />
                <div className="panel">
                  <div className="panel-heading">
                    <Send size={18} />
                    <h2>Payment</h2>
                  </div>
                  <div className="payment-box">
                    <span>{activeCampaign.paymentLink ? "Ready" : "Pending"}</span>
                    {activeCampaign.paymentLink ? (
                      <a href={activeCampaign.paymentLink} target="_blank" rel="noreferrer">
                        Open payment link
                      </a>
                    ) : (
                      <p>Stripe test key required.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="content-grid">
                <div className="panel wide">
                  <div className="panel-heading">
                    <Search size={18} />
                    <h2>Grounding sources</h2>
                  </div>
                  <div className="source-list">
                    {activeCampaign.evidence.map((source) => (
                      <a className="source-item" href={source.url} key={source.id} target="_blank" rel="noreferrer">
                        <strong>
                          {source.id}. {source.title}
                        </strong>
                        <span>{source.snippet}</span>
                        <small>
                          {source.source} confidence {Math.round(source.confidence * 100)}%
                          <ExternalLink size={13} />
                        </small>
                      </a>
                    ))}
                  </div>
                </div>
              </section>

              <section className="documents-grid">
                <DocumentPanel title="Recovery brief" markdown={activeCampaign.briefMarkdown} />
                <DocumentPanel
                  title="Email draft"
                  markdown={activeCampaign.emailMarkdown}
                  action={
                    <button
                      className={approvedCampaignIds.has(activeCampaign.id) ? "secondary-button approved" : "secondary-button"}
                      type="button"
                      onClick={() => markApproved(activeCampaign.id)}
                    >
                      <MousePointerClick size={16} />
                      {approvedCampaignIds.has(activeCampaign.id) ? "Approved locally" : "Mark approved"}
                    </button>
                  }
                />
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string; requestId?: string } };
    const message = payload.error?.message || `Request failed with status ${response.status}`;
    return payload.error?.requestId ? `${message} (${payload.error.requestId})` : message;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function SponsorPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      aria-label={`${label}: ${active ? "configured" : "missing"}`}
      className={active ? "sponsor-pill active" : "sponsor-pill"}
      title={`${label}: ${active ? "configured" : "missing"}`}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <CircleAlert size={32} />
      <h2>No campaign selected</h2>
      <p>Run the recovery agent to generate evidence, logs, actions, and outputs.</p>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusDot({ state }: { state: string }) {
  return <span className={`status-dot ${state}`} aria-label={state} />;
}

function IntegrationRow({ status }: { status: IntegrationRunStatus }) {
  return (
    <div className="integration-row" data-state={status.state}>
      <StatusDot state={status.state} />
      <div>
        <strong>{status.name}</strong>
        <span>{status.detail}</span>
      </div>
    </div>
  );
}

function SponsorProofPanel({
  campaign,
  clickHouseStats
}: {
  campaign: CampaignRun;
  clickHouseStats?: ClickHouseLedgerStats;
}) {
  const proofs = buildSponsorProofs(campaign, clickHouseStats);

  return (
    <div className="panel wide sponsor-proof-panel">
      <div className="panel-heading">
        <ShieldCheck size={18} />
        <h2>Sponsor proof</h2>
      </div>
      <div className="sponsor-proof-grid">
        {proofs.map((proof) => (
          <article className="sponsor-proof-card" data-state={proof.state} key={proof.sponsor}>
            <div className="proof-card-top">
              <strong>{proof.title}</strong>
              <span className="state-pill">{formatState(proof.state)}</span>
            </div>
            <p>{proof.role}</p>
            <b>{proof.metric}</b>
            <span>{proof.detail}</span>
            <ul>
              {proof.proofs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function ActionReceiptsPanel({
  campaign,
  clickHouseStats
}: {
  campaign: CampaignRun;
  clickHouseStats?: ClickHouseLedgerStats;
}) {
  const receipts = buildActionReceipts(campaign, clickHouseStats);

  return (
    <div className="panel wide">
      <div className="panel-heading">
        <ListChecks size={18} />
        <h2>Action receipts</h2>
      </div>
      <div className="receipt-grid">
        {receipts.map((receipt) => (
          <article className="receipt-card" data-state={receipt.state} key={receipt.id}>
            <div className="receipt-card-head">
              <StatusDot state={receipt.state} />
              <div>
                <strong>{receipt.label}</strong>
                <small>
                  {receipt.sponsorTool} · {formatState(receipt.state)}
                </small>
              </div>
            </div>
            <p>{receipt.detail}</p>
            <dl>
              {receipt.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>
                    {field.href ? (
                      <a href={field.href} target="_blank" rel="noreferrer">
                        {field.value}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      field.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function WorkflowPanel({
  campaign,
  isAdvancing,
  onAdvance
}: {
  campaign: CampaignRun;
  isAdvancing: boolean;
  onAdvance: (campaignId: string) => Promise<void>;
}) {
  const workflow = campaign.workflow || [];
  const nextStep = workflow.find((step) => step.state !== "completed" && step.state !== "blocked");
  const completedSteps = workflow.filter((step) => step.state === "completed").length;

  return (
    <div className="panel">
      <div className="panel-heading split">
        <div className="heading-row">
          <CalendarDays size={18} />
          <h2>30-day autonomous workflow</h2>
        </div>
        <button
          className="secondary-button workflow-advance-button"
          disabled={!nextStep || isAdvancing}
          onClick={() => onAdvance(campaign.id)}
          type="button"
        >
          {isAdvancing ? <Clock3 size={16} className="spin" /> : <Play size={16} />}
          {nextStep ? "Advance campaign day" : "Workflow complete"}
        </button>
      </div>
      <div className="workflow-progress">
        <strong>
          {completedSteps}/{workflow.length}
        </strong>
        <span>{nextStep ? `Next: Day ${nextStep.day} · ${nextStep.label}` : "All campaign steps complete"}</span>
      </div>
      <div className="workflow-list">
        {workflow.length === 0 && <span className="muted">Run a new campaign to generate the 30-day autonomous workflow.</span>}
        {workflow.map((step) => (
          <div
            className={
              step.id === nextStep?.id
                ? "workflow-step next"
                : step.state === "completed"
                  ? "workflow-step completed"
                  : "workflow-step"
            }
            key={step.id}
          >
            <div className="workflow-day">Day {step.day}</div>
            <div>
              <strong>{step.label}</strong>
              <span>{step.trigger}</span>
              <small>
                {step.dueDate} · {step.channel} · {step.state.replace("_", " ")}
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TracePanel({ traces }: { traces: SourceActionTrace[] }) {
  return (
    <div className="panel wide">
      <div className="panel-heading">
        <GitBranch size={18} />
        <h2>Source-to-action trace</h2>
      </div>
      <div className="trace-list">
        {traces.length === 0 && <span className="muted">Run a new campaign to generate source-to-action traceability.</span>}
        {traces.map((trace) => (
          <div className="trace-row" key={trace.id}>
            <div>
              <strong>{trace.claim}</strong>
              <span>{trace.sourceLabel}</span>
            </div>
            <div>
              <small>{trace.sourceType}</small>
              <b>{trace.action}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClickHouseProof({ stats }: { stats?: ClickHouseLedgerStats }) {
  if (!stats) {
    return <div className="proof-box muted">Checking ledger.</div>;
  }

  return (
    <div className={`proof-box ${stats.state}`}>
      <div>
        <strong>{stats.state === "live" ? "Live ledger" : stats.state}</strong>
        <span>{stats.detail}</span>
      </div>
      <dl>
        <div>
          <dt>Actions</dt>
          <dd>{stats.rows.agent_actions}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{stats.rows.agent_events}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{stats.rows.evidence_sources}</dd>
        </div>
        <div>
          <dt>Trace</dt>
          <dd>{stats.rows.source_action_trace}</dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd>{stats.rows.workflow_steps}</dd>
        </div>
      </dl>
    </div>
  );
}

function DocumentPanel({ title, markdown, action }: { title: string; markdown: string; action?: React.ReactNode }) {
  return (
    <div className="panel document-panel">
      <div className="panel-heading split">
        <div className="heading-row">
          <FileText size={18} />
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      <pre>{markdown}</pre>
    </div>
  );
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency
  }).format(amount);
}

function getCampaignDisplayName(campaign: CampaignRun): string {
  return campaign.label?.trim() || campaign.id;
}

function buildSponsorProofs(campaign: CampaignRun, clickHouseStats?: ClickHouseLedgerStats): SponsorProof[] {
  const tavilyStatus = getIntegrationStatus(campaign, "tavily");
  const prometheuxStatus = getIntegrationStatus(campaign, "prometheux");
  const clickhouseStatus = getIntegrationStatus(campaign, "clickhouse");
  const stripeStatus = getIntegrationStatus(campaign, "stripe");
  const slackStatus = getIntegrationStatus(campaign, "slack");
  const tavilySources = campaign.evidence.filter((source) => source.source === "tavily");
  const ontologyLines = countLines(campaign.ontology.programme);
  const campaignLedgerRows = getCampaignLedgerRowCount(campaign);
  const paymentAction = campaign.actions.find((action) => action.type === "payment_link");
  const slackAction = campaign.actions.find((action) => action.type === "slack_notification");

  return [
    {
      sponsor: "tavily",
      title: "Tavily",
      role: "Open-web source grounding",
      state: tavilyStatus?.state || "missing",
      metric: `${campaign.evidence.length} sources`,
      detail: `${campaign.publicContextTarget.companyName} · ${campaign.publicContextTarget.domain}`,
      proofs: [
        tavilySources.length > 0 ? `${tavilySources.length} live Tavily results` : "Fallback sources clearly marked",
        campaign.evidence[0]?.url || "No source URL captured",
        "Sources feed the brief and trace"
      ]
    },
    {
      sponsor: "prometheux",
      title: "Prometheux",
      role: "Ontology reasoning",
      state: prometheuxStatus?.state || "missing",
      metric: `${campaign.ontology.nodes.length} nodes · ${campaign.ontology.edges.length} edges`,
      detail: prometheuxStatus?.detail || "Ontology status unavailable",
      proofs: [
        `${ontologyLines} Vadalog programme lines`,
        `${campaign.clausesUsed.length} contract clauses mapped`,
        "Ontology artefacts saved per campaign"
      ]
    },
    {
      sponsor: "clickhouse",
      title: "ClickHouse",
      role: "Operational action ledger",
      state: clickhouseStatus?.state || "missing",
      metric: `${campaignLedgerRows} campaign rows`,
      detail: clickhouseStatus?.detail || clickHouseStats?.detail || "Ledger status unavailable",
      proofs: [
        "agent_events, evidence_sources, agent_actions",
        "source_action_trace and workflow_steps",
        clickHouseStats?.state === "live" ? "Readiness confirms live ledger" : "Local artefacts retained"
      ]
    },
    {
      sponsor: "stripe",
      title: "Stripe",
      role: "Test payment transaction link",
      state: stripeStatus?.state || "missing",
      metric: campaign.paymentLink ? "Link ready" : "Link pending",
      detail: paymentAction?.detail || stripeStatus?.detail || "Payment status unavailable",
      proofs: [
        campaign.paymentLink || "No payment URL captured",
        "Payment link added to email draft",
        "Payment action appears in trace"
      ]
    },
    {
      sponsor: "slack",
      title: "Slack",
      role: "Finance notification orchestration",
      state: slackStatus?.state || "missing",
      metric: slackStatus?.state === "completed" ? "Notified" : formatState(slackStatus?.state || "missing"),
      detail: slackAction?.detail || slackStatus?.detail || "Notification status unavailable",
      proofs: [
        campaign.slackMessage || "Notification message unavailable",
        "Campaign ID and amount included",
        "Action recorded before ledger write"
      ]
    }
  ];
}

function buildActionReceipts(campaign: CampaignRun, clickHouseStats?: ClickHouseLedgerStats): ActionReceipt[] {
  return campaign.actions.map((action) => ({
    id: action.id,
    label: action.label,
    sponsorTool: action.sponsorTool,
    state: action.state,
    detail: action.detail,
    fields: buildReceiptFields(action, campaign, clickHouseStats)
  }));
}

function buildReceiptFields(
  action: RecoveryAction,
  campaign: CampaignRun,
  clickHouseStats?: ClickHouseLedgerStats
): ReceiptField[] {
  const topSource = campaign.evidence[0];
  const maxWorkflowDay = campaign.workflow.reduce((max, step) => Math.max(max, step.day), 0);
  const integration = getIntegrationStatus(campaign, action.sponsorTool);

  switch (action.type) {
    case "contract_extract":
      return [
        { label: "Contract", value: `${campaign.contract.id} · ${campaign.contract.governingLaw}` },
        { label: "Clauses", value: campaign.clausesUsed.map((clause) => `Clause ${clause.id}`).join(", ") },
        { label: "Source", value: campaign.contract.sourceLabel }
      ];
    case "web_research":
      return [
        { label: "Provider", value: `Tavily · ${formatState(integration?.state || action.state)}` },
        { label: "Sources", value: `${campaign.evidence.length} unique sources` },
        {
          label: "Top source",
          value: topSource?.title || "No source captured",
          href: topSource?.url
        }
      ];
    case "ontology_reasoning":
      return [
        { label: "Provider", value: `Prometheux · ${formatState(campaign.ontology.state)}` },
        { label: "Graph", value: `${campaign.ontology.nodes.length} nodes, ${campaign.ontology.edges.length} edges` },
        { label: "Programme", value: `${countLines(campaign.ontology.programme)} Vadalog lines` }
      ];
    case "payment_link":
      return [
        { label: "Provider", value: `Stripe · ${formatState(integration?.state || action.state)}` },
        {
          label: "Payment URL",
          value: campaign.paymentLink || "Pending Stripe test key",
          href: campaign.paymentLink
        },
        {
          label: "Invoice",
          value: `${campaign.invoice.id} · ${formatCurrency(campaign.invoice.amount, campaign.invoice.currency)}`
        }
      ];
    case "email_draft":
      return [
        { label: "Approval", value: "Human approval required" },
        { label: "Auto-send", value: "Blocked" },
        { label: "Clauses cited", value: campaign.clausesUsed.map((clause) => clause.id).join(", ") }
      ];
    case "follow_up_schedule":
      return [
        { label: "Window", value: `${campaign.workflow.length} steps over ${maxWorkflowDay} days` },
        { label: "Next scheduled", value: campaign.workflow.find((step) => step.state === "scheduled")?.label || "None" },
        { label: "Monitoring", value: "Payment, reply, dispute and ledger events" }
      ];
    case "workflow_advance":
      return [
        { label: "Day", value: `Day ${numberPayload(action, "day") ?? "unknown"}` },
        { label: "Channel", value: stringPayload(action, "channel") || "system" },
        { label: "Due date", value: stringPayload(action, "dueDate") || "not recorded" },
        { label: "Ledger", value: "Appended event, action and workflow step" }
      ];
    case "slack_notification":
      return [
        { label: "Provider", value: `Slack · ${formatState(integration?.state || action.state)}` },
        { label: "Message", value: truncateMiddle(campaign.slackMessage || "No Slack message captured", 120) },
        { label: "Campaign", value: campaign.id }
      ];
    case "clickhouse_write":
      return [
        { label: "Provider", value: `ClickHouse · ${formatState(integration?.state || action.state)}` },
        { label: "Campaign rows", value: String(getCampaignLedgerRowCount(campaign)) },
        {
          label: "Ledger",
          value: clickHouseStats?.state === "live" ? "Live ledger confirmed" : integration?.detail || "Ledger write recorded"
        }
      ];
    default:
      return [
        { label: "Sponsor", value: action.sponsorTool },
        { label: "State", value: formatState(action.state) },
        { label: "Campaign", value: campaign.id }
      ];
  }
}

function getIntegrationStatus(campaign: CampaignRun, name: IntegrationName): IntegrationRunStatus | undefined {
  return campaign.integrationStatus.find((status) => status.name === name);
}

function getCampaignLedgerRowCount(campaign: CampaignRun): number {
  return (
    campaign.events.length +
    campaign.evidence.length +
    campaign.actions.length +
    campaign.sourceActionTrace.length +
    campaign.workflow.length
  );
}

function countLines(value: string): number {
  return value.split("\n").filter((line) => line.trim().length > 0).length;
}

function formatState(state: string): string {
  return state.replace(/_/g, " ");
}

function stringPayload(action: RecoveryAction, key: string): string | undefined {
  const value = action.payload[key];
  return typeof value === "string" ? value : undefined;
}

function numberPayload(action: RecoveryAction, key: string): number | undefined {
  const value = action.payload[key];
  return typeof value === "number" ? value : undefined;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}
