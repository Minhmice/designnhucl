# WebLens benchmark protocol

Benchmark labels compare two controlled or authorized captures within the same task, archetype, locale, and relevant viewport/state coverage. Store private screenshots and labels outside Git; this directory contains only the protocol and synthetic examples.

## Labeling

Use at least two independent reviewers for holdout decisions. A record identifies its `familyId`, split, displayed left/right run IDs, expected preference (`left`, `right`, `tie`), and evidence-backed rationale. Normalize the expected answer to displayed order before scoring. `insufficient` is a judge abstention, not a hidden tie.

Do not infer commercial fit from which page looks better. Lead business labels are a separate review stream with provenance.

## Splits and leakage

All siblings from a domain/template/client family belong to one split. `validateFamilySplits` rejects development/holdout family overlap. Holdout examples must not be used as prompt examples, retrieval anchors, threshold tuning input, or manual retry targets.

## Metrics

`summarizePairs` reports exact correct, eligible, attempted, tie, and abstention counts. Accuracy uses attempted eligible judgments; coverage uses all eligible labeled pairs. An abstain-everywhere judge therefore has zero coverage and null accuracy.

Fresh variance runs must disable caches and record provider request IDs, attempts, model, prompt/rubric hashes, latency, and token usage. Offline development should use frozen recordings so the default test suite is deterministic and free of paid calls.

## Running the synthetic evaluator tests

```powershell
npm run build
node --test dist/tests/benchmark.test.js
```
