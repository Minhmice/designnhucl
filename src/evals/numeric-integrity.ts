import type { EvaluationRun } from '../contracts.js';
import type { NumericIntegrityReport } from './types.js';

const nonnegative = new Set(['tbtMs', 'lcpMs']);
const counts = new Set(['violationCount', 'incompleteCount', 'passCount', 'checkedViewports', 'disabledPrimaryActions', 'pageErrors', 'failedRequests', 'deniedRequests']);
const bounded01 = new Set(['cls']);
const bounded100 = new Set(['performance']);

export function validateNumericIntegrity(runs: readonly EvaluationRun[]): NumericIntegrityReport {
  const invalidMetrics: NumericIntegrityReport['invalidMetrics'] = [];
  let checkedMetrics = 0;
  for (const run of runs) for (const audit of run.audits ?? []) {
    for (const [metric, value] of Object.entries(audit.metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      checkedMetrics++;
      const invalid = counts.has(metric) && (value < 0 || !Number.isInteger(value)) || nonnegative.has(metric) && value < 0 || bounded01.has(metric) && (value < 0 || value > 1) || bounded100.has(metric) && (value < 0 || value > 100);
      if (invalid) invalidMetrics.push({ runId: run.runId, auditId: audit.id, metric, reason: 'Metric is outside its declared numeric domain.' });
    }
  }
  return { valid: invalidMetrics.length === 0, checkedMetrics, invalidMetrics };
}
