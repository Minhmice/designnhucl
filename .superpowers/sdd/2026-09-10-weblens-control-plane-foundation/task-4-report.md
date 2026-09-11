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

## Review round 1

- Added owner-qualified alias/fact joins in fallback resolution and conservative single-evidence rejection.
- Added presence-based optional ID/empty-field guards and explicit consent-status enforcement for outreach.
- Added regression coverage for cross-tenant SQL predicates, ambiguity, and public-listing consent rejection.

## Review round 2

- Added ordered migration `002_identity_provenance.sql` introducing `source_kind` (`registry|company|other`) and source-kind API support.
- Added explicit consent-status and legal/executive predicate provenance guards, plus presence-based optional-field validation through the repository boundary.
- Fallback joins now inject owner predicates for aliases and facts and reject a single fallback signal; exact/legal/domain precedence remains unchanged.

## Review round 3

- Source-kind aliases now preserve `sourceKind`; provenance predicates require an explicit source ID and matching registry/company kind at the API guard.

## Review round 4

- Added owner-scoped preflight checks for referenced organizations, people, sources, and role/contact relationships before mutation dispatch.
- Provenance-sensitive facts now validate the persisted `sources.source_kind` row under the owner tenant; caller-supplied source kind is not trusted.
- Build passes after the changes. Full `npm test` was attempted but did not emit completion output in the allotted wait window.

## Review round 5

- Provenance-sensitive facts now reject a missing `sourceId` before opening the owner transaction, then read the persisted, owner-scoped source row inside the same mutation transaction. Legal/registration/tax predicates require `registry`; executive/CEO/representative predicates require `company`.
- All known fact subject aggregates (organization, person, source, legal entity, role, contact channel, web property, and alias) use a fixed owner-scoped preflight lookup in the same transaction as the append. Cross-owner rows are invisible to that lookup and no insert is issued.
- Replaced fallback signal arithmetic with a tenant-scoped `candidate_signals` aggregate. It counts `DISTINCT` alias/domain/address signal kinds, so duplicate evidence cannot inflate corroboration. Exactly one candidate with at least two independent kinds resolves; multiple are ambiguous; none is unresolved. Address evidence is restricted to address predicates.
- Application normalization remains NFKC + trim + whitespace-collapse + lowercase. The normalization migration no longer calls a non-portable PostgreSQL function while backfilling existing display values.

## Verification

- `npm run build` — passed.
- `node --test dist/tests/control-plane-identity.test.js` — passed (45/45).
- `npm test` — passed.
