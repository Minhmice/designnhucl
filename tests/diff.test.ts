import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRuns } from '../src/diff.js';
import { renderReports } from '../src/reports.js';
import type { EvaluationRun, Finding, QualityProfile } from '../src/contracts.js';

const defect: Finding = { id: 'f1', fingerprint: 'fp1', ruleId: 'overflow', category: 'responsive', title: '<script>alert(1)</script>', description: 'Content overflows.', severity: 'high', epistemicType: 'objective', verification: 'verified', evidenceIds: ['e1'], recommendation: 'Remove overflow.', acceptanceCriteria: ['No overflow.'], affectedRoutes: ['/'], affectedViewports: ['mobile'] };
const profile = (findings: Finding[], status: QualityProfile['assessmentStatus'] = 'complete'): QualityProfile => ({ schemaVersion: 1, assessmentStatus: status, classification: { archetype: 'saas', designLanguage: 'minimal', evidenceConfidence: 'high', evidenceIds: ['e1'] }, dimensions: { visual: { value: 80, state: 'assessed', method: 'rubric_v1', coverage: { observed: 1, applicable: 1 } } }, findings, strengths: [], evidenceCoverage: { observed: status === 'complete' ? 2 : 1, required: 2 }, versions: { rubric: 'r1', prompt: 'p1', model: 'm1' } });
const run = (id: string, value: QualityProfile): EvaluationRun => ({ schemaVersion: 1, runId: id, executionStatus: 'completed', assessmentStatus: value.assessmentStatus, inputHash: 'input', profile: value, leadDecision: null, criticDecision: null, errors: [] });

test('reports fixed findings only after complete compatible recapture', () => {
  const diff = compareRuns(run('old', profile([defect])), run('new', profile([])));
  assert.equal(diff.compatibility, 'compatible');
  assert.deepEqual(diff.fixed, ['fp1']);
});

test('absence under partial coverage is unverified rather than fixed', () => {
  const diff = compareRuns(run('old', profile([defect])), run('new', profile([], 'partial')));
  assert.deepEqual(diff.fixed, []);
  assert.deepEqual(diff.unverified, ['fp1']);
});

test('version mismatch makes runs incomparable', () => {
  const current = profile([]);
  current.versions.rubric = 'r2';
  assert.equal(compareRuns(run('old', profile([defect])), run('new', current)).compatibility, 'incompatible');
});

test('reports escape untrusted finding text in HTML', () => {
  const rendered = renderReports(run('report', profile([defect])));
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.match(rendered.markdown, /ASSESSMENT: COMPLETE/);
});
