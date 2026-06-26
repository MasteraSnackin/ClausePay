## Research Question

As of 26 June 2026, what is the strongest technical direction for ClausePay's sponsor-backed demo, and what should be improved next without changing the product scope?

Decision-changing evidence would be:

- Tavily lacking source-bearing search or URL extraction support.
- ClickHouse not fitting append-only operational event storage.
- Prometheux not fitting executable ontology or lineage-style reasoning.
- A lower-risk sponsor combination that better satisfies "publish, monitor, orchestrate, transact - grounded in real sources".

## Sources Checked

- Tavily Search API documentation: https://docs.tavily.com/documentation/api-reference/endpoint/search
- Tavily Extract API documentation: https://docs.tavily.com/documentation/api-reference/endpoint/extract
- ClickHouse JavaScript client documentation: https://clickhouse.com/docs/integrations/javascript
- ClickHouse HTTP interface documentation: https://clickhouse.com/docs/interfaces/http
- Prometheux API overview: https://docs.prometheux.ai/api
- Prometheux REST API documentation: https://docs.prometheux.ai/api/rest-api
- Prometheux Vadalog documentation: https://docs.prometheux.ai/learn/vadalog

## Findings

Facts from official documentation:

- Tavily Search executes authenticated search queries and returns result objects with source URLs, content snippets, scores and request IDs.
- Tavily Search supports different `search_depth` settings, which is relevant because depth affects latency, relevance and credit cost.
- Tavily Extract can extract content from one or more provided URLs. It supports `urls`, optional query-based reranking, `chunks_per_source`, `extract_depth`, output format and per-request timeout.
- ClickHouse's JavaScript client has dedicated `query`, `insert`, `command`, `ping` and `close` methods. This matches ClausePay's current use of commands for table creation, inserts for ledger rows and queries for readiness counts.
- ClickHouse insert responses are intentionally minimal, so ClausePay should treat successful inserts as ledger side effects and verify with row counts/readiness rather than expecting rich insert payloads.
- Prometheux positions ontologies as directly executable models with entities, relationships, semantics, constraints and query/processing logic.
- Prometheux documentation describes lineage and traceability as part of the platform model, which aligns with ClausePay's source-to-action trace.

Project-specific observations:

- ClausePay now has live Tavily Search, live Prometheux evaluation and live ClickHouse writes.
- The app records 8 actions, 8 events, 8 sources, 7 source-action trace rows and 6 workflow steps in the current happy path.
- Tavily search has been hardened to tolerate partial query failure by preserving successful query results.
- ClickHouse writes now append the final ledger outcome and close clients on failure paths.
- Stripe and Slack are still simulated because credentials are not configured.

Inference:

- The current sponsor stack is the strongest demo core because it proves grounded research, ontology reasoning and durable operational persistence with three live sponsors.
- Tavily Extract is the best next research experiment because it deepens source quality without changing the product category.
- Broadening into rent, vendor payments or consumer debt would dilute the demo and create avoidable legal/product ambiguity.

## Options

### Option 1: Keep Current Search-Only Tavily Flow

- Pros: already live, fast, reliable enough for demo, and visible in the dashboard.
- Cons: snippets can be shallow and uneven.
- Best for: judging where the goal is to prove open-web action quickly.

### Option 2: Add Optional Tavily Extract After Search

- Pros: stronger citations, deeper source snippets and better source-to-action trace quality.
- Cons: more API calls, more latency, more failure modes and extra credit usage.
- Best for: final polish if judges inspect evidence quality deeply.

### Option 3: Add Stripe and Slack Live Credentials

- Pros: improves the "transact" and "notify" story.
- Cons: requires credentials and careful demo safety.
- Best for: only after Tavily, Prometheux and ClickHouse remain stable.

## Recommendation

Keep the current sponsor stack as the core demo:

- Tavily for open-web research.
- Prometheux for executable ontology evaluation.
- ClickHouse for auditable action/evidence/workflow persistence.

The smallest useful next experiment is optional Tavily Extract for the top 1-2 Tavily Search results. Store extracted snippets in ClickHouse and surface them in the source-to-action trace. Do not broaden the product scope beyond B2B unpaid invoice/client collection.

## Unknowns

- Exact judging weight for "transact" versus "grounded source/action proof".
- Whether Prometheux compute will remain available during the live presentation.
- Whether Stripe and Slack credentials will be available before submission.
- Whether Tavily Extract latency is acceptable inside the dashboard button flow.
- Whether extracted source text needs summarisation before display to avoid overwhelming the dashboard.

## Next Experiment

Add an optional `TAVILY_USE_EXTRACT=true` mode:

1. Run Tavily Search as today.
2. Select the top 1-2 successful source URLs.
3. Call Tavily Extract with `extract_depth: "basic"`, `format: "markdown"` and a short timeout.
4. Store extracted snippets in ClickHouse as evidence metadata.
5. Link extracted snippets to the email draft and source-to-action trace.
6. Measure total campaign run time and failure rate.
7. Keep the feature off by default unless it materially improves judge-facing evidence without slowing the demo.
