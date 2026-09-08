import type { AuditResult, CriterionRating, DimensionScore, EvidenceBundle, Finding, JudgeResult, QualityProfile } from './contracts.js';
import { RUBRIC_CRITERIA } from './prompts.js';

export type GuardResult = { accepted: Finding[]; quarantined: Array<{ finding: Finding; reason: string }> };
export type ProfileInput = { bundle: EvidenceBundle; judges: JudgeResult[]; audits: AuditResult[] };

export function scoreDimension(ratings: CriterionRating[], weights: Record<string, number>): DimensionScore {
  const applicable = ratings.filter(({ state }) => state !== 'not_applicable');
  const observed = applicable.filter(({ state, rating }) => state === 'assessed' && rating !== null);
  if (applicable.length === 0) return { value: null, state: 'not_assessed', method: 'rubric_v1', coverage: { observed: 0, applicable: 0 } };
  const coverage = { observed: observed.length, applicable: applicable.length };
  if (observed.length !== applicable.length) return { value: null, state: 'partial', method: 'rubric_v1', coverage };
  let totalWeight = 0;
  let weighted = 0;
  for (const rating of observed) {
    const weight = weights[rating.criterionId];
    if (weight === undefined || !Number.isFinite(weight) || weight <= 0) throw new Error(`Invalid weight for ${rating.criterionId}.`);
    totalWeight += weight;
    weighted += (rating.rating ?? 0) * weight;
  }
  if (totalWeight <= 0) throw new Error('Dimension weights must have a positive total.');
  return { value: Math.round(25 * weighted / totalWeight), state: 'assessed', method: 'rubric_v1', coverage };
}

export function guardFindings(bundle: EvidenceBundle, findings: Finding[]): GuardResult {
  const evidenceIds = new Set(bundle.artifacts.map(({ id }) => id));
  const accepted = new Map<string, Finding>();
  const quarantined: Array<{ finding: Finding; reason: string }> = [];
  for (const candidate of findings) {
    const missing = candidate.evidenceIds.filter((id) => !evidenceIds.has(id));
    if (missing.length) {
      quarantined.push({ finding: candidate, reason: `Missing evidence: ${missing.join(', ')}` });
      continue;
    }
    const duplicate = accepted.get(candidate.fingerprint);
    if (duplicate) {
      duplicate.evidenceIds = [...new Set([...duplicate.evidenceIds, ...candidate.evidenceIds])];
      continue;
    }
    accepted.set(candidate.fingerprint, structuredClone(candidate));
  }
  return { accepted: [...accepted.values()], quarantined };
}

function empty(method: DimensionScore['method'] = 'rubric_v1'): DimensionScore {
  return { value: null, state: 'not_assessed', method, coverage: { observed: 0, applicable: 0 } };
}

export function buildProfile(input: ProfileInput): QualityProfile {
  const classifier = input.judges.find((judge) => judge.kind === 'classify' && judge.status === 'complete');
  const classification = classifier?.classification ?? { archetype: 'unknown', designLanguage: 'unknown', evidenceConfidence: 'low' as const, evidenceIds: [] };
  const allRatings = input.judges.filter(({ status }) => status === 'complete').flatMap(({ ratings }) => ratings);
  const dimensions: QualityProfile['dimensions'] = {};
  for (const [dimension, expectedIds] of Object.entries(RUBRIC_CRITERIA)) {
    const byId = new Map(allRatings.filter(({ criterionId }) => criterionId.startsWith(`${dimension}.`)).map((rating) => [rating.criterionId, rating]));
    const ratings: CriterionRating[] = expectedIds.map((criterionId) => byId.get(criterionId) ?? { criterionId, rating: null, state: 'unobserved', evidenceIds: [], applicabilityReason: null });
    dimensions[dimension] = scoreDimension(ratings, Object.fromEntries(expectedIds.map((criterionId) => [criterionId, 1])));
  }
  dimensions.brand = empty();
  const lighthouse = input.audits.find(({ kind, status }) => kind === 'lighthouse' && status === 'complete');
  const performance = lighthouse?.metrics.performance;
  dimensions.technical = typeof performance === 'number'
    ? { value: Math.round(performance), state: 'assessed', method: 'lighthouse_performance', coverage: { observed: 1, applicable: 1 } }
    : empty('lighthouse_performance');
  dimensions.accessibility = empty('audit_only');

  const proposed = [...input.judges.flatMap(({ findings }) => findings), ...input.audits.flatMap(({ findings }) => findings)];
  const guarded = guardFindings(input.bundle, proposed);
  const requiredJudgesComplete = ['classify', 'visual', 'experience'].every((kind) => input.judges.some((judge) => judge.kind === kind && judge.status === 'complete'));
  const requiredAuditsComplete = input.audits.every(({ status }) => status === 'complete');
  const requiredDimensionsComplete = ['visual', 'ux', 'responsive', 'conversion'].every((dimension) => dimensions[dimension]?.state === 'assessed');
  const assessmentStatus = input.bundle.assessmentStatus === 'complete' && requiredJudgesComplete && requiredAuditsComplete && requiredDimensionsComplete ? 'complete' : input.bundle.assessmentStatus === 'unscorable' ? 'unscorable' : 'partial';
  const versionSource = input.judges[0];
  return {
    schemaVersion: 1,
    assessmentStatus,
    classification,
    dimensions,
    findings: guarded.accepted,
    strengths: [],
    evidenceCoverage: { observed: input.bundle.observedEvidence, required: input.bundle.requiredEvidence },
    versions: { rubric: versionSource?.rubricVersion ?? 'unknown', prompt: versionSource?.promptVersion ?? 'unknown', model: versionSource?.model ?? 'unknown' },
  };
}
