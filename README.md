# WebLens

WebLens is an evidence-based website evaluation harness with two policies over one shared capture, audit, judge, and scoring pipeline:

- **Lead Scout (`lead-fast`)** estimates redesign opportunity only when website-quality evidence and separately sourced business signals are complete.
- **Intent-aware Design Critic (`critic-standard`)** checks a site against its brief and release gates. During the pilot, subjective quality cannot produce autonomous `PASS`; a human review bound to the exact run, profile, and context hashes is required.

It is a decision-support tool, not a WCAG certification service, sales CRM, crawler, or universal “beauty score.”

## Requirements and setup

- Node.js 24 or newer (developed and verified on Node 25.2.1)
- npm 11 or newer
- An operator-provisioned network enforcement profile for any live capture
- An OpenAI API key only for explicitly approved cloud-vision runs

```powershell
npm install
npx playwright install chromium
npm test
```

Dependencies are lockfile-pinned. At the last verification, `npm outdated --json` returned an empty object.

## Inputs

An evaluation needs a context JSON file:

```json
{
  "objective": "Book a dental visit",
  "audience": "Local patients",
  "locale": "en",
  "archetypeHint": "local_service",
  "primaryAction": "Book a visit",
  "routes": ["/"],
  "requirements": [
    {
      "id": "booking-panel",
      "description": "The booking panel can be opened",
      "required": true,
      "check": {
        "route": "/",
        "action": { "kind": "click", "selector": "#book-now" },
        "assertion": { "kind": "visible", "selector": "#booking-panel" }
      }
    }
  ],
  "referenceIds": [],
  "qualityReview": null
}
```

Lead mode additionally accepts business JSON. These are independent observations, not guesses made from visual quality:

```json
{
  "commercialFit": { "value": 0.9, "evidenceIds": ["crm:fit"], "observedAt": "2026-09-08T00:00:00.000Z", "provenance": "provided" },
  "fixability": { "value": 0.8, "evidenceIds": ["review:scope"], "observedAt": "2026-09-08T00:00:00.000Z", "provenance": "provided" },
  "activity": { "value": 0.7, "evidenceIds": ["public:update"], "observedAt": "2026-09-08T00:00:00.000Z", "provenance": "provided" },
  "inScope": true
}
```

## Local evaluation

The harness refuses to launch a browser unless the declared enforcement profile is verified in the environment. For a loopback staging origin:

```powershell
$env:WEBLENS_NETWORK_ENFORCEMENT = "verified:local-deny-all"
$env:OPENAI_API_KEY = "..."
$env:WEBLENS_ESTIMATED_RUN_COST_USD = "0.05"
$env:WEBLENS_PRICING_VERSION = "operator-rates-2026-09"
node dist/src/cli.js evaluate http://127.0.0.1:3000 `
  --recipe critic-standard `
  --context .\context.json `
  --redaction .\redaction.json `
  --local-origin http://127.0.0.1:3000 `
  --budget 0.10 `
  --allow-cloud-vision
```

`--allow-cloud-vision` is mandatory because screenshots may contain sensitive data. The caller must also provide a suitable brief and have authority to upload the captured pages.

Critic requirements may declare one bounded `click` plus a `visible` or `url` assertion. A passed check is recorded as observed evidence; a deterministic failed required check becomes an objective blocker and returns `ITERATE`. A requirement without a declared check, or one beyond the recipe interaction limit, remains `REVIEW` rather than being inferred from page copy.

## Public evaluation

Public capture is deliberately disabled in the standalone v0.1 build. The in-process policy proxy is defense in depth, but it cannot prove that its own browser subprocess is inside an independently enforced egress boundary. Passing `--public` therefore returns a preflight error even if `WEBLENS_NETWORK_ENFORCEMENT` is set.

Enablement belongs in a trusted worker deployment that provisions and verifies the external firewall/container boundary before invoking WebLens. The following is an illustrative future worker invocation, not a currently enabled standalone command:

```powershell
$env:WEBLENS_NETWORK_ENFORCEMENT = "verified:public-egress"
$env:WEBLENS_ESTIMATED_RUN_COST_USD = "0.05"
node dist/src/cli.js evaluate https://example.com `
  --public `
  --recipe lead-fast `
  --context .\context.json `
  --business .\business.json `
  --budget 0.10 `
  --allow-cloud-vision
```

DNS validation, the policy proxy, and Playwright request guards do not replace connection-time egress enforcement. See [Network preflight](docs/network-preflight.md).

## Batch and resume

Batch input is JSONL with one complete `RunInput` per line. Every paid item must set `allowCloudVision: true` and a positive `budgetUsd`. The latter is an operator estimate, not a guaranteed provider billing cap.

```powershell
node dist/src/cli.js batch .\batch.jsonl `
  --state .\batch.state.jsonl `
  --max-items 30 `
  --budget 25 `
  --allow-cloud-vision
```

