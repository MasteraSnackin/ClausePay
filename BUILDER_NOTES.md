# Builder Notes

## Implemented Behaviour

- Added and tightened the reusable smoke-test command for the recovery agent.
- `npm test` remains the standard project verification command for type-checking and production build.
- `npm run test:smoke` executes a campaign and validates the generated campaign shape.
- The smoke test now checks exact stable counts: 8 actions, 8 events, 7 source-action trace rows and 6 workflow steps.
- The smoke test checks evidence, recovery brief, email draft and approval-gated email action.
- The smoke test checks generated artefact files under `generated/campaigns/<campaign_id>/`.
- The smoke test verifies the final ClickHouse ledger detail matches the campaign shape when ClickHouse is configured.
- If Tavily, Prometheux or ClickHouse are configured in `.env`, the smoke test expects those integrations to complete.

## Files Changed

- `package.json`
- `scripts/smoke-test.ts`
- `README.md`

## Verification Commands

```bash
npm test
npm run test:smoke
```

Verification run on 26 June 2026:

- `npm test`: passed.
- `npm run test:smoke`: passed with campaign `camp_361a6b4d`.
- Live sponsor states: Tavily completed, Prometheux completed, ClickHouse completed.
- Optional channels: Stripe simulated, Slack simulated.

## Known Limitations

- `npm run test:smoke` can call live external providers when credentials are present.
- It writes an ignored campaign under `generated/campaigns/`.
- It is a smoke test, not a full unit or browser test suite.
- It does not validate the React dashboard click path.

## Recommended Next Step

Add small unit tests for the pure campaign builders and a Playwright browser smoke test for the dashboard button flow.
