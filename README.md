# Recover AI Demo

Autonomous B2B unpaid invoice recovery for the sponsor context engineering challenge.

The demo has two surfaces:

- Web dashboard: run a recovery campaign, inspect evidence, approve generated email copy, and view the action timeline.
- Agent workflow: `npm run agent:demo` produces generated outputs and logs under `generated/campaigns/`.

The invoice, contract, and debtor are synthetic. Tavily can research a real public company/domain as context for grounded web evidence, but the app does not assert that the real company owes money.

## Sponsor Use

- Tavily: real open-web research with source URLs.
- ClickHouse: evidence, action, and event ledger writes.
- Prometheux: executable ontology/Vadalog programme and optional `/evaluate` call.
- Cursor: build environment.
- Stripe test mode and Slack are action channels for payment and notification.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Agent CLI

```bash
npm run agent:demo
```

The workflow writes:

- `campaign.json`
- `brief.md`
- `email.md`
- `ontology.vadalog`
- `ontology.json`
- `ledger.jsonl`

## Required Keys For Full Demo

```bash
TAVILY_API_KEY=
CLICKHOUSE_URL=
CLICKHOUSE_USERNAME=
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=recover_ai
STRIPE_SECRET_KEY=
SLACK_WEBHOOK_URL=
PROMETHEUX_ENGINE_URL=
PROMETHEUX_API_TOKEN=
```

`PROMETHEUX_ENGINE_URL` should point to an engine exposing `/evaluate`. If it is absent, the app still exports the ontology programme and JSON graph locally.
