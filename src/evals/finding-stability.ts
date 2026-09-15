import type { Finding, QualityProfile } from '../contracts.js';
import type { FindingStability, SemanticFindingMatcher } from './types.js';

export type FindingStabilityOptions = { stableRecurrenceThreshold?: number; semanticMatcher?: SemanticFindingMatcher };
function deterministicKey(finding: Finding): string { return `${finding.fingerprint}|${finding.ruleId}|${finding.category}|${finding.affectedRoutes.join(',')}|${finding.affectedViewports.join(',')}`; }
function agreement<T>(values: T[][]): number | null { const nonempty = values.filter(v => v.length); if (!nonempty.length) return null; const first = JSON.stringify(nonempty[0]); return nonempty.filter(v => JSON.stringify(v) === first).length / nonempty.length; }

export async function calculateFindingStability(profiles: readonly QualityProfile[], options: FindingStabilityOptions = {}): Promise<FindingStability> {
  const threshold = options.stableRecurrenceThreshold ?? 0.8; const runs = profiles.length;
  const clusters: Array<{ key: string; representative: Finding; perRun: Array<Finding | undefined> }> = [];
  for (let runIndex = 0; runIndex < profiles.length; runIndex++) for (const finding of profiles[runIndex]!.findings) {
    const exact = clusters.find(c => c.key === deterministicKey(finding));
    let cluster = exact;
    if (!cluster && options.semanticMatcher) for (const candidate of clusters) if (await options.semanticMatcher(candidate.representative, finding)) { cluster = candidate; break; }
    if (!cluster) { cluster = { key: deterministicKey(finding), representative: finding, perRun: Array.from({ length: runs }) }; clusters.push(cluster); }
    if (!cluster.perRun[runIndex]) cluster.perRun[runIndex] = finding;
  }
  const rows = clusters.map(({ key, perRun }) => {
    const matched = perRun.filter((v): v is Finding => Boolean(v));
    return { key, observedRuns: matched.length, recurrenceRate: runs ? matched.length / runs : 0, severityAgreement: agreement(matched.map(f => [f.severity])), evidenceAgreement: agreement(matched.map(f => [...f.evidenceIds].sort())), recommendationAgreement: agreement(matched.map(f => [f.recommendation])), stable: runs > 0 && matched.length / runs >= threshold };
  });
  const meanRecurrence = rows.length ? rows.reduce((sum, r) => sum + r.recurrenceRate, 0) / rows.length : null;
  return { totalRuns: runs, findings: rows, meanRecurrence, stableFindings: rows.filter(r => r.stable).length, unstableFindings: rows.filter(r => !r.stable).length };
}
