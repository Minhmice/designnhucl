# WebLens v0.1 pilot report

Status: **implementation verification only; human-supervised paid/public pilot not yet run**.

Do not replace the empty fields below with estimates. Record only measured values from an approved run and retain the associated run IDs, model/prompt/rubric versions, and review notes.

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
