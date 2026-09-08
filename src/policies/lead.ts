import type { BusinessContext, LeadDecision, QualityProfile } from '../contracts.js';

export function assessLead(profile: QualityProfile, business: BusinessContext): LeadDecision {
  if (!business.inScope) return { verdict: 'SKIP', opportunityScore: null, signals: {}, missingSignals: [], reasonCodes: ['out_of_scope'] };
  const requiredDimensions = ['visual', 'responsive', 'ux'] as const;
  const missingDimensions = requiredDimensions.filter((name) => profile.dimensions[name]?.value === null || profile.dimensions[name]?.value === undefined);
  const businessEntries = { commercialFit: business.commercialFit, fixability: business.fixability, activity: business.activity };
  const missingSignals = Object.entries(businessEntries).filter(([, value]) => value === null).map(([name]) => name);
  if (profile.assessmentStatus !== 'complete' || missingDimensions.length || missingSignals.length) {
    return { verdict: 'WATCH', opportunityScore: null, signals: {}, missingSignals: [...missingSignals, ...missingDimensions], reasonCodes: ['insufficient_context_or_evidence'] };
  }

  const visual = profile.dimensions.visual?.value ?? 0;
  const responsive = profile.dimensions.responsive?.value ?? 0;
  const ux = profile.dimensions.ux?.value ?? 0;
  const designDeficiency = 1 - ((visual + responsive) / 2) / 100;
  const uxDeficiency = 1 - ux / 100;
  const commercialFit = business.commercialFit?.value ?? 0;
  const fixability = business.fixability?.value ?? 0;
  const activity = business.activity?.value ?? 0;
  const opportunityScore = Math.round(100 * (0.35 * designDeficiency + 0.20 * uxDeficiency + 0.20 * commercialFit + 0.15 * fixability + 0.10 * activity));
  let verdict: LeadDecision['verdict'] = opportunityScore < 40 ? 'SKIP' : opportunityScore < 60 ? 'WATCH' : opportunityScore < 75 ? 'PROSPECT' : 'HIGH_PRIORITY_PROSPECT';
  const qualifyingFinding = profile.findings.some(({ severity, epistemicType, verification }) => (severity === 'blocker' || severity === 'high') && epistemicType === 'objective' && verification === 'verified');
  if (verdict === 'HIGH_PRIORITY_PROSPECT' && (commercialFit < 0.75 || profile.classification.evidenceConfidence !== 'high' || !qualifyingFinding)) verdict = 'PROSPECT';
  return {
    verdict,
    opportunityScore,
    signals: { designDeficiency, uxDeficiency, commercialFit, fixability, activity },
    missingSignals: [],
    reasonCodes: qualifyingFinding ? ['verified_design_opportunity'] : ['opportunity_requires_review'],
  };
}
