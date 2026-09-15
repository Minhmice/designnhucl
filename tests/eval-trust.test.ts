import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePipelineRepeats } from '../src/evals/index.js';
import type { EvaluationRun, JudgeResult } from '../src/contracts.js';

const judge = (rating: 0|1|2|3|4): JudgeResult => ({
  id: 'visual', kind: 'visual', status: 'complete', model: 'm', promptVersion: 'p', rubricVersion: 'r',
  classification: null,
  ratings: ['visual.hierarchy','visual.composition','visual.typography','visual.spacing','visual.color','visual.assets','visual.consistency','visual.polish'].map(criterionId => ({ criterionId, rating, state: 'assessed', evidenceIds: ['e'], applicabilityReason: null })),
  findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 },
});

const completeJudges = (rating: 0|1|2|3|4): JudgeResult[] => [
  { ...judge(rating), kind: 'classify', ratings: [], classification: { archetype: 'x', designLanguage: 'y', evidenceConfidence: 'high', evidenceIds: ['e'] } },
  judge(rating),
  { ...judge(rating), kind: 'experience', ratings: ['ux.information-architecture','ux.cta-clarity','ux.readability','responsive.behavior','conversion.affordances'].map(criterionId => ({ criterionId, rating, state: 'assessed', evidenceIds: ['e'], applicabilityReason: null })) },
];

const run = (rating: 0|1|2|3|4): EvaluationRun => ({
  schemaVersion: 1, runId: crypto.randomUUID(), executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'input',
  bundle: { schemaVersion: 1, runId: 'bundle', targetUrl: 'https://example.com/', captureStartedAt: new Date().toISOString(), captureCompletedAt: new Date().toISOString(), assessmentStatus: 'complete', accessReason: null, artifacts: [{ id: 'e', kind: 'screenshot', path: 'e', sha256: 'hash', pageId: 'home', viewportId: 'desktop', stateId: 'initial', width: 1, height: 1, truncated: false }], refs: [], requiredEvidence: 1, observedEvidence: 1, environmentLimitations: [], requirementChecks: [] },
  audits: [], judges: completeJudges(rating), profile: { schemaVersion: 1, assessmentStatus: 'complete', classification: { archetype: 'x', designLanguage: 'y', evidenceConfidence: 'high', evidenceIds: ['e'] }, dimensions: {}, findings: [], strengths: [], evidenceCoverage: { observed: 1, required: 1 }, versions: { rubric: 'r', prompt: 'p', model: 'm' } }, leadDecision: null, criticDecision: null, errors: [],
});

test('pipeline trust gate requires five runs and reports complete criterion metrics', async () => {
  const report = await evaluatePipelineRepeats({ repeats: 5, run: async () => run(3) });
  assert.equal(report.trust?.sufficientRepeats, true);
  assert.equal(report.trust?.passed, false);
  assert.equal(report.trust?.criterionCoverage, 1);
  assert.equal(report.trust?.completeCriterionCoverage, 1);
  assert.equal(report.trust?.numericIntegrityRate, null);
  assert.equal(report.trust?.meanStandardDeviation, 0);
  assert.equal(report.consistency?.criteria[0]?.standardDeviation, 0);
  assert.equal(report.pipeline?.successfulRuns, 5);
});

test('pipeline trust gate rejects missing rubric criteria', async () => {
  const report = await evaluatePipelineRepeats({ repeats: 5, run: async () => ({ ...run(3), judges: [judge(3)] }) });
  assert.equal(report.trust?.passed, false);
  assert.equal(report.trust?.reasons.includes('judge_stage_or_rubric_coverage_incomplete'), true);
});
