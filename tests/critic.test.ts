import assert from 'node:assert/strict';
import test from 'node:test';

import { assessCritic, type CriticGates } from '../src/policies/critic.js';
import type { EvaluationContext, Finding, QualityProfile } from '../src/contracts.js';

const high = { value: 85, state: 'assessed' as const, method: 'rubric_v1' as const, coverage: { observed: 1, applicable: 1 } };
const profile = (findings: Finding[] = []): QualityProfile => ({
  schemaVersion: 1, assessmentStatus: 'complete', classification: { archetype: 'saas', designLanguage: 'editorial', evidenceConfidence: 'high', evidenceIds: ['e1'] },
  dimensions: { visual: high, ux: high, responsive: high }, findings, strengths: [], evidenceCoverage: { observed: 2, required: 2 }, versions: { rubric: 'r1', prompt: 'p1', model: 'recording' },
});
const context = (review: EvaluationContext['qualityReview'] = null): EvaluationContext => ({ objective: 'Explain and sell the product', audience: 'Design teams', locale: 'en', archetypeHint: 'saas', primaryAction: 'Start trial', routes: ['/'], requirements: [{ id: 'primary-cta', description: 'Primary CTA works', required: true }], referenceIds: [], qualityReview: review });
const gates: CriticGates = { visualMin: 75, uxMin: 75, responsiveMin: 75, observedRequirementIds: ['primary-cta'], runId: 'run-1', profileHash: 'profile-hash', subjectContextHash: 'context-hash' };

test('missing brief cannot pass a release gate', () => {
  const decision = assessCritic(profile(), { ...context(), objective: null }, gates);
  assert.equal(decision.verdict, 'REVIEW');
});

test('a reproduced objective blocker requires iteration even with high scores', () => {
  const blocker: Finding = { id: 'cta', fingerprint: 'cta', ruleId: 'primary-cta-broken', category: 'ux', title: 'CTA is broken', description: 'The declared primary CTA did not navigate.', severity: 'blocker', epistemicType: 'objective', verification: 'verified', evidenceIds: ['e1'], recommendation: 'Repair the CTA.', acceptanceCriteria: ['CTA performs declared action.'], affectedRoutes: ['/'], affectedViewports: ['desktop'] };
  const decision = assessCritic(profile([blocker]), context(), gates);
  assert.equal(decision.verdict, 'ITERATE');
  assert.equal(decision.prioritizedFixes[0]?.findingId, 'cta');
});

test('model-only quality scores never auto-pass or auto-fail during pilot', () => {
  const decision = assessCritic(profile(), context(), gates);
  assert.equal(decision.verdict, 'REVIEW');
});

test('human acceptance of the exact run can pass all observed gates', () => {
  const review = { runId: 'run-1', profileHash: 'profile-hash', subjectContextHash: 'context-hash', reviewerId: 'reviewer', reviewedAt: new Date().toISOString(), decision: 'accept' as const, findingIds: [] };
  const decision = assessCritic(profile(), context(review), gates);
  assert.equal(decision.verdict, 'PASS');
});

test('human acceptance cannot pass dimensions below the review thresholds', () => {
  const review = { runId: 'run-1', profileHash: 'profile-hash', subjectContextHash: 'context-hash', reviewerId: 'reviewer', reviewedAt: new Date().toISOString(), decision: 'accept' as const, findingIds: [] };
  const low = { value: 25, state: 'assessed' as const, method: 'rubric_v1' as const, coverage: { observed: 1, applicable: 1 } };
  const decision = assessCritic({ ...profile(), dimensions: { visual: low, ux: high, responsive: high } }, context(review), gates);
  assert.equal(decision.verdict, 'REVIEW');
  assert.deepEqual(decision.failedGates, ['visual_below_threshold']);
});

test('missing required viewport or check remains review', () => {
  const partial = { ...profile(), assessmentStatus: 'partial' as const, evidenceCoverage: { observed: 1, required: 2 } };
  assert.equal(assessCritic(partial, context(), gates).verdict, 'REVIEW');
  assert.equal(assessCritic(profile(), context(), { ...gates, observedRequirementIds: [] }).verdict, 'REVIEW');
});
