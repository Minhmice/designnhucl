# WebLens control-plane foundation

This document describes the opt-in foundation shipped with WebLens v0.1. It is a durable application boundary around the existing evaluator; it is not a replacement capture engine, CRM, crawler, or outreach system.

## PostgreSQL 18 setup

Use PostgreSQL 18 and an application role with permission to create the control-plane schema during deployment. Keep migration ownership separate from the least-privileged runtime role where possible.

```powershell
npm install
npm run build
$env:WEBLENS_PG_URL = "postgres://control_plane_migrator:***@db.example/weblens"
npm run db:migrate
```

The migration runner applies, in order, `001_control_plane`, `002_identity_provenance`, `003_identity_normalization`, `004_evaluation_adapter`, and `005_evaluation_subject`. It records checksums and refuses drift or duplicate versions. Migrations are additive: do not edit an applied SQL file; add the next ordered migration instead.

For a disposable integration database, set `WEBLENS_PG_TEST_URL` and run `npm run test:postgres`. Without that variable the PostgreSQL tests are intentionally skipped; the offline fixture in `tests/control-plane-integration.test.ts` remains runnable in the normal `npm test` suite.

## Tenancy, RLS, and bootstrap

All tenant-owned rows carry `owner_organization_id`. `PgDatabase.withTenant(ownerId, work)` checks out one connection, starts a transaction, and sets the transaction-local `app.owner_organization_id`. RLS policies and explicit repository predicates both enforce this owner boundary. Connections must not be reused across tenants without a fresh transaction setting.

Create the agency/account owner in an explicitly tenant-scoped bootstrap transaction, then create subject organizations under that owner. `ownerOrganizationId` identifies who owns the research data; `subjectOrganizationId` identifies the business being researched. They are deliberately different IDs and must never be collapsed. Web properties, sources, facts, agent runs, events, evaluation requests, and references are all owner-scoped.

## Identity and provenance

Identity writes are append-only where observations are concerned. A fact keeps its source, extractor, confidence, status, and observation time. Legal/registration/tax facts require a persisted `source_kind = registry`; executive/CEO/representative facts require `source_kind = company`. A caller-provided source-kind hint is not authoritative. Normalized legal names, jurisdictions, aliases, domains, and addresses are used as corroborating signals; ambiguous matches are returned as ambiguous rather than merged.

Public contact information is not permission to advertise. `ContactChannel` writes reject outreach unless consent is explicit, a permission reason is present, and `doNotContact` is false. Discovery/research and outreach remain separate workflows.

## Agent runs and recovery

`AgentRunStore` persists a strict state machine (`queued`, `leased`, `running`, `waiting_approval`, `blocked`, `succeeded`, `failed`, `cancelled`, `stale`) and an ordered, bounded step projection. Leasing uses `FOR UPDATE SKIP LOCKED`; workers must present the current lease owner and an unexpired lease for transitions or step writes.

If a lease expires, an operator/worker calls `markStale`. The stale run clears lease fields and can be explicitly re-queued or failed according to operator policy. A stale or crashed run is not silently duplicated; checkpoints and error provenance are bounded so the next attempt can reconcile safely.

## WebLens evaluation adapter

`EvaluationService` is the only supported control-plane path to WebLens. It validates the recipe, subject context hash, immutable artifact URI, completed execution status, and result hash before registering a reference. The control plane stores:

- artifact URI (for example `artifact://runs/<runId>.json`);
- SHA-256 of the validated WebLens result and subject context;
- bounded `{ score, reason }` projection;
- lifecycle status, policy verdict, cost, and trace/correlation IDs.

It does not store screenshots, DOM, model prompts/responses, judge blobs, or raw provider errors. Artifact URIs must be read through an injected artifact store (or a local `file://` reader). A paid evaluator crash is recorded as `unknown` with reconciliation metadata. Operators reconcile the provider result against the immutable artifact/run ID and hashes; they must not automatically rerun a paid request under the same idempotency key. `UNSCORABLE` is a completed assessment status, while critic `ITERATE` is a successful policy verdict.

## Security boundaries

The standalone v0.1 CLI still refuses public capture. The control plane does not add a public worker or bypass network preflight. Never put API keys, passwords, or provider credentials in this document, source control, fixtures, or migration files; inject them through the deployment secret manager.

## Roadmap and explicit non-scope

The foundation intentionally stops at tenancy, provenance, durable runs/events, and the WebLens adapter. Later phases may add:

- SearXNG-backed discovery and Scrapling extraction;
- CloakBrowser and Donut persistent browser profiles;
- a trusted public WebLens worker with independent egress enforcement;
- lead qualification and scoring workflows;
- an operator dashboard and review UI;
- outreach orchestration.

Those systems are not installed, enabled, or implied by this package. In particular, no public-business crawl, qualification decision, dashboard, or outreach message is produced by the default CLI or test suite.
