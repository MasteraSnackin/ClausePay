# System Architecture: ClausePay

## Overview

ClausePay is a full-stack demo application for autonomous B2B unpaid invoice recovery. It combines a React dashboard, an Express API, a TypeScript recovery agent, sponsor integrations and local artefact storage.

The system uses synthetic invoice and contract data. Tavily can research a real public company/domain for grounded context, but the app does not assert that the real company owes money.

## Key Requirements

- Run an autonomous recovery campaign from a dashboard or CLI.
- Use live Tavily web research for source grounding.
- Use live Prometheux ontology evaluation for recovery reasoning.
- Use live ClickHouse writes for evidence, actions, traces and workflow state.
- Keep generated emails human-approved rather than automatically sent.
- Preserve a local audit trail under `generated/campaigns/`.
- Degrade safely when Stripe or Slack credentials are absent.

## High-Level Architecture

```mermaid
flowchart LR
  Operator["Finance operator or judge"] --> Client["React dashboard"]
  CLI["CLI runner"] --> Agent["Recovery agent"]
  Client --> API["Express API"]

  subgraph Runtime["Node and TypeScript runtime"]
    API --> Agent
    Agent --> ClauseSelector["Clause selector"]
    Agent --> WorkflowBuilder["30 day workflow builder"]
    Agent --> TraceBuilder["Source action trace builder"]
    Agent --> ApprovalDraft["Human approval draft"]
  end

  Agent --> Tavily["Tavily Search API"]
  Agent --> Prometheux["Prometheux Vadalog API"]
  Agent --> Stripe["Stripe Checkout test mode"]
  Agent --> Slack["Slack webhook"]
  Agent --> ClickHouse[("ClickHouse operational ledger")]
  Agent --> Files[("generated/campaigns artefacts")]
  ClickHouse --> API
  Files --> API
  API --> Client
```

The dashboard and CLI both call the same recovery agent. The agent coordinates external services, builds the recovery campaign object, writes the operational ledger to ClickHouse, persists local files, and returns the campaign for display.

## Component Details

### React Dashboard

- Responsibilities: run campaigns, display readiness, show sources, trace actions, workflow steps, documents and approval state.
- Main technologies: React 19, Vite, lucide-react, CSS.
- Data owned or transformed: UI state only; campaign data is loaded from the API.
- External dependencies: Express API.
- Failure modes or concerns: long live source text can affect layout, so generated text uses wrapping and responsive constraints.

### Express API

- Responsibilities: expose demo data, readiness, campaign list, individual campaigns and campaign execution.
- Main technologies: Express, TypeScript, Vite middleware in development.
- Data owned or transformed: Zod validates campaign requests before the API passes them to the agent.
- External dependencies: local storage and the recovery agent.
- Failure modes or concerns: no authentication layer is currently implemented; structured API errors include request IDs for debugging.

### Recovery Agent

- Responsibilities: orchestrate invoice recovery, contract clause selection, Tavily research, Prometheux ontology evaluation, payment link creation, Slack notification, ClickHouse persistence and local artefacts.
- Main technologies: TypeScript.
- Data owned or transformed: `CampaignRun`, `RecoveryAction`, `SourceActionTrace`, `CampaignWorkflowStep`.
- External dependencies: Tavily, Prometheux, Stripe, Slack, ClickHouse.
- Failure modes or concerns: external providers may be unavailable; integrations return `completed`, `simulated` or `failed` states.

### ClickHouse Integration

- Responsibilities: create the `recover_ai` database, write/query operational ledger tables and append the final ClickHouse outcome event/action.
- Main technologies: `@clickhouse/client`.
- Data owned or transformed: events, evidence sources, actions, source-action trace and workflow steps.
- External dependencies: ClickHouse Cloud or compatible ClickHouse endpoint.
- Failure modes or concerns: credentials and network availability determine write success.

### Tavily Integration

- Responsibilities: run live web searches for public context and return source URLs/snippets.
- Main technologies: Tavily Search API through `fetch`.
- Data owned or transformed: source evidence records.
- External dependencies: Tavily API key.
- Failure modes or concerns: if the key is absent or the API fails, deterministic fallback sources are returned and marked as simulated/failed.

