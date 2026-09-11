# WebLens Control Plane Foundation Implementation Plan

> **For implementers:** Follow `superpowers:subagent-driven-development` and strict TDD. The WebLens evaluator remains the evidence-producing core; this plan adds a control plane around it.

**Goal:** Deliver the first production-shaped control-plane slice: PostgreSQL persistence and migrations, append-only domain events, durable agent/run lifecycle, organization/legal-entity/fact provenance, and a hash-addressed WebLens adapter.

**Scope boundary:** This plan implements priorities A/B/C from the control-plane roadmap. SearXNG, Scrapling, CloakBrowser, Donut profiles, public-worker deployment, lead qualification, dashboard, and outreach are later plans and must not be stubbed here.

**Architecture:** A small `src/control-plane` module uses parameterized SQL through an injected executor and a runtime `pg` adapter. Every tenant operation carries an `ownerOrganizationId`; repositories also filter by owner while PostgreSQL RLS supplies a second boundary. Domain events are appended in the same transaction as state changes. WebLens results remain in their artifact store; the control plane stores a URI, SHA-256 hash, context hash, and bounded projection only.

**Technology:** TypeScript ESM, Node.js 24+, PostgreSQL 18, `pg`, Zod, `node:test`. `graphile-worker` is installed for the next orchestration slice but this plan does not invent worker jobs.

## Global constraints

- Keep public standalone WebLens capture disabled. Do not add an environment-variable escape hatch.
- Keep evaluator execution, assessment, and policy verdicts distinct. `ITERATE` is a valid completed critic outcome; `UNSCORABLE` is not an execution failure.
- Discovery/research data and outreach permission remain separate. Contact rows must carry consent and do-not-contact fields; public availability never implies outreach permission.
- `ownerOrganizationId` is the agency/account that owns data. `subjectOrganizationId` is the business being researched. Never infer one from the other.
- Use PostgreSQL 18 `uuidv7()` for database identifiers and a per-owner bigint event sequence for monotonic tenant streams.
- Enable and force RLS on tenant tables. Tenant-scoped transactions set `app.owner_organization_id` locally. Repository predicates remain tenant-scoped as defense in depth.
- All SQL values are parameterized. Identifiers may only come from static migration code, never user input.
- Default tests are offline. SQL behavior is tested through an injected executor; real PostgreSQL integration tests run only when `WEBLENS_PG_TEST_URL` exists and may skip otherwise.
- A fake SQL executor does not prove migrations, locking, or RLS. Do not claim those verified without the real PostgreSQL suite.
- Evaluation idempotency deduplicates requests and projections. A process crash after paid evaluator dispatch is an `unknown`/reconciliation state and must never trigger an automatic paid rerun.

