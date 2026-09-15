import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGrounding } from '../src/evals/index.js';
import type { EvidenceBundle, Finding } from '../src/contracts.js';
const bundle = { artifacts: [
  { id: 'e', kind: 'dom', path: 'e', sha256: 'x', pageId: 'home', viewportId: 'desktop', stateId: 'initial', width: null, height: null, truncated: false },
  { id: 'axe', kind: 'audit', path: 'axe', sha256: 'y', pageId: 'home', viewportId: 'desktop', stateId: 'initial', width: null, height: null, truncated: false },
], } as unknown as EvidenceBundle;
const finding = (evidenceIds: string[], ruleId = 'page-error'): Finding => ({ id: 'f', fingerprint: 'a'.repeat(64), ruleId, category: 'ux', title: 'x', description: 'x', severity: 'high', epistemicType: 'objective', verification: 'verified', evidenceIds, recommendation: 'fix', acceptanceCriteria: ['pass'], affectedRoutes: ['/'], affectedViewports: ['desktop'] });
const subjective = (evidenceIds: string[]): Finding => ({ ...finding(evidenceIds, 'hierarchy.nav'), epistemicType: 'subjective', verification: 'model_only', category: 'visual' });
test('grounding distinguishes evidence existence from support', async () => {
  const report = await calculateGrounding([finding(['e']), finding(['missing'])], bundle);
  assert.equal(report.evidenceExistenceRate, 0.5);
  assert.equal(report.results[0]?.evidenceSupport, 'supported');
  assert.equal(report.results[1]?.evidenceSupport, 'insufficient');
});
test('raw axe rule IDs with audit evidence count as supported, model-only does not dilute support rate', async () => {
  const report = await calculateGrounding([finding(['axe'], 'heading-order'), subjective(['e'])], bundle);
  assert.equal(report.results[0]?.evidenceSupport, 'supported');
  assert.equal(report.results[1]?.evidenceSupport, 'insufficient');
  assert.equal(report.evidenceSupportRate, 1);
  assert.equal(report.unsupportedClaimRate, 0);
  assert.equal(report.insufficientEvidenceRate, 0.5);
});
