import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateClassificationStability, calculateCriterionConsistency } from '../src/evals/index.js';
import type { JudgeResult } from '../src/contracts.js';

const judge = (rating: number, archetype = 'local_service'): JudgeResult => ({ id: `j-${rating}`, kind: 'visual', status: 'complete', model: 'm', promptVersion: 'p', rubricVersion: 'r', classification: { archetype, designLanguage: 'clean', evidenceConfidence: 'high', evidenceIds: ['e'] }, ratings: [{ criterionId: 'visual.hierarchy', rating: rating as 0|1|2|3|4, state: 'assessed', evidenceIds: ['e'], applicabilityReason: null }], findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 } });
test('criterion consistency reports distribution and agreement bands', () => { const report = calculateCriterionConsistency([judge(3), judge(3), judge(2)]); const criterion = report.find(item => item.criterionId === 'visual.hierarchy'); assert.equal(criterion?.mean, 8 / 3); assert.equal(criterion?.exactAgreementRate, 2 / 3); assert.equal(criterion?.withinOneAgreementRate, 1); assert.deepEqual(criterion?.distribution, { '0': 0, '1': 0, '2': 1, '3': 2, '4': 0 }); });
test('classification stability reports modal labels and confidence', () => { const report = calculateClassificationStability([judge(3), judge(2), { ...judge(1, 'editorial'), id: 'x' }]); assert.equal(report.modalArchetype, 'local_service'); assert.equal(report.archetypeAgreement, 2 / 3); assert.equal(report.confidenceDistribution.high, 3); });
