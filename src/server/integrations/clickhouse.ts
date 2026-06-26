import { createClient } from "@clickhouse/client";
import type { AgentEvent, CampaignRun, CampaignWorkflowStep, ClickHouseLedgerStats, RecoveryAction } from "../../shared/types";

export async function writeCampaignToClickHouse(
  campaign: CampaignRun
): Promise<{ state: "completed" | "simulated" | "failed"; detail: string }> {
  if (!process.env.CLICKHOUSE_URL) {
    return {
      state: "simulated",
      detail: "CLICKHOUSE_URL is missing; campaign persisted locally only."
    };
  }

  const database = process.env.CLICKHOUSE_DATABASE || "recover_ai";
  const client = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USERNAME || "default",
    password: process.env.CLICKHOUSE_PASSWORD || undefined
  });

  try {
    await ensureClickHouseSchema(client, database);

    await client.insert({
      table: `${quoteIdentifier(database)}.agent_events`,
      values: campaign.events.map((event) => ({
        event_id: event.id,
        campaign_id: campaign.id,
        invoice_id: campaign.invoice.id,
        occurred_at: event.occurredAt,
        event_type: event.type,
        sponsor_tool: event.sponsorTool,
        summary: event.summary,
        payload_json: JSON.stringify(event.payload)
      })),
      format: "JSONEachRow"
    });

    await client.insert({
      table: `${quoteIdentifier(database)}.evidence_sources`,
      values: campaign.evidence.map((source) => ({
        evidence_id: source.id,
        campaign_id: campaign.id,
        invoice_id: campaign.invoice.id,
        retrieved_at: source.retrievedAt,
        title: source.title,
        url: source.url,
        source: source.source,
        confidence: source.confidence,
        snippet: source.snippet,
        payload_json: JSON.stringify(source)
      })),
      format: "JSONEachRow"
    });

    await client.insert({
      table: `${quoteIdentifier(database)}.agent_actions`,
      values: campaign.actions.map((action) => ({
        action_id: action.id,
        campaign_id: campaign.id,
        invoice_id: campaign.invoice.id,
        created_at: action.createdAt,
        action_type: action.type,
        state: action.state,
        sponsor_tool: action.sponsorTool,
        label: action.label,
        detail: action.detail,
        payload_json: JSON.stringify(action.payload)
      })),
      format: "JSONEachRow"
    });
    await client.insert({
      table: `${quoteIdentifier(database)}.source_action_trace`,
      values: campaign.sourceActionTrace.map((trace) => ({
        trace_id: trace.id,
        campaign_id: campaign.id,
        invoice_id: campaign.invoice.id,
        source_type: trace.sourceType,
        source_label: trace.sourceLabel,
        action_type: trace.actionType,
        claim: trace.claim,
        action: trace.action,
        confidence: trace.confidence,
        payload_json: JSON.stringify(trace)
      })),
      format: "JSONEachRow"
    });
    await client.insert({
      table: `${quoteIdentifier(database)}.workflow_steps`,
      values: campaign.workflow.map((step) => ({
        step_id: step.id,
        campaign_id: campaign.id,
        invoice_id: campaign.invoice.id,
        day: step.day,
        due_date: step.dueDate,
        label: step.label,
        state: step.state,
        channel: step.channel,
        sponsor_tool: step.sponsorTool,
        trigger: step.trigger,
        evidence: step.evidence,
        payload_json: JSON.stringify(step)
      })),
      format: "JSONEachRow"
    });

    return {
      state: "completed",
      detail: `Wrote ${campaign.events.length} events, ${campaign.evidence.length} sources, ${campaign.actions.length} actions, ${campaign.sourceActionTrace.length} trace links, and ${campaign.workflow.length} workflow steps to ClickHouse.`
    };
  } catch (error) {
    return {
      state: "failed",
      detail: error instanceof Error ? error.message : "ClickHouse write failed."
    };
  } finally {
    await client.close();
  }
}

