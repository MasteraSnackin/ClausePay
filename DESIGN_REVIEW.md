# Design Review

## Design Diagnosis

ClausePay is an operations dashboard for finance users and hackathon judges. The primary task is clear: choose public context and run the recovery agent. The strongest judge-facing panels are ClickHouse proof, integrations, real actions, the 30-day autonomous workflow and source-to-action trace.

The interface is appropriately compact and evidence-focused. This design pass found no need for a broad redesign. The useful improvements were small scanability and resilience changes: sponsor status needed a clearer visual signal, integration rows needed stronger state differentiation, and split headings needed to wrap safely on narrow screens.

## Proposed Changes

- Add accessible sponsor integration labels such as `Tavily: configured`.
- Add a small visual status dot inside each sponsor pill.
- Colour integration names by state so completed, failed and simulated providers are easier to scan.
- Allow split panel headings to wrap instead of risking tight mobile layouts.
- Add smoother hover transitions to secondary buttons.

## Files or Components Affected

- `src/client/App.tsx`
- `src/client/styles.css`

## Before/After Verification

- Before: sponsor pills relied mainly on colour and `title` text for configured/missing state.
- After: sponsor pills have visual dots and explicit accessible labels.

- Before: integration rows used status dots, but the provider names were visually similar.
- After: completed integrations read green, simulated/missing integrations read neutral and failures read red.

- Before: split headings could become tight where an action button sits beside a heading.
- After: split headings wrap cleanly.

Verification run:

- `npm test` passed.
- Desktop browser check at `1440x900`: no horizontal overflow, ClausePay title/H1 correct, sponsor dots rendered, integration state colour rendered.
- Dashboard campaign run: live Tavily, completed Prometheux and final ClickHouse ledger proof visible; 8 actions, 8 sources, 7 trace rows and 6 workflow steps.
- Mobile browser check at `390x844`: no horizontal overflow, run button visible, sponsor pills present and split headings wrapping.

## Remaining Design Risks

- There is still no committed visual regression test.
- Generated Tavily titles and snippets are unpredictable, so long-source wrapping should remain part of future browser checks.
- Stripe and Slack live success states have not been visually reviewed because those credentials are not configured.
