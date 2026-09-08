import type { CriticDecision, EvaluationContext, Finding, QualityProfile } from '../contracts.js';

export type CriticGates = {
  visualMin: number;
  uxMin: number;
  responsiveMin: number;
  observedRequirementIds: string[];
  failedRequirementIds?: string[];
  runId: string;
  profileHash: string;
  subjectContextHash: string;
};

function toFix(finding: Finding): CriticDecision['prioritizedFixes'][number] {
  return { findingId: finding.id, current: finding.description, target: finding.recommendation, acceptanceChecks: finding.acceptanceCriteria, evidenceIds: finding.evidenceIds };
}

export function assessCritic(profile: QualityProfile, context: EvaluationContext, gates: CriticGates): CriticDecision {
  const scopeStatement = `Decision covers ${context.routes.join(', ')} and the evidence captured by this recipe only.`;
  const missingBrief = [context.objective, context.audience, context.primaryAction].some((value) => value === null);
  const coverageGaps: string[] = [];
  if (profile.assessmentStatus !== 'complete' || profile.evidenceCoverage.observed < profile.evidenceCoverage.required) coverageGaps.push('required_evidence_incomplete');
  const required = context.requirements.filter(({ required }) => required).map(({ id }) => id);
  const failedRequirements = required.filter((id) => gates.failedRequirementIds?.includes(id));
  const unmetRequirements = required.filter((id) => !gates.observedRequirementIds.includes(id) && !failedRequirements.includes(id));
  if (missingBrief || coverageGaps.length || unmetRequirements.length) {
    return { verdict: 'REVIEW', failedGates: missingBrief ? ['intent_context_missing'] : [], unmetRequirements, prioritizedFixes: [], coverageGaps, scopeStatement };
  }

  if (failedRequirements.length) {
    const failures = profile.findings.filter(({ ruleId }) => failedRequirements.some((id) => ruleId === `required-interaction-failed:${id}`));
    return { verdict: 'ITERATE', failedGates: failedRequirements.map((id) => `required_interaction_failed:${id}`), unmetRequirements: failedRequirements, prioritizedFixes: failures.slice(0, 3).map(toFix), coverageGaps: [], scopeStatement };
  }

  const objectiveBlockers = profile.findings.filter(({ severity, epistemicType, verification }) => severity === 'blocker' && epistemicType === 'objective' && verification === 'verified');
  if (objectiveBlockers.length) return { verdict: 'ITERATE', failedGates: objectiveBlockers.map(({ ruleId }) => ruleId), unmetRequirements: [], prioritizedFixes: objectiveBlockers.slice(0, 3).map(toFix), coverageGaps: [], scopeStatement };

  const review = context.qualityReview;
  const reviewMatches = review !== null && review.runId === gates.runId && review.profileHash === gates.profileHash && review.subjectContextHash === gates.subjectContextHash;
  if (!reviewMatches) return { verdict: 'REVIEW', failedGates: ['human_quality_review_required'], unmetRequirements: [], prioritizedFixes: [], coverageGaps: [], scopeStatement };
  if (review.decision === 'request_changes') {
    const requested = review.findingIds.map((id) => profile.findings.find((finding) => finding.id === id)).filter((finding): finding is Finding => finding !== undefined);
    return { verdict: 'ITERATE', failedGates: ['human_quality_review_requested_changes'], unmetRequirements: [], prioritizedFixes: requested.slice(0, 3).map(toFix), coverageGaps: [], scopeStatement };
  }

  const thresholds = { visual: gates.visualMin, ux: gates.uxMin, responsive: gates.responsiveMin };
  const unavailable = Object.entries(thresholds).filter(([dimension]) => profile.dimensions[dimension]?.value === null || profile.dimensions[dimension]?.value === undefined).map(([dimension]) => `${dimension}_not_assessed`);
  if (unavailable.length) return { verdict: 'REVIEW', failedGates: unavailable, unmetRequirements: [], prioritizedFixes: [], coverageGaps: [], scopeStatement };
  const belowThreshold = Object.entries(thresholds)
    .filter(([dimension, minimum]) => (profile.dimensions[dimension]?.value ?? -1) < minimum)
    .map(([dimension]) => `${dimension}_below_threshold`);
  if (belowThreshold.length) return { verdict: 'REVIEW', failedGates: belowThreshold, unmetRequirements: [], prioritizedFixes: [], coverageGaps: [], scopeStatement };
  return { verdict: 'PASS', failedGates: [], unmetRequirements: [], prioritizedFixes: [], coverageGaps: [], scopeStatement };
}