### Prometheux Integration

- Responsibilities: evaluate the generated Vadalog ontology programme.
- Main technologies: Prometheux `/vadalog/evaluate` API.
- Data owned or transformed: ontology nodes, edges, programme and result payload.
- External dependencies: Prometheux API token and active Prometheux compute.
- Failure modes or concerns: compute must be running; otherwise the API returns `NO_ACTIVE_COMPUTE`.

### Stripe Integration

- Responsibilities: create a test-mode Checkout session when credentials are present.
- Main technologies: Stripe SDK.
- Data owned or transformed: payment link URL and invoice metadata.
- External dependencies: Stripe secret key.
- Failure modes or concerns: currently simulated when `STRIPE_SECRET_KEY` is absent.

### Slack Integration

- Responsibilities: post finance notifications when a webhook is present.
- Main technologies: Slack incoming webhook.
- Data owned or transformed: campaign notification text.
- External dependencies: Slack webhook URL.
- Failure modes or concerns: currently simulated when `SLACK_WEBHOOK_URL` is absent.

## Data Flow

### DFD Level 0

```mermaid
flowchart LR
  Operator["External entity: operator"] -->|Run campaign| P1["P1 React dashboard"]
  P1 -->|POST /api/recovery/run| P2["P2 Express API"]
  P2 -->|Campaign command| P3["P3 Recovery agent"]

  P3 -->|Search queries| Tavily["External system: Tavily"]
  Tavily -->|Public source results| P3
  P3 -->|Vadalog programme| Prometheux["External system: Prometheux"]
  Prometheux -->|Ontology result| P3
  P3 -->|Checkout request| Stripe["External system: Stripe"]
  Stripe -->|Payment URL or simulation| P3
  P3 -->|Finance notification| Slack["External system: Slack"]

  P3 -->|Events actions traces workflow| D1[("D1 ClickHouse ledger")]
  P3 -->|Campaign JSON email brief ontology| D2[("D2 Local artefacts")]
  D1 -->|Row counts and campaign history| P2
  D2 -->|Generated outputs| P2
  P2 -->|CampaignRun response| P1
  P1 -->|Trace approval and outputs| Operator
```

This is the top-level data flow. The open-web action is Tavily research, Stripe is the transaction channel, Slack is the notification channel, Prometheux is the reasoning channel and ClickHouse is the audit ledger.

### DFD Level 1: Campaign Run

```mermaid
flowchart TD
  Start(["Campaign input"]) --> Validate["1 Validate request with Zod"]
  Validate --> LoadDemo["2 Load synthetic invoice and contract"]
  LoadDemo --> Clauses["3 Select payment and recovery clauses"]
  Clauses --> Research["4 Gather Tavily source evidence"]
  Research --> Ontology["5 Evaluate Prometheux ontology"]
  Ontology --> Payment["6 Create Stripe test link or simulation"]
  Payment --> Draft["7 Draft approval email and recovery brief"]
  Draft --> Workflow["8 Build 30 day autonomous workflow"]
  Workflow --> Notify["9 Post Slack notification or simulation"]
  Notify --> Ledger["10 Write ClickHouse ledger rows"]
  Ledger --> Artefacts["11 Persist generated campaign artefacts"]
  Artefacts --> Response(["CampaignRun returned to dashboard"])

  Clauses --> Trace["Source action trace"]
  Research --> Trace
  Ontology --> Trace
  Payment --> Trace
  Trace --> Ledger
```

The Level 1 view shows the single demo workflow: B2B unpaid invoice recovery and client collections. Each external provider result becomes either a real completed action or a recorded simulated/failed action, so the dashboard can show the exact operational state.

