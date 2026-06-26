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
  Play,
  Search,
  Send,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CampaignRun,
  CampaignWorkflowStep,
  ClickHouseLedgerStats,
  DemoPayload,
  IntegrationRunStatus,
  RecoveryAction,
  SourceActionTrace
} from "../shared/types";

interface ReadinessPayload {
  clickhouse: ClickHouseLedgerStats;
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
                <button
                  className={campaign.id === activeCampaign?.id ? "run-item active" : "run-item"}
                  key={campaign.id}
                  type="button"
                  onClick={() => setActiveCampaign(campaign)}
                >
                  <span>{campaign.id}</span>
                  <small>{new Date(campaign.createdAt).toLocaleString()}</small>
                </button>
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
                <RealActionsPanel actions={activeCampaign.actions} />
                <WorkflowPanel workflow={activeCampaign.workflow || []} />
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

function RealActionsPanel({ actions }: { actions: RecoveryAction[] }) {
  return (
    <div className="panel wide">
      <div className="panel-heading">
        <ListChecks size={18} />
        <h2>Real actions taken</h2>
      </div>
      <div className="action-grid">
        {actions.map((action) => (
          <div className="action-card" key={action.id}>
            <div className="action-card-head">
              <StatusDot state={action.state} />
              <strong>{action.label}</strong>
            </div>
            <span>{action.detail}</span>
            <small>
              {action.sponsorTool} · {action.state.replace("_", " ")}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowPanel({ workflow }: { workflow: CampaignWorkflowStep[] }) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <CalendarDays size={18} />
        <h2>30-day autonomous workflow</h2>
      </div>
      <div className="workflow-list">
        {workflow.length === 0 && <span className="muted">Run a new campaign to generate the 30-day autonomous workflow.</span>}
        {workflow.map((step) => (
          <div className="workflow-step" key={step.id}>
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
