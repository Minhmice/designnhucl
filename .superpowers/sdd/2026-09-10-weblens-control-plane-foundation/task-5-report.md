# Task 5 — WebLens control-plane adapter

## Status

Implemented the `EvaluationService` adapter in `src/control-plane/evaluations.ts` and its focused tests in `tests/control-plane-evaluations.test.ts`.

## TDD evidence

- RED: the pre-existing Task 5 tests failed before the adapter was repaired (the source did not compile, then the strict UUID/result validation failures were exposed after the test harness was made type-safe).
- GREEN: focused Task 5 tests pass 6/6 after the implementation.
- Full suite: `npm test` passes 165 tests with one explicit PostgreSQL integration skip because `WEBLENS_PG_TEST_URL` is not configured.

## Delivered behavior

- Defines lead/critic request inputs, `WebLensExecutor`, `EvaluationReference`, comparison registration, artifact-store injection, and service result types.
- Validates executor output through `EvaluationRunSchema`, including recipe, completed execution, subject-context SHA-256, status, and bounded projection checks.
- Persists only reference metadata: WebLens run ID, recipe/statuses/verdict, artifact URI, result and subject-context hashes, bounded score/reason projection, cost total, owner/subject IDs, timestamps, and trace/correlation IDs. DOM, screenshots, findings, audit bodies, judge transcripts, and arbitrary model output are never copied into SQL values or event payloads.
- Acquires idempotency under a transaction/advisory lock before dispatch. Completed requests replay their reference; running, unknown, and failed requests never redispatch. Conflicts fail closed. Executor crashes transition to unknown and emit a failed event, preserving the no-paid-rerun rule.
- Verifies the artifact exists, parses it with `EvaluationRunSchema`, and requires matching run ID and SHA-256 before reference registration. Existing references reject conflicting hash updates.
- Emits requested, started, completed/failed, and reference-registered events with trace/correlation/causation propagation. State and event mutations are performed in the same tenant transaction.
- Preserves critic `ITERATE` as a successful adapter operation and keeps `unscorable` assessment distinct from execution failure.
- Uses parameterized SQL and validates UUIDs, owner/subject separation, recipes, idempotency keys, URI/hash formats, statuses, costs, projections, and comparison subject consistency.

## Integration concern

The existing `001_control_plane.sql` migration predates this adapter and currently omits request columns used for idempotency fingerprints (`subject_organization_id`, `recipe`, `artifact_uri`, `subject_context_sha256`, trace/correlation IDs) and reference trace/correlation columns. The adapter intentionally stayed within the Task 5-owned files; the migration should be amended in the control-plane migration task before running this adapter against PostgreSQL.

## Verification

```text
npm run build
node --test dist/tests/control-plane-evaluations.test.js  # 6 passed
npm test                                                   # 161 passed, 1 skipped
```

## Review round 1 fixes

- Added additive migration `004_evaluation_adapter.sql` (the repository already has `003_identity_normalization.sql`; applied migrations 001–003 remain unchanged) and registered it in `loadMigrations`. The migration adds request provenance/artifact/trace columns, reference trace columns, subject/hash/recipe constraints, and a tenant-scoped subject index.
- Completed results now require `recipeId` and `subjectContextHash`, each matching the request before artifact verification or reference registration.
- Executor crash events contain only stable `executor_crash` plus an error type; provider messages, URLs, tokens, DOM, and other untrusted error text are not persisted.
- Replayed references reconstruct exactly `{ score, reason }`; contaminated projection keys are dropped rather than returned.

Review verification:

```text
npm run build
npm test                                                   # 165 passed, 1 skipped
node --test dist/tests/control-plane-evaluations.test.js dist/tests/control-plane-database.test.js  # 13 passed
```

## Review round 2 fixes

- Added additive migration `005_evaluation_subject.sql` without changing applied migrations. It completes `evaluation_references.subject_organization_id`, adds UUID/FK and owner/subject tenant-consistency constraints, and adds a tenant-scoped index. `loadMigrations()` now returns five ordered migrations.
- Migration asset lookup no longer depends on `process.cwd()`: it checks the compiled module-local asset, the repository source path derived from `import.meta.url`, then the development cwd fallback. A cwd-isolation regression test covers this path.
- Reusing a legacy request with NULL immutable provenance now fails with an explicit reconciliation error before any executor dispatch or completed replay.
- Loaded reference identity is validated (`id`, `requestId` UUIDs and bounded WebLens `runId`), and stored projections are reconstructed strictly as `{ score, reason }`.
- PostgreSQL integration expectations now derive the migration count from `loadMigrations()` and assert both evaluation tables expose `subject_organization_id`. The integration test remains explicitly skipped when `WEBLENS_PG_TEST_URL` is unset.

Round-2 verification:

```text
npm run build
node --test dist/tests/control-plane-evaluations.test.js dist/tests/control-plane-database.test.js  # 16 passed
npm test                                                   # 168 passed, 1 skipped
```

## Review round 3 fixes

- Added `scripts/copy-sql-assets.mjs` to the build and changed the build script to copy all control-plane SQL migrations into `dist/src/control-plane/sql`. Compiled migration loading now works from a standalone generated artifact without relying on repository source files or the caller's cwd; a build artifact test verifies the copied SQL exists.
- Extended additive migration 005 with `evaluation_requests` owner/subject distinctness and durable reconciliation metadata (`reconciliation_required`, `reconciliation_reason`). The adapter marks dispatch-in-flight requests as requiring reconciliation and records stable crash reconciliation state before emitting the sanitized unknown event.
- Completed idempotent replay now validates the stored reference against the request's immutable owner, subject, recipe, artifact URI, and subject-context hash. Registration additionally compares run ID and refuses conflicting existing references.
- Added regression coverage for corrupted completed references, standalone SQL assets, owner/subject migration constraints, and durable reconciliation updates.

Round-3 verification:

```text
npm run build
node --test dist/tests/control-plane-evaluations.test.js dist/tests/control-plane-database.test.js  # 19 passed
npm test                                                   # 171 passed, 1 skipped
```
