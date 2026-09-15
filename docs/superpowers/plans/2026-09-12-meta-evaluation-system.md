# WebLens Meta-Evaluation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated, deterministic TypeScript meta-evaluation library that measures WebLens judge/pipeline consistency, evidence grounding, output adherence, human calibration, and evaluator regressions without changing normal production evaluation.

**Architecture:** New pure functions live under `src/evals/` and consume existing `EvaluationRun`, `JudgeResult`, `EvidenceBundle`, rubric, and benchmark types. A separate orchestration layer reads frozen runs or invokes an injected runner, then writes `eval-runs/<eval-id>/` artifacts; no code in `runner.ts`, capture, audits, scoring, or policies calls this layer. An optional Promptfoo provider under `evals/promptfoo/` depends only on the public eval APIs and is never imported by production code.

**Tech Stack:** TypeScript/Node.js 24, Zod schemas already in `src/contracts.ts`, Node test runner, JSON/Markdown reports, optional Promptfoo config/provider with no production dependency.

**Spec:** User-provided meta-evaluation specification in `C:\Users\Admin\.codex\attachments\acccf7dc-83b6-468e-bd55-34ee335dbda5\pasted-text.txt`

## Global Constraints

- Preserve the behavior and public signatures of `captureSite()`, `auditBundle()`, `runJudges()`, `buildProfile()`, `assessCritic()`, `assessLead()`, and `evaluate()`.
- Meta-evaluation is explicit only; `weblens evaluate` must not repeat calls, load Promptfoo, or add cost.
- Promptfoo remains optional and must not be a production dependency or semantic authority.
- Historical WebLens artifacts are immutable; write derived results under `eval-runs/`.
- Never turn missing, unobserved, or not-applicable data into rating zero.
- Keep development/holdout family isolation and do not expose holdout labels to judges.
- Default tests use synthetic/frozen fixtures and make no paid cloud calls.
- Every report records mode, sample count, run/evidence hashes, model/provider, prompt/rubric versions, engine/schema versions, and metric implementation version.

### Task 1: Evaluation types and statistics foundation

**Files:**
- Create: `src/evals/types.ts`
- Create: `src/evals/statistics.ts`
- Create: `src/evals/index.ts`
- Test: `tests/eval-statistics.test.ts`

**Interfaces:**
- `NumericSummary` contains `samples`, `mean`, `median`, `variance`, `standardDeviation`, `minimum`, `maximum`, `range`, and nullable `coefficientOfVariation`.
- `summarizeNumbers(values: readonly number[]): NumericSummary` ignores no supplied values and returns null-valued statistics for an empty list.
- `distribution0To4(values: readonly (0|1|2|3|4)[]): Record<'0'|'1'|'2'|'3'|'4', number>`.
- `EvalProvenance`, `EvaluationMode`, and `MetaEvaluationReport` are additive serializable types; all metric fields that cannot be computed are nullable.

- [ ] **Step 1: Write failing tests** for empty/single/mixed numeric samples, variance/stdev, zero-mean CV, 0–4 distribution, and preservation of null/unobserved states.
- [ ] **Step 2: Run `npm run build; node --test dist/tests/eval-statistics.test.js`** and confirm failures are due to missing exports.
- [ ] **Step 3: Implement pure statistics and shared eval types** without imports from Promptfoo, OpenAI, filesystem, or environment.
- [ ] **Step 4: Re-run the targeted test and confirm all statistics assertions pass.**
- [ ] **Step 5: Run `npm run build` and commit the foundation as an additive change.**

### Task 2: Frozen judge consistency, classification stability, and finding stability

**Files:**
- Create: `src/evals/consistency.ts`
- Create: `src/evals/classification-stability.ts`
- Create: `src/evals/finding-stability.ts`
- Modify: `src/evals/index.ts`
- Test: `tests/eval-consistency.test.ts`, `tests/eval-finding-stability.test.ts`

