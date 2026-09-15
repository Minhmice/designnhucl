# WebLens meta-evaluation

Meta-evaluation evaluates trustworthiness of WebLens evaluator, not website quality alone. It repeats same evaluation path, then checks whether scores and findings are stable, evidence-grounded, schema-compliant, and complete against repository rubric.

## Required flow

Promptfoo is orchestration and assertion reporting. WebLens custom evaluator is authority for capture, audit, judge, scoring, and trust metrics. Each experiment must run at least **5 repeats**. A single website run is not a meta-evaluation.

1. Run full WebLens pipeline five times. Each repeat captures target, runs deterministic audits, invokes judge stages, builds profile, and persists its own run.
2. Aggregate criterion and dimension statistics across repeats: mean, median, variance, standard deviation, coefficient of variation, range, exact agreement, within-one agreement, unobserved and not-applicable rates.
3. Check classification stability and finding recurrence/attribute agreement.
4. Check hallucination risk: every finding must cite existing evidence; deterministic findings must be objectively verified; unsupported/model-only claims are not treated as facts. `unsupportedClaimRate` is a proxy, not proof of factual accuracy.
5. Check rubric adherence: expected criterion IDs, schema, evidence citations, finding recommendation and acceptance criteria. Missing or unexpected criteria fail coverage.
6. Check arithmetic and measurement claims against stored deterministic artifacts. Lighthouse, axe, runtime, overflow, and requirement results come from artifacts, not model text.
7. Promptfoo assertions gate trust report. Promptfoo does not invent or independently calculate website scores.

## Trust gate

`report.trust.passed` is true only when all conditions hold:

- at least 5 repeats;
- every requested repeat completes and is scorable;
- mean criterion standard deviation <= 0.8;
- mean exact agreement >= 0.80;
- mean within-one agreement >= 0.95;
- mean finding recurrence >= 0.80;
- evidence existence = 1.0;
- evidence support >= 0.90;
- complete rubric coverage = 1.0;
- schema/evidence adherence = 1.0;
- deterministic numeric integrity = 1.0 when numeric audit metrics exist.

Thresholds are operational alarms. They do not establish human-calibrated accuracy. Calibration needs independent human labels in `benchmarks/golden/` with grouped development/holdout splits and at least two reviewers.

## Promptfoo command

```powershell
npm run eval:promptfoo:atad
```

Configuration lives in `evals/promptfoo/promptfooconfig.yaml`. It sets `sampleCount: 5`, persists full output under `evals/promptfoo/results/atad/`, and runs reliability plus trust assertions. Compact Promptfoo payload includes full criterion statistics and `trust`; complete report remains in `meta-eval.json` and `report.md`.

## Modes

- `frozen-judge-consistency`: one immutable evidence bundle, repeated judge calls. Measures judge variance only.
- `pipeline-consistency`: repeats browser capture, deterministic audit, evidence, judge, and scoring. Use this for end-to-end evaluator trust.
- `calibration`: compares predictions to independent human labels. Required for accuracy claims.
- `regression`: compares reports against configured metric thresholds.

Never report a one-repeat result as consistency, hallucination, or accuracy proof. Mark missing evidence, failed runs, unscorable runs, and absent calibration as unavailable or failed—not as zero-quality website scores.