## Task 1: Dependencies, SQL boundary, and migrations

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/control-plane/database.ts`
- Create: `src/control-plane/migrations.ts`
- Create: `src/control-plane/sql/001_control_plane.sql`
- Create: `tests/control-plane-database.test.ts`
- Create: `tests/control-plane-postgres.test.ts`

**Behavior:**

- Upgrade every existing dependency that is behind its registry-compatible current version; add `pg@8.23.0`, `graphile-worker@0.18.0`, and `@types/pg@8.23.1`.
- Add `db:migrate` and `test:postgres` scripts.
- Define `SqlExecutor`, `SqlQueryResult`, `Transaction`, and a `PgDatabase` adapter. Tenant transactions must issue `set_config('app.owner_organization_id', ..., true)` before repository work.
- Add an ordered, checksummed migration runner backed by `control_plane_migrations`; applying twice is a no-op and checksum drift fails closed.
- The initial PostgreSQL 18 migration creates enums/tables/indexes/constraints for organizations, aliases, legal entities, sources, facts, people, roles, contact channels, web properties, domain events, event counters, agent runs, run steps, and evaluation references/requests.
- Root owner organizations use `owner_organization_id = id`; subject organizations reference their owner. RLS permits rows only when `owner_organization_id` matches the local tenant setting. Enable `FORCE ROW LEVEL SECURITY` on tenant tables.
- PostgreSQL integration coverage must prove migration idempotency, RLS cross-tenant isolation, UUIDv7 defaults, and rollback behavior when the environment variable is available.

## Task 2: Append-only event store

**Files:**
- Create: `src/control-plane/events.ts`
- Create: `tests/control-plane-events.test.ts`

**Behavior:**

- Implement `EventStore.append`, `appendInTransaction`, `listByAggregate`, and `listSince`.
- A single SQL statement allocates a per-owner sequence and inserts the event. `(owner_organization_id, sequence)` is unique.
- Optional idempotency keys are unique per owner and return the existing event when the payload identity matches; conflicting reuse fails closed.
- Events include aggregate type/id, event type/version, payload, occurred time, actor, trace ID, and causation/correlation IDs.
- Events are immutable; no repository update/delete method exists.

## Task 3: Durable agent runs and steps

**Files:**
- Create: `src/control-plane/agents.ts`
- Create: `tests/control-plane-agents.test.ts`

**Behavior:**

- Implement agent states `queued | leased | running | waiting_approval | blocked | succeeded | failed | cancelled | stale` and only these transitions:
  - `queued -> leased`
  - `leased -> running | stale | cancelled`
  - `running -> waiting_approval | blocked | succeeded | failed | cancelled`
  - `waiting_approval -> running | cancelled`
  - `blocked -> queued | cancelled`
  - `stale -> queued | failed`
- Implement create, claim-next, transition, heartbeat, stale marking, and step append/start/finish operations.
- Claiming uses `FOR UPDATE SKIP LOCKED`; mutations verify owner, expected state, lease owner, and unexpired lease where applicable.
- Run and step state mutation appends the matching domain event in the same transaction.
- Steps carry monotonic sequence, attempt, checkpoint JSON, input/output projections, error provenance, lease metadata, and timestamps.

## Task 4: Organization identity and field provenance

**Files:**
- Create: `src/control-plane/identity.ts`
- Create: `tests/control-plane-identity.test.ts`

**Behavior:**

- Implement repositories for owner/subject organizations, aliases, legal entities, sources, facts, people/roles, contact channels, and web properties.
- Facts are append-only observations with subject type/id, predicate, JSON value, source, confidence, observed time, extractor (`deterministic | model | human`), and status (`candidate | accepted | conflicted | rejected`). Contradictory/historical facts are retained.
- Resolution precedence is exact tax/registration identifier, normalized legal name plus jurisdiction, verified domain, then corroborated alias/domain/address evidence. Fuzzy ambiguity returns candidates and never auto-merges.
- Brand, legal entity, and person roles remain separate. Registry sources support legal fields; company sources may support executive roles.
- Contact channels include `consent_status`, `do_not_contact`, `outreach_allowed`, and an explicit reason. Repository validation forbids outreach when do-not-contact is true or permission is absent.

## Task 5: WebLens control-plane adapter

**Files:**
- Create: `src/control-plane/evaluations.ts`
- Create: `tests/control-plane-evaluations.test.ts`

**Behavior:**

- Define `WebLensExecutor`, `EvaluationService`, lead/critic inputs, and comparison registration.
- Validate the executor result with the existing `EvaluationRunSchema`.
- Store only the WebLens run ID, recipe, execution status, assessment status, policy verdict, artifact URI, SHA-256 result hash, subject-context hash, bounded score/reason projection, cost totals, and timestamps. Never copy DOM, screenshots, audit bodies, findings, judge transcripts, or arbitrary model output into PostgreSQL.
- Persist or locate the original run artifact and verify that the referenced artifact hashes to the same validated result before registration.
- Acquire an idempotent evaluation request before dispatch. Repeated completed requests return the existing reference. Running/unknown requests do not redispatch. Conflicting idempotency reuse fails closed.
- Emit requested, started, completed/failed, and reference-registered events with trace/correlation IDs. Database state and events share transactions where they are changed together.
- A completed critic evaluation with `ITERATE` produces a successful adapter operation whose policy verdict remains `ITERATE`.

## Task 6: Public exports, fixture integration, and operator docs

**Files:**
- Create: `src/control-plane/index.ts`
- Create: `tests/control-plane-integration.test.ts`
- Modify: `README.md`
- Create: `docs/control-plane-foundation.md`

**Behavior:**

- Export the supported control-plane API from one module without widening the legacy WebLens CLI.
- Add an offline fixture flow covering owner creation, subject organization/web property, sourced fact, agent run/step event stream, and a stubbed lead evaluation reference.
- Document PostgreSQL 18 setup, migrations, application role/RLS requirements, `WEBLENS_PG_TEST_URL`, artifact URI/hash semantics, stale-run recovery, and the paid-evaluation reconciliation rule.
- Document the later roadmap and explicitly state that discovery, browser escalation, persistent identity, qualification, dashboard, and outreach are not part of this foundation.

## Verification

Run fresh, in this order:

1. `npm run build`
2. `npm test`
3. `npm run test:postgres` (passes when configured; otherwise reports an explicit skip)
4. `npm outdated --json` (review any non-empty result, including intentionally retained Node type major compatibility)
5. `git diff --check`

