# Technical Notes

## Technical Risks Found

1. External provider calls can hang or slow a demo if they are not bounded.
2. ClickHouse client cleanup must run on both success and failure paths.
3. Tavily web research should tolerate partial query failure instead of discarding successful query results.
4. The smoke test can call live providers when credentials are present, so provider availability affects local verification.
5. There is no durable background job runner for 30-day workflow execution yet.
6. There is no automated browser regression test for responsive layout.

## Priority Ranking

- P1: Keep provider calls bounded with explicit timeouts.
- P1: Ensure ClickHouse clients close after failed commands/inserts.
- P1: Keep successful Tavily sources when one query fails.
- P2: Add unit tests for pure campaign builders.
- P2: Add browser smoke tests.
- P3: Move long-running workflows to a durable queue if this becomes production software.

## Changes Made

- Added `fetchWithTimeout` for bounded provider calls.
- Applied timeouts to Tavily, Prometheux and Slack HTTP calls.
- Preserved existing graceful fallback behaviour for missing credentials.
- Changed the main ClickHouse campaign write to close its client in a `finally` block.
- Confirmed the ClickHouse outcome append and readiness query already close clients in `finally` blocks.
- Changed Tavily research from all-or-nothing `Promise.all` behaviour to `Promise.allSettled`.
- Tavily now returns successful unique sources when at least one query succeeds, and only falls back when no usable sources are returned.

## Verification Evidence

Run on 26 June 2026:

```bash
npm test
npm run test:smoke
```

Results:

- `npm test`: passed.
- `npm run test:smoke`: passed with campaign `camp_16df8e62`.
- Tavily: `completed`.
- Prometheux: `completed`.
- ClickHouse: `completed`.
- Stripe: `simulated`.
- Slack: `simulated`.

## Residual Risk

- Stripe SDK timeout/retry behaviour is provider-managed and not wrapped here.
- Provider timeouts are fixed values and not yet configurable.
- No retry/backoff is implemented; this avoids retry storms but means transient failures can mark an integration as failed.
- No browser-level automated regression test is committed yet.
