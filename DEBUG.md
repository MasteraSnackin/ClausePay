# Debug Report

## Root Cause

No active blocking bug is present in the current ClausePay workflow.

This debug run found one documentation issue: the previous report was stale because it said there was no automated smoke test. The project now has `npm run test:smoke`, which verifies the generated campaign shape and live sponsor integration states.

Previously fixed issues remain resolved:

- The browser title now uses `ClausePay`.
- Narrow viewport horizontal overflow is no longer present.
- Completed Prometheux runs now display `Ontology reasoning completed`.
- The final ClickHouse write now reports the complete ledger shape: 8 events, 8 sources, 8 actions, 7 trace links and 6 workflow steps.

## Fix

- Updated this debug report to reflect the current verification state.
- No code change was required during this debug pass.

The earlier fixes are still in place:

- `index.html` sets the page title to `ClausePay`.
- CSS layout containers allow narrow-width shrinking and generated text wrapping.
- API validation returns structured errors with request IDs.
- ClickHouse appends the final ledger outcome event/action after the main write.

## Verification

- Command: `npm test`
- Result: passed. TypeScript checking and production build completed successfully.

- Command: `npm run test:smoke`
- Result: passed. Campaign `camp_5299dfe1` generated 8 sources, 8 actions, 8 events, 7 trace rows and 6 workflow steps. Tavily, Prometheux and ClickHouse completed. Stripe and Slack were simulated.

- Command: `POST /api/recovery/run` with invalid domain input.
- Result: returned `400 VALIDATION_ERROR` with request ID `req_c5c58d87`.

- Command: `GET /api/readiness`
- Result: Tavily, ClickHouse and Prometheux configured; ClickHouse live against `recover_ai`.

- Browser check: dashboard campaign run completed with no visible error and no horizontal overflow.
- Browser result: 8 action cards, 8 source items, 7 source-to-action trace rows, 6 workflow steps, visible approval button, live Tavily, completed Prometheux and final ClickHouse ledger proof.

## Residual Risk

- Stripe and Slack remain simulated until credentials are provided.
- There is a CLI smoke test, but no committed browser-level automated regression test yet.
- The app has no authentication or authorisation and should not be deployed publicly with real finance data.

## Follow-up

- Add a Playwright smoke test for the main dashboard workflow.
- Add unit tests around `buildSourceActionTrace`, `buildWorkflow` and provider result handling.
- Add Stripe and Slack credentials if the final demo needs those action channels to be live.
