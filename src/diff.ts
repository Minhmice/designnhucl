import type { EvaluationRun } from './contracts.js';

export type EvaluationDiff = { compatibility: 'compatible' | 'incompatible'; fixed: string[]; stillPresent: string[]; added: string[]; regressed: string[]; unverified: string[] };

export function compareRuns(baseline: EvaluationRun, current: EvaluationRun): EvaluationDiff {
  const empty = { fixed: [], stillPresent: [], added: [], regressed: [], unverified: [] };
  if (!baseline.profile || !current.profile || JSON.stringify(baseline.profile.versions) !== JSON.stringify(current.profile.versions)) return { compatibility: 'incompatible', ...empty };
  const before = new Map(baseline.profile.findings.map((finding) => [finding.fingerprint, finding]));
  const after = new Map(current.profile.findings.map((finding) => [finding.fingerprint, finding]));
  const stillPresent = [...before.keys()].filter((key) => after.has(key));
  const absent = [...before.keys()].filter((key) => !after.has(key));
  const fixed = current.profile.assessmentStatus === 'complete' && current.profile.evidenceCoverage.observed >= current.profile.evidenceCoverage.required ? absent : [];
  const unverified = fixed.length ? [] : absent;
  const added = [...after.keys()].filter((key) => !before.has(key));
  const regressed = added.filter((key) => {
    const finding = after.get(key);
    return finding?.epistemicType === 'objective' && finding.verification === 'verified' && finding.severity === 'blocker';
  });
  return { compatibility: 'compatible', fixed, stillPresent, added, regressed, unverified };
}