**Interfaces:**
- `calculateCriterionConsistency(judges: readonly JudgeResult[]): CriterionConsistencyReport[]` groups ratings by criterion and reports numeric summary, exact/within-one agreement, 0–4 distribution, unobserved rate, and not-applicable rate.
- `calculateDimensionConsistency(profiles: readonly QualityProfile[]): Record<string, NumericSummary>` summarizes non-null dimension values.
- `calculateClassificationStability(judges: readonly JudgeResult[]): ClassificationStabilityReport` reports modal archetype/design language, agreement rates, confidence distribution, and optional entropy.
- `calculateFindingStability(profiles: readonly QualityProfile[], options?: FindingStabilityOptions): FindingStabilityReport` deterministically matches fingerprint/rule/category/route/viewport, optionally invokes an injected `SemanticFindingMatcher`, and reports recurrence, severity/evidence/recommendation agreement, unique and unstable findings.

- [ ] **Step 1: Write failing tests** for identical/mixed/null criterion ratings, classification modes, repeated/missing findings, severity disagreement, and semantic matcher fallback.
- [ ] **Step 2: Run targeted tests and verify expected failures.**
- [ ] **Step 3: Implement deterministic grouping/matching and configurable stability classification thresholds.**
- [ ] **Step 4: Add semantic matching only as an optional interface; core reports remain usable without it.**
- [ ] **Step 5: Run targeted tests, build, and commit.**

### Task 3: Evidence grounding and requirement adherence

**Files:**
- Create: `src/evals/grounding.ts`
- Create: `src/evals/adherence.ts`
- Modify: `src/evals/index.ts`
- Test: `tests/eval-grounding.test.ts`, `tests/eval-adherence.test.ts`

**Interfaces:**
- `EvidenceSupportEvaluator` has `evaluate(input: EvidenceSupportInput): Promise<EvidenceSupportResult>` and is independent of OpenAI.
- `calculateEvidenceExistence(findings: readonly Finding[], bundle: EvidenceBundle): EvidenceExistenceReport` computes existence separately from support.
- `calculateGrounding(findings, bundle, options): Promise<GroundingReport>` combines deterministic checks with optional model/human support labels and reports supported/partial/unsupported/insufficient rates.
- `checkJudgeAdherence(judge: JudgeResult, rubricCriteria: Record<string, readonly string[]>): AdherenceReport` validates required/extra criteria, evidence IDs, null-unobserved rules, finding recommendations/acceptance criteria, and schema compliance using `JudgeResultSchema`.

- [ ] **Step 1: Write failing tests** for missing/existing evidence, deterministic axe/Lighthouse/runtime/interaction support, unsupported and insufficient claims, missing/extra criteria, and malformed findings.
- [ ] **Step 2: Run targeted tests and verify failures.**
- [ ] **Step 3: Implement deterministic grounding rules keyed by `ruleId`/audit evidence, then call the optional evaluator only for subjective claims.**
- [ ] **Step 4: Implement structural adherence checks using existing Zod schemas and rubric IDs.**
- [ ] **Step 5: Run targeted tests, build, and commit.**

### Task 4: Human calibration and golden dataset extension

**Files:**
- Create: `src/evals/calibration.ts`
- Create: `benchmarks/golden/README.md`
- Create: `benchmarks/golden/labels.example.jsonl`
- Modify: `benchmarks/evaluate.ts`
- Test: `tests/eval-calibration.test.ts`

**Interfaces:**
- `HumanRatingLabel` stores family/item/criterion, reviewer ID, split, rating, and evidence reference without embedding private screenshots.
- `aggregateHumanLabels(labels): HumanConsensus[]` calculates median/consensus, disagreement, and label confidence while preserving reviewer disagreement.
- `calculateCalibration(predictions, consensus): CalibrationReport` returns MAE, RMSE, exact/within-one agreement, Spearman correlation when defined, bias, and per-criterion error.
- Extend benchmark split validation so every family belongs to exactly one development/holdout split; holdout labels are never loaded by production judges.

- [ ] **Step 1: Write failing tests** for perfect agreement, ±1 systematic bias, reviewer disagreement, missing labels, and family leakage.
- [ ] **Step 2: Run tests and verify failures.**
- [ ] **Step 3: Implement consensus aggregation and calibration metrics with nulls for insufficient samples.**
- [ ] **Step 4: Add synthetic golden-label examples and documentation without private evidence.**
- [ ] **Step 5: Run targeted tests, existing benchmark tests, build, and commit.**

