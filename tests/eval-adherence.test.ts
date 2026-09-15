import assert from 'node:assert/strict';
import test from 'node:test';
import { checkJudgeAdherence } from '../src/evals/index.js';
import type { JudgeResult } from '../src/contracts.js';
const judge: JudgeResult = { id: 'v', kind: 'visual', status: 'complete', model: 'm', promptVersion: 'p', rubricVersion: 'r', classification: null, ratings: [{ criterionId: 'visual.hierarchy', rating: 3, state: 'assessed', evidenceIds: ['e'], applicabilityReason: null }], findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 } };
test('adherence reports missing and unexpected rubric criteria', () => { const report = checkJudgeAdherence(judge, { visual: ['visual.hierarchy', 'visual.composition'] }); assert.equal(report.schemaCompliant, true); assert.equal(report.criterionCoverage, 0.5); assert.deepEqual(report.missingCriteria, ['visual.composition']); });