export async function appendClickHouseOutcome(
  campaign: CampaignRun,
  event: AgentEvent,
  action: RecoveryAction
): Promise<{ state: "completed" | "simulated" | "failed"; detail: string }> {
  if (!process.env.CLICKHOUSE_URL) {
    return {
      state: "simulated",
      detail: "CLICKHOUSE_URL is missing; final ClickHouse outcome was not appended."
    };
  }

  const database = process.env.CLICKHOUSE_DATABASE || "recover_ai";
  const client = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USERNAME || "default",
    password: process.env.CLICKHOUSE_PASSWORD || undefined
  });

  try {
    await ensureClickHouseSchema(client, database);

    await client.insert({
      table: `${quoteIdentifier(database)}.agent_events`,
      values: [
        {
          event_id: event.id,
          campaign_id: campaign.id,
          invoice_id: campaign.invoice.id,
          occurred_at: event.occurredAt,
          event_type: event.type,
          sponsor_tool: event.sponsorTool,
          summary: event.summary,
          payload_json: JSON.stringify(event.payload)
        }
      ],
      format: "JSONEachRow"
    });

    await client.insert({
      table: `${quoteIdentifier(database)}.agent_actions`,
      values: [
        {
          action_id: action.id,
          campaign_id: campaign.id,
          invoice_id: campaign.invoice.id,
          created_at: action.createdAt,
          action_type: action.type,
          state: action.state,
          sponsor_tool: action.sponsorTool,
          label: action.label,
          detail: action.detail,
          payload_json: JSON.stringify(action.payload)
        }
      ],
      format: "JSONEachRow"
    });

    return {
      state: "completed",
      detail: "Final ClickHouse outcome event and action appended."
    };
  } catch (error) {
    return {
      state: "failed",
      detail: error instanceof Error ? error.message : "ClickHouse outcome append failed."
    };
  } finally {
    await client.close();
  }
}

export async function appendWorkflowAdvanceToClickHouse(
  campaign: CampaignRun,
  event: AgentEvent,
  action: RecoveryAction,
  step: CampaignWorkflowStep
): Promise<{ state: "completed" | "simulated" | "failed"; detail: string }> {
  if (!process.env.CLICKHOUSE_URL) {
    return {
      state: "simulated",
      detail: `CLICKHOUSE_URL is missing; Day ${step.day} advancement was persisted locally only.`
    };
  }

  const database = process.env.CLICKHOUSE_DATABASE || "recover_ai";
  const client = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USERNAME || "default",
    password: process.env.CLICKHOUSE_PASSWORD || undefined
  });

  try {
    await ensureClickHouseSchema(client, database);
    await client.insert({
      table: `${quoteIdentifier(database)}.agent_events`,
      values: [
        {
          event_id: event.id,
          campaign_id: campaign.id,
          invoice_id: campaign.invoice.id,
          occurred_at: event.occurredAt,
          event_type: event.type,
          sponsor_tool: event.sponsorTool,
          summary: event.summary,
          payload_json: JSON.stringify(event.payload)
        }
      ],
      format: "JSONEachRow"
    });

    await client.insert({
      table: `${quoteIdentifier(database)}.agent_actions`,
      values: [
        {
          action_id: action.id,
          campaign_id: campaign.id,
          invoice_id: campaign.invoice.id,
          created_at: action.createdAt,
          action_type: action.type,
          state: action.state,
          sponsor_tool: action.sponsorTool,
          label: action.label,
          detail: action.detail,
          payload_json: JSON.stringify(action.payload)
        }
      ],
      format: "JSONEachRow"
    });

    await client.insert({
      table: `${quoteIdentifier(database)}.workflow_steps`,
      values: [
        {
          step_id: step.id,
          campaign_id: campaign.id,
          invoice_id: campaign.invoice.id,
          day: step.day,
          due_date: step.dueDate,
          label: step.label,
          state: step.state,
          channel: step.channel,
          sponsor_tool: step.sponsorTool,
          trigger: step.trigger,
          evidence: step.evidence,
          payload_json: JSON.stringify(step)
        }
      ],
      format: "JSONEachRow"
    });

    return {
      state: "completed",
      detail: `Advanced Day ${step.day} and appended 1 event, 1 action, and 1 workflow step to ClickHouse.`
    };
  } catch (error) {
    return {
      state: "failed",
      detail: error instanceof Error ? error.message : "ClickHouse workflow advance append failed."
    };
  } finally {
    await client.close();
  }
}

