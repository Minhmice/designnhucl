import type { EvidenceBundle, Finding } from '../contracts.js';

export type EvidenceSupport = 'supported' | 'partially_supported' | 'unsupported' | 'insufficient';
export type EvidenceSupportInput = { finding: Finding; citedEvidence: EvidenceBundle['artifacts']; context?: unknown };
export type EvidenceSupportResult = { findingId: string; evidenceSupport: EvidenceSupport; confidence: number | null; reason: string };
export interface EvidenceSupportEvaluator { evaluate(input: EvidenceSupportInput): Promise<EvidenceSupportResult>; }
export type GroundingReport = { totalFindings: number; evidenceExistenceRate: number; evidenceSupportRate: number | null; unsupportedClaimRate: number | null; deterministicVerificationRate: number; modelOnlySupportRate: number; insufficientEvidenceRate: number; results: EvidenceSupportResult[] };

export function calculateEvidenceExistence(findings: readonly Finding[], bundle: EvidenceBundle): { total: number; existing: number; rate: number } {
  const ids = new Set(bundle.artifacts.map(a => a.id)); const existing = findings.filter(f => f.evidenceIds.every(id => ids.has(id))).length;
  return { total: findings.length, existing, rate: findings.length ? existing / findings.length : 1 };
}

function isDeterministicAuditFinding(finding: Finding, cited: EvidenceBundle['artifacts']): boolean {
  if (finding.epistemicType !== 'objective' || finding.verification !== 'verified') return false;
  if (finding.ruleId.startsWith('required-interaction-failed:') || finding.ruleId.startsWith('axe-')) return true;
  if (['horizontal-overflow', 'primary-action-disabled', 'page-error'].includes(finding.ruleId)) return true;
  // Audits emit raw axe rule IDs (e.g. heading-order) with audit evidence, not an axe- prefix.
  return cited.some((artifact) => artifact.kind === 'audit' || artifact.kind === 'dom' || artifact.kind === 'style' || artifact.kind === 'runtime' || artifact.kind === 'interaction');
}

export async function calculateGrounding(findings: readonly Finding[], bundle: EvidenceBundle, options: { evaluator?: EvidenceSupportEvaluator; context?: unknown } = {}): Promise<GroundingReport> {
  const ids = new Map(bundle.artifacts.map(a => [a.id, a])); const results: EvidenceSupportResult[] = [];
  for (const finding of findings) {
    const cited = finding.evidenceIds.map(id => ids.get(id)).filter((a): a is EvidenceBundle['artifacts'][number] => Boolean(a));
    if (cited.length !== finding.evidenceIds.length) { results.push({ findingId: finding.id, evidenceSupport: 'insufficient', confidence: null, reason: 'One or more cited evidence IDs do not exist.' }); continue; }
    if (isDeterministicAuditFinding(finding, cited)) results.push({ findingId: finding.id, evidenceSupport: 'supported', confidence: 1, reason: 'Known deterministic audit rule cites existing evidence.' });
    else if (options.evaluator) results.push(await options.evaluator.evaluate({ finding, citedEvidence: cited, ...(options.context === undefined ? {} : { context: options.context }) }));
    else if (finding.verification === 'human_confirmed') results.push({ findingId: finding.id, evidenceSupport: 'supported', confidence: null, reason: 'Human-confirmed finding with existing evidence.' });
    else results.push({ findingId: finding.id, evidenceSupport: 'insufficient', confidence: null, reason: 'Subjective/model-only finding requires an explicit support evaluator.' });
  }
  const existence = calculateEvidenceExistence(findings, bundle);
  const supported = results.filter(r => r.evidenceSupport === 'supported' || r.evidenceSupport === 'partially_supported').length;
  const unsupported = results.filter(r => r.evidenceSupport === 'unsupported').length;
  // Pending evaluator (insufficient) is not a support failure; only evaluable claims enter the support rate.
  const evaluable = results.filter(r => r.evidenceSupport !== 'insufficient');
  return { totalFindings: findings.length, evidenceExistenceRate: existence.rate, evidenceSupportRate: evaluable.length ? supported / evaluable.length : null, unsupportedClaimRate: findings.length ? unsupported / findings.length : null, deterministicVerificationRate: findings.length ? findings.filter(f => f.epistemicType === 'objective' && f.verification === 'verified').length / findings.length : 0, modelOnlySupportRate: findings.length ? results.filter(r => r.evidenceSupport !== 'insufficient' && r.reason.toLowerCase().includes('model')).length / findings.length : 0, insufficientEvidenceRate: findings.length ? results.filter(r => r.evidenceSupport === 'insufficient').length / findings.length : 0, results };
}
