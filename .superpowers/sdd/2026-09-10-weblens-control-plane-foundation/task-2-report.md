# Task 2 — Append-only event store report

## Outcome

Implemented the append-only control-plane event-store API in `src/control-plane/events.ts` with injected `SqlExecutor`/transaction support. The public surface is `EventStore.append`, `appendInTransaction`, `listByAggregate`, and `listSince`.

The implementation validates tenant/aggregate UUIDs, event identity/version, JSON serializability, and cursor bounds before any query. Event inserts use one parameterized CTE statement that increments the owner-specific counter and inserts the immutable event. Events are tenant-scoped when listed and are ordered ascending by sequence. Optional idempotency-key reuse retrieves and returns an identical existing event; conflicting identity/payload throws.

## Changed files

- `src/control-plane/events.ts` — event model, validation, parameterized append/list queries, idempotency handling.
- `tests/control-plane-events.test.ts` — injected-executor boundary tests.

## TDD evidence

1. RED: added the focused event-store test module before implementation. `rtk npm test -- --test-name-pattern='append|list|malformed'` failed at TypeScript compilation because `../src/control-plane/events.js` did not exist (expected missing-feature failure); it also exposed strict optional-property type setup in the new test.
2. GREEN: implemented the smallest `EventStore` API and corrected the test fixture’s exact-optional fields. The focused command then passed the new append, transaction, listing, and malformed-input coverage.
3. Extended focused coverage: added idempotency replay and conflicting-key tests. `rtk npm run build; node --test dist/tests/control-plane-events.test.js` passed all 6 tests.
4. Full regression: `rtk npm test` passed: 94 pass, 0 fail, 1 skipped (PostgreSQL integration intentionally skipped because `WEBLENS_PG_TEST_URL` is unset).

## Observable boundary coverage

- append uses the counter/event CTE and returns its result.
- `appendInTransaction` executes against the caller-provided transaction.
- list queries include `owner_organization_id`; aggregate list includes aggregate predicates; cursor list binds owner, exclusive sequence, and bounded limit.
- malformed tenant IDs fail before SQL.
- identical idempotency key returns the stored event; conflicting key reuse throws after the lookup and issues no second insert.

## Commit

`3c6b1d3dac709cfca1f3e307b27ee6bd39772b06` — `feat(control-plane): add append-only event store`

## Concerns / limits

- Offline injected-executor tests verify query construction and behavior only. They do not prove live PostgreSQL locking, RLS enforcement, JSONB coercion, or concurrent idempotency races.
- The conflict path intentionally does not insert an event, preserving stream immutability. Its behavior under concurrent append requests should be exercised against a configured PostgreSQL integration database.

## Review round 1 fixes

Addressed review findings in commit `b886526d33dcf387bfef6f7dff4886abdc1e63f8`:

- Idempotency lookup now precedes counter allocation in the single append statement, so replay/conflict does not advance the owner sequence in the normal serialized path.
- Added canonical recursive JSON comparison so object key order does not cause a false conflict.
- Hardened validation for non-null payloads, timestamps, optional string fields, causation/correlation UUIDs, and aggregate type/list inputs.
- Added focused tests for semantic payload replay and malformed optional fields.

Fix verification: `rtk npm run build; node --test dist/tests/control-plane-events.test.js` — 8 passed, 0 failed.

## Review round 2 fixes

Commit `e4d98bcdf170485b1d8aad3e47cf5f6811dc2585` adds advisory transaction serialization keyed by owner/idempotency key before the existing-row check, plus strict runtime type checks for event identity and JSON payload values (including undefined/null/function/symbol/bigint rejection). The focused suite remains 8/8 green, and the full `rtk npm test` suite passes 96/96 with 1 intentional PostgreSQL skip.

The injected executor cannot prove PostgreSQL snapshot/concurrency semantics; the advisory lock is included in the production statement and live concurrent verification remains a deployment-time concern.

## Review round 4 fixes

Addressed precision-safe cursor and idempotency validation findings. `listSince` now accepts `string | bigint | number`; numeric cursors must be nonnegative safe integers, string cursors must be nonnegative decimal integers, and all cursors are canonicalized to decimal strings before binding (including round-tripping a returned `DomainEvent.sequence` above `Number.MAX_SAFE_INTEGER`). Provided `idempotencyKey` values must be non-empty strings; empty keys are rejected before SQL.

TDD red/green evidence: added tests for canonical >MAX_SAFE cursor strings, returned-sequence round trip, bigint cursors, malformed/unsafe cursors, and empty idempotency keys. Focused verification `npm run build; node --test dist/tests/control-plane-events.test.js` — 13 passed, 0 failed. Full verification `npm test` — 101 passed, 0 failed, 1 intentional PostgreSQL skip (`WEBLENS_PG_TEST_URL` unset).

## Review round 3 fixes

Commit `493a2dc7a06d15f35567303a66c306165ed20160` moves public `append` behind a required tenant transaction runner compatible with `PgDatabase.withTenant`. Idempotent appends now issue separate advisory-lock and fresh lookup statements before the allocation/insert statement, eliminating loser sequence consumption in the serialized transaction. Sequence is exposed as a string to preserve PostgreSQL bigint precision. Recursive JSON validation rejects cycles, non-plain objects, non-finite numbers, and nested non-JSON values. Added tests prove lock→lookup ordering, no allocation on replay, malformed nested payload rejection, and missing transaction-runner failure.

Verification: focused `node --test dist/tests/control-plane-events.test.js` — 11 passed; full `rtk npm test` — 99 passed, 0 failed, 1 intentional PostgreSQL skip.