### Sequence Diagram

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant Dashboard
  participant API
  participant Agent
  participant Tavily
  participant Prometheux
  participant Stripe
  participant Slack
  participant ClickHouse
  participant Files

  User->>Dashboard: Run recovery agent
  Dashboard->>API: POST /api/recovery/run
  API->>Agent: runRecoveryCampaign()
  Agent->>Agent: Validate request and load demo invoice
  Agent->>Agent: Select contract clauses and draft proof plan
  Agent->>Tavily: Search public debtor context
  alt Tavily completed
    Tavily-->>Agent: Source URLs and snippets
  else Tavily unavailable
    Agent-->>Agent: Record simulated or failed source state
  end
  Agent->>Prometheux: Evaluate Vadalog programme
  alt Prometheux completed
    Prometheux-->>Agent: Ontology result
  else Prometheux unavailable
    Agent-->>Agent: Record degraded ontology state
  end
  Agent->>Stripe: Create test Checkout session
  alt Stripe key present
    Stripe-->>Agent: Payment link
  else Stripe key absent
    Agent-->>Agent: Generate simulated payment link
  end
  Agent->>Slack: Post finance notification
  alt Slack webhook present
    Slack-->>Agent: Notification accepted
  else Slack webhook absent
    Agent-->>Agent: Record simulated notification
  end
  Agent->>Agent: Build 30 day workflow and approval email
  Agent->>ClickHouse: Insert events sources actions traces workflow
  Agent->>ClickHouse: Append final ClickHouse outcome
  Agent->>Files: Persist generated artefacts
  Agent-->>API: CampaignRun
  API-->>Dashboard: CampaignRun
  Dashboard-->>User: Show sources actions workflow and approval draft
