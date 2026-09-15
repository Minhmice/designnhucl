import { JudgeResultSchema, type JudgeResult } from '../contracts.js';

export type AdherenceReport = { schemaCompliant: boolean; criterionCoverage: number; requiredCriteria: string[]; observedCriteria: string[]; missingCriteria: string[]; unexpectedCriteria: string[]; unobservedCriteria: string[]; missingEvidenceCriteria: string[]; missingFindingFields: string[] };
export function checkJudgeAdherence(raw: JudgeResult, rubricCriteria: Record<string, readonly string[]>): AdherenceReport {
  let schemaCompliant = true; try { JudgeResultSchema.parse(raw); } catch { schemaCompliant = false; }
  const required = raw.kind === 'classify' ? [] : raw.kind === 'visual' ? [...(rubricCriteria.visual ?? [])] : [...(rubricCriteria.ux ?? []), ...(rubricCriteria.responsive ?? []), ...(rubricCriteria.conversion ?? [])];
  const observed = raw.ratings.map(r => r.criterionId); const missing = required.filter(id => !observed.includes(id)); const unexpected = observed.filter(id => !required.includes(id));
  const missingEvidence = raw.ratings.filter(r => r.state === 'assessed' && r.evidenceIds.length === 0).map(r => r.criterionId); const missingFindingFields = raw.findings.flatMap(f => [f.recommendation ? null : `${f.id}:recommendation`, f.acceptanceCriteria.length ? null : `${f.id}:acceptanceCriteria`].filter((v): v is string => v !== null));
  return { schemaCompliant, criterionCoverage: required.length ? required.filter(id => observed.includes(id)).length / required.length : 1, requiredCriteria: required, observedCriteria: observed, missingCriteria: missing, unexpectedCriteria: unexpected, unobservedCriteria: raw.ratings.filter(r => r.state === 'unobserved').map(r => r.criterionId), missingEvidenceCriteria: missingEvidence, missingFindingFields };
}
