import assert from 'node:assert/strict';
import test from 'node:test';

import { assessLead } from '../src/policies/lead.js';
import type { BusinessContext, Finding, QualityProfile } from '../src/contracts.js';

const objectiveFinding: Finding = { id: 'overflow', fingerprint: 'overflow', ruleId: 'horizontal-overflow', category: 'responsive', title: 'Overflow', description: 'Primary content overflows.', severity: 'high', epistemicType: 'objective', verification: 'verified', evidenceIds: ['e1'], recommendation: 'Remove overflow.', acceptanceCriteria: ['No overflow at mobile.'], affectedRoutes: ['/'], affectedViewports: ['mobile'] };
const profile: QualityProfile = {
  schemaVersion: 1, assessmentStatus: 'complete', classification: { archetype: 'local_service', designLanguage: 'clean', evidenceConfidence: 'high', evidenceIds: ['e1'] },
  dimensions: {
    visual: { value: 20, state: 'assessed', method: 'rubric_v1', coverage: { observed: 1, applicable: 1 } },
    responsive: { value: 20, state: 'assessed', method: 'rubric_v1', coverage: { observed: 1, applicable: 1 } },
    ux: { value: 30, state: 'assessed', method: 'rubric_v1', coverage: { observed: 1, applicable: 1 } },
  }, findings: [objectiveFinding], strengths: [], evidenceCoverage: { observed: 2, required: 2 }, versions: { rubric: 'r1', prompt: 'p1', model: 'recording' },
};

const signal = (value: number) => ({ value, evidenceIds: ['business-evidence'], observedAt: new Date(0).toISOString(), provenance: 'provided' as const });
const business = (value: number): BusinessContext => ({ commercialFit: signal(value), fixability: signal(value), activity: signal(value), inScope: true });

test('commercial context can change lead decision without mutating quality', () => {
  const before = structuredClone(profile);
  const weak = assessLead(profile, business(0.1));
  const strong = assessLead(profile, business(0.9));
  assert.notEqual(weak.verdict, strong.verdict);
  assert.equal(strong.verdict, 'HIGH_PRIORITY_PROSPECT');
  assert.deepEqual(profile, before);
});

test('missing business evidence stays WATCH with a null opportunity score', () => {
  const decision = assessLead(profile, { commercialFit: null, fixability: null, activity: null, inScope: true });
  assert.equal(decision.verdict, 'WATCH');
  assert.equal(decision.opportunityScore, null);
  assert.deepEqual(decision.missingSignals.sort(), ['activity', 'commercialFit', 'fixability']);
});

test('out-of-scope targets do not become prospects because quality is low', () => {
  const decision = assessLead(profile, { ...business(1), inScope: false });
  assert.equal(decision.verdict, 'SKIP');
  assert.equal(decision.opportunityScore, null);
});