```

The campaign response is the same object persisted locally as `campaign.json`. ClickHouse is the operational ledger; local files are a demo-friendly artefact trail. The final ClickHouse action is appended after the main write so the ledger records that persistence itself happened.

## Data Model

Core shared types live in `src/shared/types.ts`.

```mermaid
erDiagram
  CAMPAIGN_RUN ||--|| INVOICE : recovers
  CAMPAIGN_RUN ||--|| CONTRACT : references
  CAMPAIGN_RUN ||--o{ EVIDENCE_SOURCE : grounds
  CAMPAIGN_RUN ||--o{ AGENT_EVENT : records
  CAMPAIGN_RUN ||--o{ RECOVERY_ACTION : performs
  CAMPAIGN_RUN ||--o{ SOURCE_ACTION_TRACE : proves
  CAMPAIGN_RUN ||--o{ WORKFLOW_STEP : schedules
  CONTRACT ||--o{ CONTRACT_CLAUSE : contains
  CONTRACT_CLAUSE ||--o{ SOURCE_ACTION_TRACE : supports
  EVIDENCE_SOURCE ||--o{ SOURCE_ACTION_TRACE : supports
  RECOVERY_ACTION ||--o{ SOURCE_ACTION_TRACE : explains

  CAMPAIGN_RUN {
    string campaign_id
    datetime created_at
    int days_overdue
    int risk_score
    string status
  }

  INVOICE {
    string invoice_id
    string debtor_name
    decimal amount_due
    datetime due_date
    string currency
  }

  CONTRACT {
    string contract_id
    string counterparty
    string governing_law
  }

  CONTRACT_CLAUSE {
    string clause_id
    string title
    string citation
  }

  EVIDENCE_SOURCE {
    string source_id
    string url
    string provider
    string status
  }

  RECOVERY_ACTION {
    string action_id
    string channel
    string status
    string sponsor_tool
  }

  SOURCE_ACTION_TRACE {
    string trace_id
    string fact
    string action_id
    string source_id
  }

  WORKFLOW_STEP {
    string step_id
    int day
    string action
    string status
  }
```

- `Invoice`: synthetic invoice facts.
- `Contract`: synthetic contract and clauses.
- `EvidenceSource`: Tavily or fallback source records.
- `OntologyResult`: generated graph, Vadalog programme and Prometheux result.
- `RecoveryAction`: agent actions and states.
- `SourceActionTrace`: fact-to-action proof chain.
- `CampaignWorkflowStep`: 30-day recovery schedule.
- `CampaignRun`: complete campaign response and persisted artefact.

ClickHouse tables:

- `agent_events`
- `evidence_sources`
- `agent_actions`
- `source_action_trace`
- `workflow_steps`

## Campaign State Model

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running: campaign requested
  Running --> EvidenceGathered: Tavily completed or fallback recorded
  EvidenceGathered --> Reasoned: Prometheux completed or fallback recorded
  Reasoned --> PaymentPrepared: Stripe link created or simulated
  PaymentPrepared --> Drafted: email brief and workflow generated
  Drafted --> Persisting: notification attempted
  Persisting --> AwaitingApproval: ClickHouse and files written
  AwaitingApproval --> ApprovedLocally: operator approves draft
  AwaitingApproval --> NeedsRevision: operator edits draft
  NeedsRevision --> AwaitingApproval: draft regenerated
  Running --> ProviderDegraded: provider timeout or error
  ProviderDegraded --> EvidenceGathered: degraded state logged
  Persisting --> PartialLedger: ClickHouse unavailable
  PartialLedger --> AwaitingApproval: local artefacts saved
  AwaitingApproval --> [*]
```

The live demo stops before email send. The agent generates an approval-ready draft and records the campaign state, but a human must approve any external email action.

## Infrastructure and Deployment

The app currently runs locally with:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

### Runtime Topology

```mermaid
flowchart LR
  Browser["Browser at localhost"] --> Node["Node process"]
  Node --> Vite["Vite frontend middleware"]
  Node --> Express["Express API routes"]
  Express --> Agent["Recovery agent"]
  Agent --> Env["Environment credentials"]
  Env --> Tavily["Tavily"]
  Env --> Prometheux["Prometheux"]
  Env --> ClickHouse["ClickHouse Cloud"]
  Env --> Stripe["Stripe test mode"]
  Env --> Slack["Slack webhook"]
  Agent --> Generated["generated/campaigns"]
  Express --> Generated
  Express --> ClickHouse
```

No hosted deployment target is configured yet. Add deployment details as `<ADD DETAIL>` when a target is chosen.

## Scalability and Reliability

- ClickHouse is suitable for high-volume append-only event and evidence records.
- The current Express server is a single-process demo server.
- The agent runs synchronously inside the request/CLI process.
- Long-running workflow execution is modelled, but not yet scheduled by a durable queue.
- External failures are recorded in integration states rather than crashing the dashboard path where possible.
- Tavily, Prometheux and Slack calls use explicit fetch timeouts to avoid hanging a demo request indefinitely.

Future production versions should move long-running campaigns into a durable job runner.

## Security and Compliance

- Secrets are loaded from `.env`, which is ignored by Git.
- The browser does not receive provider secrets.
- The demo has no user authentication or authorisation.
- The debt, invoice and contract are synthetic to avoid making claims about real organisations.
- Outbound email is not automatically sent; approval is local/human-in-the-loop.
- Stripe and Slack are action channels, but are safe simulated fallbacks unless credentials are present.
- ClickHouse records source and action evidence for auditability.
- Third-party provider outputs should be treated as untrusted evidence and reviewed before real-world action.

## Observability

- The dashboard exposes integration states and ClickHouse row counts.
- ClickHouse stores event/action/source/trace/workflow rows.
- Local campaign artefacts preserve the generated brief, email, ontology and ledger.
- There is no central log aggregation or alerting yet.

## Design Decisions and Trade-offs

- Synthetic finance data avoids legal and reputational risk while allowing live web grounding.
- A single TypeScript agent keeps the demo understandable, but a production system should split orchestration, scheduling and provider adapters more formally.
- ClickHouse is used as an append-only ledger, not as the source of invoice truth.
- The dashboard favours traceability and judge visibility over dense enterprise workflow controls.
- Stripe and Slack are integration-ready but intentionally optional so the sponsor demo can run without external side effects.

## Future Improvements

- Add authentication and role-based approval controls.
- Add durable campaign scheduling and retries.
- Add Stripe webhook handling for payment completion.
- Add Slack end-to-end demo credentials and channel controls.
- Add Playwright smoke tests and unit tests for agent builders.
- Add hosted deployment configuration.
- Add richer Prometheux ontology visualisation in the dashboard.
