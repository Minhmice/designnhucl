import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProfile, guardFindings, scoreDimension } from '../src/scoring.js';
import type { EvidenceBundle, Finding, JudgeResult } from '../src/contracts.js';

const bundle: EvidenceBundle = {
  schemaVersion: 1, runId: 'score-run', targetUrl: 'https://example.com/', captureStartedAt: new Date(0).toISOString(), captureCompletedAt: new Date(1).toISOString(), assessmentStatus: 'complete', accessReason: null,
  artifacts: [{ id: 'e1', kind: 'screenshot', path: 'shot.png', sha256: 'hash', pageId: 'home', viewportId: 'desktop', stateId: 'initial', width: 100, height: 100, truncated: false }],
  refs: [{ artifactId: 'e1', pageId: 'home', viewportId: 'desktop', stateId: 'initial', selector: null, regionId: 'hero', bbox: null }], requiredEvidence: 1, observedEvidence: 1, environmentLimitations: [],
};

test('missing applicable criterion prevents a dimension score', () => {
  const score = scoreDimension([
    { criterionId: 'a', rating: 4, state: 'assessed', evidenceIds: ['e1'], applicabilityReason: null },
    { criterionId: 'b', rating: null, state: 'unobserved', evidenceIds: [], applicabilityReason: null },
  ], { a: 1, b: 1 });
  assert.equal(score.value, null);
  assert.equal(score.state, 'partial');
});

test('anchored ratings normalize deterministically', () => {
  const score = scoreDimension([
    { criterionId: 'a', rating: 3, state: 'assessed', evidenceIds: ['e1'], applicabilityReason: null },
    { criterionId: 'b', rating: 4, state: 'assessed', evidenceIds: ['e1'], applicabilityReason: null },
  ], { a: 1, b: 1 });
  assert.equal(score.value, 88);
  assert.deepEqual(score.coverage, { observed: 2, applicable: 2 });
});

test('guard quarantines missing evidence and deduplicates one defect', () => {
  const base: Finding = {
    id: 'f1', fingerprint: 'same', ruleId: 'weak-hierarchy', category: 'visual', title: 'Weak hierarchy', description: 'Heading and copy have similar weight.', severity: 'high', epistemicType: 'subjective', verification: 'model_only', evidenceIds: ['e1'], recommendation: 'Increase distinction.', acceptanceCriteria: ['Heading is dominant.'], affectedRoutes: ['/'], affectedViewports: ['desktop'],
  };
  const result = guardFindings(bundle, [base, { ...base, id: 'f2' }, { ...base, id: 'f3', fingerprint: 'bad', evidenceIds: ['missing'] }]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.quarantined.length, 1);
  assert.deepEqual(result.accepted[0]?.evidenceIds, ['e1']);
});

test('buildProfile uses classification but does not produce an overall score', () => {
  const judges: JudgeResult[] = [
    { id: 'c', kind: 'classify', status: 'complete', model: 'recording', promptVersion: 'p1', rubricVersion: 'r1', classification: { archetype: 'portfolio', designLanguage: 'brutalist', evidenceConfidence: 'high', evidenceIds: ['e1'] }, ratings: [], findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 } },
    { id: 'v', kind: 'visual', status: 'complete', model: 'recording', promptVersion: 'p1', rubricVersion: 'r1', classification: null, ratings: [{ criterionId: 'visual.hierarchy', rating: 3, state: 'assessed', evidenceIds: ['e1'], applicabilityReason: null }], findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 } },
    { id: 'x', kind: 'experience', status: 'complete', model: 'recording', promptVersion: 'p1', rubricVersion: 'r1', classification: null, ratings: [{ criterionId: 'ux.navigation', rating: 4, state: 'assessed', evidenceIds: ['e1'], applicabilityReason: null }], findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 } },
  ];
  const profile = buildProfile({ bundle, judges, audits: [] });
  assert.equal(profile.classification.designLanguage, 'brutalist');
  assert.equal(profile.dimensions.visual?.value, null);
  assert.equal(profile.dimensions.visual?.state, 'partial');
  assert.equal(profile.assessmentStatus, 'partial');
  assert.equal('overallScore' in profile, false);
  const partial = buildProfile({ bundle, judges, audits: [{ id: 'lighthouse', kind: 'lighthouse', status: 'partial', evidenceIds: [], metrics: {}, findings: [], limitations: ['missing'] }] });
  assert.equal(partial.assessmentStatus, 'partial');
});
