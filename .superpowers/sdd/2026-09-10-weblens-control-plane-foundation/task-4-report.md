# Task 4 TDD Report — Organization identity and field provenance

## Scope

Implemented tenant-safe identity/provenance repositories in `src/control-plane/identity.ts` and focused tests in `tests/control-plane-identity.test.ts`.

## Design

- All repository calls validate the owner UUID before invoking the injected `IdentityTenantRunner`; SQL runs inside `withTenant(ownerOrganizationId, ...)` and includes owner predicates/parameters. Subject organization IDs are always data values and are never used as tenant selectors.
- Organization, alias, legal-entity, source, fact, person, role, contact-channel, and web-property creation methods use parameterized SQL and return mapped domain records.
- Facts use insert-only writes and retain subject type/id, predicate, JSON value, source, confidence, observed timestamp, extractor, and status. No update/delete API is exposed, preserving contradictory and historical observations.
- Organization resolution evaluates exact registration ID, normalized legal name + jurisdiction, verified domain, then corroborated alias/address evidence. A query yielding multiple candidates returns `ambiguous`; no fuzzy auto-merge is performed.
- Contact validation rejects outreach when `doNotContact` is true, when no explicit permission reason is supplied, or when outreach permission is otherwise absent. Public contact data is not treated as consent.
- UUID, bounded text, domain, timestamp, enum, confidence range, and JSON (including cycle/non-finite) validation occurs before executor calls.
- Specialized repository class names are exported as thin tenant-safe wrappers over `IdentityRepository` for callers preferring one repository per concern.

## Tests

`npm run build` and `node --test dist/tests/control-plane-identity.test.js` pass (4/4). Tests assert parameterized tenant SQL, append-only provenance, resolution precedence and ambiguity, and contact permission/do-not-contact guards.

## Follow-up considerations

- Production migrations currently permit nullable confidence/source by schema design; repository preserves those values while validating supplied values.
- If callers require stronger corroboration scoring for alias/domain/address evidence, add a dedicated evidence-count query without changing precedence or merge behavior.
