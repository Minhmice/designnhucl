import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CriterionRatingSchema,
  EvaluationRecipeSchema,
  EvaluationRunSchema,
  LeadDecisionSchema,
  QualityProfileSchema,
  RunInputSchema,
} from '../src/contracts.js';

test('rejects an invalid declared URL assertion pattern before capture', () => {
  assert.throws(() => RunInputSchema.parse({
    url: 'http://127.0.0.1:3000', recipeId: 'critic-standard',
    context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [{ id: 'bad-regex', description: 'bad', required: true, check: { route: '/', action: { kind: 'click', selector: '#ok' }, assertion: { kind: 'url', pattern: '[' } } }], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'local-only', allowedPrivateOrigins: ['http://127.0.0.1:3000'], enforcementProfile: 'local-deny-all' }, artifactRoot: 'runs', baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  }), /regular expression/i);
});
import { recipes } from '../src/recipes.js';

test('missing evidence stays unobserved instead of becoming zero', () => {
  const rating = CriterionRatingSchema.parse({
    criterionId: 'visual.hierarchy',
    rating: null,
    state: 'unobserved',
    evidenceIds: [],
    applicabilityReason: null,
  });
  assert.equal(rating.rating, null);
  assert.equal(rating.state, 'unobserved');
});

test('assessed ratings require evidence and a numeric anchor', () => {
  assert.throws(() => CriterionRatingSchema.parse({
    criterionId: 'visual.hierarchy',
    rating: 4,
    state: 'assessed',
    evidenceIds: [],
    applicabilityReason: null,
  }));
});

test('not-applicable ratings require a reason', () => {
  assert.throws(() => CriterionRatingSchema.parse({
    criterionId: 'conversion.checkout',
    rating: null,
    state: 'not_applicable',
    evidenceIds: [],
    applicabilityReason: null,
  }));
});

test('recipes preserve the two required viewports and resource caps', () => {
  const lead = EvaluationRecipeSchema.parse(recipes['lead-fast']);
  const critic = EvaluationRecipeSchema.parse(recipes['critic-standard']);
  assert.deepEqual(lead.viewports.map(({ width, height }: { width: number; height: number }) => [width, height]), [[1440, 900], [390, 844]]);
  assert.equal(lead.maxPages, 1);
  assert.equal(critic.maxPages, 3);
  assert.equal(critic.maxInteractions, 5);
});

test('quality profiles cannot contain a lead decision', () => {
  const profile = {
    schemaVersion: 1,
    assessmentStatus: 'complete',
    classification: {
      archetype: 'local_service',
      designLanguage: 'clean-professional',
      evidenceConfidence: 'high',
      evidenceIds: ['e1'],
    },
    dimensions: {},
    findings: [],
    strengths: [],
    evidenceCoverage: { observed: 2, required: 2 },
    versions: { rubric: 'rubric-v1', prompt: 'prompt-v1', model: 'recording' },
    leadDecision: LeadDecisionSchema.parse({
      verdict: 'SKIP', opportunityScore: 10, signals: {}, missingSignals: [], reasonCodes: [],
    }),
  };
  assert.throws(() => QualityProfileSchema.parse(profile));
});

test('preflight failures cannot masquerade as an unscorable website', () => {
  assert.throws(() => EvaluationRunSchema.parse({
    schemaVersion: 1,
    runId: 'run-1',
    executionStatus: 'not_started',
    assessmentStatus: 'unscorable',
    inputHash: 'abc',
    errors: [{ stage: 'preflight', code: 'missing_egress', origin: 'environment', retryable: false, evidenceIds: [] }],
  }));
});
