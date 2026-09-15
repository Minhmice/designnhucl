import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMetaReport } from '../src/evals/index.js';
test('meta report rendering is bounded and includes mode', () => { const rendered = renderMetaReport({ provenance: { schemaVersion: 1, metricVersion: 'v', mode: 'frozen-judge-consistency', sampleCount: 1, runIds: [], evidenceHashes: [], model: null, provider: null, promptVersion: null, rubricVersion: null, createdAt: new Date().toISOString() } }); assert.match(rendered.markdown, /frozen-judge-consistency/); assert.ok(rendered.json.length > 0); });

test('meta report explains pipeline, criterion metrics, classification, and findings', () => {
  const rendered = renderMetaReport({
    provenance: { schemaVersion: 1, metricVersion: 'v', mode: 'pipeline-consistency', sampleCount: 2, runIds: ['run-1', 'run-2'], evidenceHashes: ['hash-1'], model: 'recording', provider: 'fixture', promptVersion: 'p1', rubricVersion: 'r1', createdAt: new Date().toISOString() },
    pipeline: { requestedRuns: 2, successfulRuns: 2, failedRuns: 0, unscorableRuns: 0, numericIntegrity: { valid: true, checkedMetrics: 0, invalidMetrics: [] }, runSummaries: [{ runId: 'run-1', executionStatus: 'completed', assessmentStatus: 'complete', accessReason: null, scoreByDimension: { ux: 75 }, findings: 1, errors: [] }, { runId: 'run-2', executionStatus: 'completed', assessmentStatus: 'complete', accessReason: null, scoreByDimension: { ux: 75 }, findings: 1, errors: [] }] },
    consistency: { criteria: [{ criterionId: 'ux.cta', samples: 2, mean: 3.5, median: 3.5, variance: 0.25, standardDeviation: 0.5, minimum: 3, maximum: 4, range: 1, coefficientOfVariation: 0.14, exactAgreementRate: 0.5, withinOneAgreementRate: 1, distribution: { '0': 0, '1': 0, '2': 0, '3': 1, '4': 1 }, unobservedRate: 0, notApplicableRate: 0 }], dimensions: { ux: { samples: 2, mean: 75, median: 75, variance: 0, standardDeviation: 0, minimum: 75, maximum: 75, range: 0, coefficientOfVariation: 0 } } },
    classificationStability: { samples: 2, modalArchetype: 'ecommerce', archetypeAgreement: 1, modalDesignLanguage: 'clean', designLanguageAgreement: 0.5, confidenceDistribution: { high: 2, medium: 0, low: 0 }, archetypeEntropy: 0, designLanguageEntropy: 0.5 },
    findingStability: { totalRuns: 2, findings: [{ key: 'f|primary-action-disabled|ux|/|mobile', observedRuns: 2, recurrenceRate: 1, severityAgreement: 1, evidenceAgreement: 1, recommendationAgreement: 1, stable: true }], meanRecurrence: 1, stableFindings: 1, unstableFindings: 0 },
  });
  assert.match(rendered.markdown, /CHI TIẾT LUỒNG/);
  assert.match(rendered.markdown, /CHỈ SỐ THEO TIÊU CHÍ/);
  assert.match(rendered.markdown, /ux\.cta/);
  assert.match(rendered.markdown, /ĐỘ ỔN ĐỊNH PHÂN LOẠI/);
  assert.match(rendered.markdown, /ĐỘ ỔN ĐỊNH PHÁT HIỆN/);
  assert.match(rendered.markdown, /Nút hành động chính đang bị vô hiệu hóa/);
  assert.match(rendered.markdown, /Ý nghĩa/);
});

test('meta report explains judge-stage failures', () => {
  const rendered = renderMetaReport({
    provenance: { schemaVersion: 1, metricVersion: 'v', mode: 'pipeline-consistency', sampleCount: 1, runIds: ['run-1'], evidenceHashes: [], model: null, provider: null, promptVersion: null, rubricVersion: null, createdAt: new Date().toISOString() },
    pipeline: { requestedRuns: 1, successfulRuns: 0, failedRuns: 1, unscorableRuns: 0, numericIntegrity: { valid: true, checkedMetrics: 0, invalidMetrics: [] }, runSummaries: [{ runId: 'run-1', executionStatus: 'failed', assessmentStatus: null, accessReason: null, scoreByDimension: {}, findings: 0, errors: ['judge-experience:judgestageerror'] }] },
  });
  assert.match(rendered.markdown, /Bước chấm \(classify\/visual\/experience\) thất bại/);
});