export async function getClickHouseLedgerStats(): Promise<ClickHouseLedgerStats> {
  if (!process.env.CLICKHOUSE_URL) {
    return {
      configured: false,
      state: "missing",
      detail: "CLICKHOUSE_URL is missing.",
      rows: {
        agent_actions: 0,
        agent_events: 0,
        evidence_sources: 0,
        source_action_trace: 0,
        workflow_steps: 0
      }
    };
  }

  const database = process.env.CLICKHOUSE_DATABASE || "recover_ai";
  const client = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USERNAME || "default",
    password: process.env.CLICKHOUSE_PASSWORD || undefined
  });

  try {
    const result = await client.query({
      query: `
        SELECT
          table,
          sum(rows) AS rows
        FROM system.parts
        WHERE database = {database:String}
          AND table IN ('agent_actions', 'agent_events', 'evidence_sources', 'source_action_trace', 'workflow_steps')
          AND active
        GROUP BY table
      `,
      query_params: { database },
      format: "JSONEachRow"
    });
    const rows = (await result.json()) as Array<{ table: keyof ClickHouseLedgerStats["rows"]; rows: string }>;
    const stats: ClickHouseLedgerStats["rows"] = {
      agent_actions: 0,
      agent_events: 0,
      evidence_sources: 0,
      source_action_trace: 0,
      workflow_steps: 0
    };

    for (const row of rows) {
      stats[row.table] = Number(row.rows);
    }

    return {
      configured: true,
      state: "live",
      detail: `Connected to ${database}.`,
      rows: stats
    };
  } catch (error) {
    return {
      configured: true,
      state: "failed",
      detail: error instanceof Error ? error.message : "ClickHouse stats query failed.",
      rows: {
        agent_actions: 0,
        agent_events: 0,
        evidence_sources: 0,
        source_action_trace: 0,
        workflow_steps: 0
      }
    };
  } finally {
    await client.close();
  }
}

async function ensureClickHouseSchema(client: ReturnType<typeof createClient>, database: string): Promise<void> {
  await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)}` });
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(database)}.agent_events (
        event_id String,
        campaign_id String,
        invoice_id String,
        occurred_at DateTime64(3),
        event_type LowCardinality(String),
        sponsor_tool LowCardinality(String),
        summary String,
        payload_json String
      )
      ENGINE = MergeTree
      ORDER BY (campaign_id, occurred_at, event_id)
    `
  });
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(database)}.evidence_sources (
        evidence_id String,
        campaign_id String,
        invoice_id String,
        retrieved_at DateTime64(3),
        title String,
        url String,
        source LowCardinality(String),
        confidence Float32,
        snippet String,
        payload_json String
      )
      ENGINE = MergeTree
      ORDER BY (campaign_id, retrieved_at, evidence_id)
    `
  });
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(database)}.agent_actions (
        action_id String,
        campaign_id String,
        invoice_id String,
        created_at DateTime64(3),
        action_type LowCardinality(String),
        state LowCardinality(String),
        sponsor_tool LowCardinality(String),
        label String,
        detail String,
        payload_json String
      )
      ENGINE = MergeTree
      ORDER BY (campaign_id, created_at, action_id)
    `
  });
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(database)}.source_action_trace (
        trace_id String,
        campaign_id String,
        invoice_id String,
        source_type LowCardinality(String),
        source_label String,
        action_type LowCardinality(String),
        claim String,
        action String,
        confidence Float32,
        payload_json String
      )
      ENGINE = MergeTree
      ORDER BY (campaign_id, trace_id)
    `
  });
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(database)}.workflow_steps (
        step_id String,
        campaign_id String,
        invoice_id String,
        day UInt8,
        due_date Date,
        label String,
        state LowCardinality(String),
        channel LowCardinality(String),
        sponsor_tool LowCardinality(String),
        trigger String,
        evidence Array(String),
        payload_json String
      )
      ENGINE = MergeTree
      ORDER BY (campaign_id, day, step_id)
    `
  });
}

function quoteIdentifier(value: string): string {
  return `\`${value.replace(/`/g, "``")}\``;
}
