# WebLens v0.1 pilot report

Status: **implementation verification refreshed 2026-09-11; human-supervised paid/public pilot not yet run**.

Do not replace the empty fields below with estimates. Record only measured values from an approved run and retain the associated run IDs, model/prompt/rubric versions, and review notes.

## 2026-09-11 implementation verification (not the supervised pilot)

This run exercised the local-origin fixture path with the deterministic recording judge used by the repository's end-to-end tests. It does not represent a paid model run, a human-reviewed pilot, or public capture, so the pilot outcome fields below remain intentionally empty.

| Check | Measured result |
|---|---|
| Runtime | Node.js v25.2.1; Playwright 1.63.0 |
| Full suite (`npm test`) | 174 tests: 173 passed, 0 failed, 1 skipped (PostgreSQL URL not configured) |
| Lead/Critic local fixture (`npm run test:e2e`) | 5 passed, 0 failed |
| Network preflight (`npm run test:network`) | 5 passed, 0 failed |
| Lead/Critic policy gates (`npm run test:policies`) | 13 passed, 0 failed |
| Live judge credential / approved cost | Not configured (`OPENAI_API_KEY`, `WEBLENS_ESTIMATED_RUN_COST_USD`) |
| Human operator / reviewer | Not assigned for this verification run |
| Public capture | Not attempted; standalone public mode is intentionally fail-closed |

The local scenarios covered shared Lead/Critic evaluation, challenge-to-unscorable behavior with zero judge calls, incomplete mobile evidence, an objective disabled-CTA blocker, and compatible recapture reporting a fixed finding. They produced no paid token or cost measurements.

PostgreSQL 18 is running locally on port 5432, but no operator-provided `WEBLENS_PG_TEST_URL` was available. A no-password probe reached SCRAM authentication and failed before migration, so migration/RLS behavior is not claimed from this run. Run `npm run test:postgres` with a disposable PostgreSQL 18 URL before merging the foundation PR.

**Verification disposition:** local implementation checks are green; the supervised paid/public pilot and PostgreSQL migration/RLS check remain release prerequisites, not completed outcomes.

## Pilot scope

| Field | Measured value |
|---|---|
| Dates | — |
| Approved operator / reviewer | — |
| Critic staging targets | — |
| Shadow Lead domains (maximum 30, no outreach) | — |
| Model and version | — |
| Prompt / rubric versions | — |
| Network enforcement profile and verification | — |

## Outcomes

| Metric | Numerator / denominator | Result |
|---|---|---|
| Capture completion rate | — / — | — |
| Unscorable rate by reason | — / — | — |
| Pairwise quality accuracy | — / — eligible | — |
| Pairwise coverage | — / — total | — |
| Lead precision at selected threshold | — / — reviewed | — |
| Critic blocker precision | — / — reviewed | — |
| Critic fix acceptance rate | — / — suggestions | — |
| Median / p95 latency | — | — |
| Actual tokens per completed run | — | — |
| Estimated and billed cost per completed run | — | — |

## Required qualitative review

- False-positive leads and which business signal was misleading.
- Missed redesign opportunities and missing evidence.
- Critiques that were technically true but unhelpful for the brief.
- Accessibility findings that required manual confirmation.
- Model-only claims rejected by the evidence guard.
- Any prompt injection, challenge, consent, skeleton, or partial-capture behavior.
- Reviewer agreement/disagreement, including rationale and domain family.

## Failure drills

Record the run/result for provider unavailable, malformed model output, absent enforcement, target timeout, challenge, budget/cap rejection, artifact write failure, and incompatible baseline. None may silently fall back to `PASS` or fabricate a score.

## Go / no-go

Expand beyond the supervised pilot only if connection-time network enforcement is independently validated, evidence is reviewable, benchmark coverage is non-trivial, lead/critic errors are acceptable for the declared scope, and measured cost/latency are sustainable. Thresholds in v0.1 are calibration alarms, not permission to remove human review.