The aggregate budget is checked against prior recorded spend, unresolved reservations, and estimates for all pending cloud items before evaluation starts and again before every item. Each model call reserves budget before dispatch; the three required stages share at most one transient retry. Attempts, retry reasons, token usage, and, when both token-rate environment variables are configured, reconciled actual cost are recorded in the immutable run. These controls are operator-supplied accounting safeguards, not a provider-side billing guarantee. A legacy state journal without cost fields is rejected for aggregate-budget execution; start a new journal instead. The state journal is rewritten atomically after every item. A rerun skips only records whose full normalized input and compatibility hash previously reached both completed execution and a complete assessment. The compatibility key includes model, recipe, prompt, rubric, and engine versions; failed, partial, unscorable, or changed inputs run again. Execution is intentionally sequential in v0.1 because Lighthouse is resource-intensive.

## Review, replay, and compare

```powershell
node dist/src/cli.js replay RUN_ID --artifacts .\runs
node dist/src/cli.js compare BASELINE_RUN_ID CURRENT_RUN_ID --artifacts .\runs
node dist/src/cli.js gate --run RUN_ID --review .\review.json --artifacts .\runs
```

`replay` reads stored results and causes no browser or model traffic. `gate` writes a new policy-decision revision without modifying immutable capture evidence. Critic reports return at most three prioritized fixes; recapture after making them and stop/escalate rather than looping indefinitely.

## Exit codes

| Code | Meaning |
|---:|---|
| `0` | Command completed and no iterate/review/error gate remains |
| `1` | Critic requires iteration |
| `2` | Invalid command, config, input, or approval |
| `3` | Incomplete/unscorable run, review required, incompatible comparison, or batch item failure |

Target quality is not represented as a process/config failure. A blocked preflight is `not_started`; a bot challenge is `unscorable`, never a low website score.

## Evidence and privacy

Each run is stored under `<artifactRoot>/<runId>/` with immutable `run.json`, JSON/Markdown/escaped-HTML reports, and hashed evidence files. Capture includes desktop/mobile screenshots, bounded DOM/style summaries, runtime events, axe results, and—when required—one serialized Lighthouse navigation report.

DOM extraction is bounded, common email/URL-token patterns are redacted, and form/content-editable regions are masked in screenshots before persistence or upload. A run can add site-specific selectors and text patterns with `--redaction`:

```json
{
  "selectors": ["#customer-card", "[data-account-id]"],
  "textPatterns": [
    { "id": "account-id", "source": "ACCT-[0-9]+", "flags": "gi", "replacement": "[redacted-account]" }
  ]
}
```

Selectors remove matching content from persisted DOM evidence and mask its screenshot pixels. Text patterns sanitize textual artifacts; use a selector as well when the same value is visibly rendered. This remains configured redaction, not universal DLP: unlisted personal, confidential, or licensed content may remain visible. Keep `runs/`, secrets, and private benchmark labels out of version control; set retention/access controls appropriate to the data; never upload without authorization.

## Calibration limits

Scores are deterministic transforms of anchored 0–4 judge ratings, but model judgments still require benchmark calibration. Lighthouse is lab performance only; TBT is not renamed INP. Axe findings are audit evidence, not WCAG conformance. Lead opportunity combines quality deficiency with separately supplied commercial fit, fixability, and activity. See [Evaluation principles](docs/evaluation-principles.md) and the [pilot report template](docs/pilot-report.md).

No public-business crawl, outreach, paid benchmark, or staging screenshot upload is performed by the default test suite.

## Control-plane foundation (opt-in)

The additive `src/control-plane/index.ts` entry point exports the durable control-plane APIs: `PgDatabase`/migration helpers, tenant-scoped `EventStore`, `AgentRunStore`, `IdentityRepository`, and the `EvaluationService` WebLens adapter. Importing this module does not change the legacy CLI or enable public capture.

The PostgreSQL path targets PostgreSQL 18. Set `WEBLENS_PG_URL` for the migration command (or `WEBLENS_PG_TEST_URL` for the opt-in integration test), then run:

```powershell
npm run build
$env:WEBLENS_PG_URL = "postgres://..."
npm run db:migrate
# only when a disposable PostgreSQL 18 test database is available
$env:WEBLENS_PG_TEST_URL = "postgres://..."
npm run test:postgres
```

Migrations are append-only and ordered (`001_control_plane`, `002_identity_provenance`, `003_identity_normalization`, `004_evaluation_adapter`, `005_evaluation_subject`). Tenant tables use row-level security; an application role must set the transaction-local `app.owner_organization_id` through `PgDatabase.withTenant()`. Bootstrap the owner organization in an explicitly tenant-scoped transaction before creating subject organizations, web properties, sources, or facts. Keep owner and subject IDs distinct.

The adapter records only the WebLens artifact URI, SHA-256 hashes, and a bounded `{ score, reason }` projection. WebLens remains the evidence source of truth; screenshots, DOM, prompts, judge payloads, and provider errors are not copied into control-plane rows. A worker crash is `unknown` and requires paid-evaluator reconciliation, never an automatic rerun. Registry/company source provenance and consent/do-not-contact guards are enforced before facts or outreach permissions are persisted.

See [the control-plane foundation guide](docs/control-plane-foundation.md) for RLS/bootstrap details, stale-run recovery, and the deliberately deferred roadmap.
