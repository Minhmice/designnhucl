import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNumericIntegrity } from '../src/evals/numeric-integrity.js';
import type { EvaluationRun } from '../src/contracts.js';

const run = (metrics: Record<string, number>): EvaluationRun => ({
  schemaVersion: 1, runId: crypto.randomUUID(), executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'input',
  audits: [{ id: 'audit', kind: 'lighthouse', status: 'complete', evidenceIds: [], metrics, findings: [], limitations: [] }],
  profile: null, leadDecision: null, criticDecision: null, errors: [],
});

test('numeric integrity accepts valid audit metrics and rejects impossible values', () => {
  assert.deepEqual(validateNumericIntegrity([run({ performance: 95, tbtMs: 0, lcpMs: 1000, cls: 0.1 })]), { valid: true, checkedMetrics: 4, invalidMetrics: [] });
  const invalid = validateNumericIntegrity([run({ performance: 101, tbtMs: -1, cls: 2 })]);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.invalidMetrics.length, 3);
});