### Task 5: Regression comparison and report persistence

**Files:**
- Create: `src/evals/regression.ts`
- Create: `src/evals/report.ts`
- Create: `src/evals/orchestrator.ts`
- Modify: `src/evals/index.ts`
- Test: `tests/eval-regression.test.ts`, `tests/eval-report.test.ts`

**Interfaces:**
- `compareMetaEvaluations(baseline: MetaEvaluationReport, candidate: MetaEvaluationReport, thresholds: RegressionThresholds): RegressionReport` checks variance, grounding, calibration, finding stability, adherence, abstention, cost, and latency deltas and returns explicit compatibility reasons.
- `renderMetaReport(report: MetaEvaluationReport): { json: string; markdown: string }` is bounded and deterministic.
- `saveMetaEvaluation(report, root = './eval-runs'): Promise<string>` writes `eval.json`, `report.json`, and `report.md` atomically without touching `runs/<runId>`.
- `evaluateFrozenJudges(input: FrozenJudgeEvaluationInput): Promise<MetaEvaluationReport>` consumes one immutable `EvidenceBundle` and injected repeated judge calls; `evaluatePipelineRepeats(input: PipelineRepeatInput): Promise<MetaEvaluationReport>` invokes an injected full-run function and labels mode separately.

- [ ] **Step 1: Write failing tests** for compatible/imcompatible provenance, candidate degradation/improvement, configurable thresholds, atomic report output, frozen no-recapture behavior, and pipeline mode labeling.
- [ ] **Step 2: Run targeted tests and verify failures.**
- [ ] **Step 3: Implement regression gates, bounded report rendering, and artifact persistence.**
- [ ] **Step 4: Implement explicit orchestration with call-count/cost projection before repeated paid runs; no automatic production hook.**
- [ ] **Step 5: Run targeted tests, build, and commit.**

### Task 6: Optional Promptfoo adapter

**Files:**
- Create: `evals/promptfoo/provider.ts`
- Create: `evals/promptfoo/assertions/consistency.ts`
- Create: `evals/promptfoo/assertions/grounding.ts`
- Create: `evals/promptfoo/assertions/adherence.ts`
- Create: `evals/promptfoo/promptfooconfig.example.yaml`
- Test: `tests/promptfoo-adapter.test.ts`
- Modify: `package.json` only if Promptfoo is added as a dev-only optional dependency; otherwise document external installation.

**Interfaces:**
- Provider translates Promptfoo test variables into `evaluateFrozenJudges` or `evaluatePipelineRepeats` through injected WebLens functions.
- Assertions import `src/evals` pure functions and return Promptfoo-compatible pass/fail details; they do not duplicate scoring or policy logic.

- [ ] **Step 1: Write adapter tests** with a mocked WebLens evaluator and no Promptfoo import in production modules.
- [ ] **Step 2: Run tests and verify the adapter fails before implementation.**
- [ ] **Step 3: Implement a thin provider and assertions with explicit no-cache/sample-count options.**
- [ ] **Step 4: Verify package dependency graph has no production Promptfoo dependency and run adapter tests.**
- [ ] **Step 5: Build and commit.**

### Task 7: Documentation, commands, and compatibility verification

**Files:**
- Create: `docs/meta-evaluation.md`
- Modify: `README.md` with a short link/command section only.
- Test: all existing tests plus all `tests/eval-*.test.ts` and `tests/promptfoo-adapter.test.ts`.

- [ ] **Step 1: Document production-vs-meta boundaries, judge/pipeline modes, metrics, grounding epistemics, calibration splits, provenance, cost controls, and Promptfoo optionality.**
- [ ] **Step 2: Document exact commands for build, unit tests, frozen consistency, pipeline repeats, and Promptfoo experiments.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Run `npm test` and confirm all existing and new tests pass with no paid calls.**
- [ ] **Step 5: Inspect `git diff` for accidental production behavior changes or artifact mutations, then finalize with architecture/file/safety summary.**

