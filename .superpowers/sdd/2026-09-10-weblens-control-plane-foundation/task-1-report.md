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
