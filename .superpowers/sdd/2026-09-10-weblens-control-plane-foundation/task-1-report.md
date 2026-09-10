# Task 1 Implementation Report

## Changed files

- `package.json`, `package-lock.json`: added `pg@8.23.0`, `graphile-worker@0.18.0`, `@types/pg@8.23.1`; added `db:migrate` and `test:postgres` scripts. Existing Node/type dependencies were retained for TypeScript 7 / Node 24 compatibility.
- `src/control-plane/database.ts`: typed SQL boundary, tenant transaction helper, ordered checksum migration runner, migration loader.
- `src/control-plane/migrations.ts`: migration entrypoint/re-exports.
- `src/control-plane/sql/001_control_plane.sql`: PostgreSQL 18 control-plane schema, UUIDv7 defaults, tenant columns, RLS/FORCE RLS policies, indexes and constraints.
- `tests/control-plane-database.test.ts`: injected-executor tests for parameterization, tenant context, migration ordering/idempotency/checksum drift.
- `tests/control-plane-postgres.test.ts`: explicit opt-in PostgreSQL test skip when `WEBLENS_PG_TEST_URL` is absent.

## Verification

Commits: `6a72752660139514285b5de9b98faab51bb4cbd3`, `37f43c22e6c4acfc98b23fd44ceec93f2902ff6a`, `617c2cb`.

- Focused: `node --test dist/tests/control-plane-database.test.js dist/tests/control-plane-postgres.test.js` — 3 passed, 1 skipped (PostgreSQL URL not configured).
- Full: `npm test` — 88 passed, 1 skipped, 0 failed.
- `git diff --check` — clean.

## PostgreSQL status

Not configured; live migration/RLS/UUIDv7/rollback assertions were skipped explicitly. Offline injected-executor tests do not claim to prove live PostgreSQL behavior.

## Concerns

- `db:migrate` is a package script placeholder for the migration entrypoint; deployment wiring should provide a configured `pg` executor before production use.
- Live PostgreSQL integration remains to be exercised in an environment running PostgreSQL 18 with `uuidv7()`.

## Review fix round

Addressed review findings: added `src/control-plane/cli.ts` so `db:migrate` is executable and uses `WEBLENS_PG_URL`/test URL; tenant transactions now acquire/release dedicated pool clients; migration runner uses a PostgreSQL advisory lock; owner foreign keys were added to tenant tables; opt-in PostgreSQL tests now execute migration idempotency, UUIDv7, and rollback assertions (with explicit skip when unset).

Fix verification: `npm run build` passed; focused control-plane tests passed (3), PostgreSQL test skipped explicitly because `WEBLENS_PG_TEST_URL` is unset.

## Review fix round 2

Migration execution now acquires one dedicated pool client for advisory lock, metadata, DDL, commit/rollback, and unlock. PostgreSQL tests use a per-run temporary schema and cover idempotent migration, UUIDv7 generation, cross-tenant RLS visibility, and rollback cleanup. The organization owner self-FK is deferred initially to permit root owner insertion while preserving the owner=id invariant.

Verification: focused control-plane tests 3 passed, 1 skipped; full `npm test` 88 passed, 1 skipped, 0 failed.

## Review fix round 3

RLS integration operations now run inside explicit BEGIN/set_config/operation/COMMIT transactions on one client. Removed the tautological organization check while retaining the deferred owner self-FK and owner-id invariant.

Verification: `npm run build` and focused control-plane tests passed (3), PostgreSQL skipped explicitly; full `npm test` passed (88), skipped 1, failed 0.

## Review fix round 4

Fixed the configured PostgreSQL rollback case to establish tenant context before inserting, verify the insert succeeds, roll back, and verify the rolled-back row is absent under the tenant context. Added a deferred constraint trigger enforcing that every subject organization points to a self-owning root organization, while allowing root owner insertion (`owner_organization_id = id`) and preserving the deferred self-FK.

Verification:

- `npm run build` — passed (`tsc -p tsconfig.json`).
- `node --test dist/tests/control-plane-database.test.js dist/tests/control-plane-postgres.test.js` — 3 passed, 1 skipped (WEBLENS_PG_TEST_URL not configured).
- `npm test` — 88 passed, 1 skipped, 0 failed (89 tests; 49.979s).
- `git diff --check` — clean.

PostgreSQL live integration remains explicitly skipped because `WEBLENS_PG_TEST_URL` is not configured; the trigger will be exercised when PostgreSQL 18 integration is available.
