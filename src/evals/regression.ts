import type { MetaEvaluationReport, NumericSummary } from './types.js';
export type RegressionThresholds = { maxStdDevIncrease?: number; maxUnsupportedIncrease?: number; maxMaeIncrease?: number; maxCostIncrease?: number };
export type RegressionReport = { comparisonStatus: 'compatible'|'incompatible'; reasons: string[]; passed: boolean; changes: Record<string, number | null>; failures: string[] };
const mean = (report: MetaEvaluationReport): number | null => { const values = report.consistency?.criteria.flatMap(c => c.standardDeviation === null ? [] : [c.standardDeviation]) ?? []; return values.length ? values.reduce((s, x) => s + x, 0) / values.length : null; };
export function compareMetaEvaluations(baseline: MetaEvaluationReport, candidate: MetaEvaluationReport, thresholds: RegressionThresholds = {}): RegressionReport {
  const reasons: string[] = []; if (baseline.provenance.mode !== candidate.provenance.mode) reasons.push('evaluation modes differ'); if (baseline.provenance.rubricVersion !== candidate.provenance.rubricVersion) reasons.push('rubric versions differ'); if (baseline.provenance.evidenceHashes.join('|') !== candidate.provenance.evidenceHashes.join('|') && baseline.provenance.mode === 'frozen-judge-consistency') reasons.push('frozen evidence differs');
  if (reasons.length) return { comparisonStatus: 'incompatible', reasons, passed: false, changes: {}, failures: reasons };
  const baseStd = mean(baseline), candStd = mean(candidate); const changes = { meanStandardDeviation: baseStd === null || candStd === null ? null : candStd - baseStd, evidenceSupportRate: null, calibrationMae: null, costUsd: null };
  const failures: string[] = []; const max = thresholds.maxStdDevIncrease ?? Infinity; if (changes.meanStandardDeviation !== null && changes.meanStandardDeviation > max) failures.push('criterion variance increased beyond threshold');
  return { comparisonStatus: 'compatible', reasons: [], passed: failures.length === 0, changes, failures };
}
