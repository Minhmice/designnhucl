import { calculateClassificationStability } from './classification-stability.js';
import { calculateCriterionConsistency, calculateDimensionConsistency } from './consistency.js';
import { calculateFindingStability } from './finding-stability.js';
import { calculateGrounding } from './grounding.js';
import { checkJudgeAdherence } from './adherence.js';
import { RUBRIC_CRITERIA } from '../prompts.js';
import { buildProfile } from '../scoring.js';
import type { EvidenceBundle, EvaluationRun, JudgeResult, QualityProfile } from '../contracts.js';
import type { FrozenJudgeInput, MetaEvaluationReport, NumericIntegrityReport, PipelineRepeatInput, TrustEvaluation } from './types.js';
import { validateNumericIntegrity } from './numeric-integrity.js';

const MINIMUM_REPEATS = 5;
const TRUST_THRESHOLDS = { maxMeanStandardDeviation: 0.8, minExactAgreement: 0.8, minWithinOneAgreement: 0.95, minFindingRecurrence: 0.8, minEvidenceExistence: 1, minEvidenceSupport: 0.9, minCriterionCoverage: 1 };
function makeProfile(bundle: EvidenceBundle, result: JudgeResult[], audits: EvaluationRun['audits'] = []): QualityProfile { return buildProfile({ bundle, judges: result, audits: audits ?? [] }); }
function completeJudgeResult(result: readonly JudgeResult[]): boolean { return ['classify', 'visual', 'experience'].every(kind => result.some(judge => judge.kind === kind && judge.status === 'complete')); }
function hasAllRubricCriteria(judges: readonly JudgeResult[]): boolean { const expected = Object.values(RUBRIC_CRITERIA).flat(); const observed = new Set(judges.flatMap(judge => judge.ratings.map(rating => rating.criterionId))); return expected.every(id => observed.has(id)); }
async function makeTrust(repeats: number, criteria: ReturnType<typeof calculateCriterionConsistency>, findingStability: Awaited<ReturnType<typeof calculateFindingStability>>, reports: Array<{ grounding?: Awaited<ReturnType<typeof calculateGrounding>>; adherence?: ReturnType<typeof checkJudgeAdherence>[] }>, requiredRunCount: number, completeJudgeRuns = repeats, numericIntegrity: NumericIntegrityReport = { valid: true, checkedMetrics: 0, invalidMetrics: [] }): Promise<TrustEvaluation> {
  const standardDeviations = criteria.flatMap(c => c.standardDeviation === null ? [] : [c.standardDeviation]);
  const exact = criteria.flatMap(c => c.exactAgreementRate === null ? [] : [c.exactAgreementRate]);
  const within = criteria.flatMap(c => c.withinOneAgreementRate === null ? [] : [c.withinOneAgreementRate]);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const grounding = reports.map(r => r.grounding).filter((r): r is Awaited<ReturnType<typeof calculateGrounding>> => Boolean(r));
  const adherence = reports.flatMap(r => r.adherence ?? []);
  const runCount = reports.length;
  const usableGrounding = grounding.filter(r => r.totalFindings > 0);
  const usableAdherence = adherence.filter(r => r.requiredCriteria.length > 0);
  const evidenceExistenceRate = grounding.length ? mean(grounding.map(r => r.evidenceExistenceRate)) : null;
  const evidenceSupportRate = usableGrounding.length ? mean(usableGrounding.flatMap(r => r.evidenceSupportRate === null ? [] : [r.evidenceSupportRate])) : null;
  const unsupportedClaimRate = usableGrounding.length ? mean(usableGrounding.flatMap(r => r.unsupportedClaimRate === null ? [] : [r.unsupportedClaimRate])) : null;
  const criterionCoverage = usableAdherence.length ? mean(usableAdherence.map(r => r.criterionCoverage)) : null;
  const expectedCriterionCount = Object.values(RUBRIC_CRITERIA).flat().length;
  const observedCriterionCount = new Set(criteria.map(c => c.criterionId)).size;
  const completeCriterionCoverage = expectedCriterionCount ? observedCriterionCount / expectedCriterionCount : 1;
  const allRunJudgeComplete = requiredRunCount === repeats;
  const allCriterionSamplesComplete = criteria.length === expectedCriterionCount && criteria.every(c => c.samples === repeats);
  const completeCriterionSampleCount = criteria.filter(c => c.samples === repeats).length;
  const schemaComplianceRate = usableAdherence.length ? usableAdherence.filter(r => r.schemaCompliant && r.missingCriteria.length === 0 && r.unexpectedCriteria.length === 0 && r.missingEvidenceCriteria.length === 0 && r.missingFindingFields.length === 0).length / usableAdherence.length : null;
  const meanStandardDeviation = mean(standardDeviations);
  const meanExactAgreement = mean(exact);
  const meanWithinOneAgreement = mean(within);
  const hallucinationRate = unsupportedClaimRate === null ? null : unsupportedClaimRate;
  const reasons: string[] = [];
  if (repeats < MINIMUM_REPEATS) reasons.push(`minimum_repeats_not_met:${MINIMUM_REPEATS}`);
  if (requiredRunCount !== repeats) reasons.push('incomplete_pipeline_runs');
  if (runCount !== repeats) reasons.push('missing_run_summaries');
  if (completeJudgeRuns !== repeats || !allRunJudgeComplete || !allCriterionSamplesComplete) reasons.push('judge_stage_or_rubric_coverage_incomplete');
  if (!numericIntegrity.valid) reasons.push('numeric_integrity_failed');
  if (grounding.some(r => r.evidenceExistenceRate < 1)) reasons.push('finding_evidence_reference_missing');
  if (meanStandardDeviation === null || meanStandardDeviation > TRUST_THRESHOLDS.maxMeanStandardDeviation) reasons.push('criterion_variance_above_threshold');
  if (meanExactAgreement === null || meanExactAgreement < TRUST_THRESHOLDS.minExactAgreement) reasons.push('exact_agreement_below_threshold');
  if (meanWithinOneAgreement === null || meanWithinOneAgreement < TRUST_THRESHOLDS.minWithinOneAgreement) reasons.push('within_one_agreement_below_threshold');
  if (findingStability.meanRecurrence === null || findingStability.meanRecurrence < TRUST_THRESHOLDS.minFindingRecurrence) reasons.push('finding_recurrence_below_threshold');
  if (evidenceExistenceRate === null || evidenceExistenceRate < TRUST_THRESHOLDS.minEvidenceExistence) reasons.push('evidence_existence_below_threshold');
  // Null support means no evaluable claims yet (all pending an evaluator); that is not a support failure.
  if (evidenceSupportRate !== null && evidenceSupportRate < TRUST_THRESHOLDS.minEvidenceSupport) reasons.push('evidence_support_below_threshold');
  if (criterionCoverage === null || criterionCoverage < TRUST_THRESHOLDS.minCriterionCoverage || completeCriterionCoverage < TRUST_THRESHOLDS.minCriterionCoverage) reasons.push('criterion_coverage_incomplete');
  if (schemaComplianceRate === null || schemaComplianceRate < 1) reasons.push('schema_or_evidence_adherence_failed');
  return { minimumRepeats: MINIMUM_REPEATS, actualRepeats: repeats, sufficientRepeats: repeats >= MINIMUM_REPEATS, completeCriterionSampleCount, passed: reasons.length === 0, reasons, thresholds: TRUST_THRESHOLDS, evidenceExistenceRate, evidenceSupportRate, unsupportedClaimRate, hallucinationRate, criterionCoverage, completeCriterionCoverage, schemaComplianceRate, numericIntegrityRate: numericIntegrity.checkedMetrics ? (numericIntegrity.valid ? 1 : 0) : null, meanStandardDeviation, meanExactAgreement, meanWithinOneAgreement, findingRecurrence: findingStability.meanRecurrence };
}
async function buildReport(mode: 'frozen-judge-consistency' | 'pipeline-consistency', repeats: number, runIds: string[], evidenceHashes: string[], judges: JudgeResult[], profiles: QualityProfile[], reports: Array<{ grounding?: Awaited<ReturnType<typeof calculateGrounding>>; adherence?: ReturnType<typeof checkJudgeAdherence>[] }>, pipeline?: MetaEvaluationReport['pipeline']): Promise<MetaEvaluationReport> {
  const first = judges[0]; const criteria = calculateCriterionConsistency(judges); const findingStability = await calculateFindingStability(profiles); const trust = await makeTrust(repeats, criteria, findingStability, reports, pipeline?.successfulRuns ?? repeats, mode === 'pipeline-consistency' ? pipeline?.successfulRuns ?? 0 : repeats, pipeline?.numericIntegrity);
  return { provenance: { schemaVersion: 1, metricVersion: 'meta-eval-v2', mode, sampleCount: repeats, runIds, evidenceHashes, model: first?.model ?? null, provider: null, promptVersion: first?.promptVersion ?? null, rubricVersion: first?.rubricVersion ?? null, createdAt: new Date().toISOString() }, ...(pipeline ? { pipeline } : {}), consistency: { criteria, dimensions: calculateDimensionConsistency(profiles) }, classificationStability: calculateClassificationStability(judges), findingStability, trust };
}
export async function evaluateFrozenJudges(input: FrozenJudgeInput): Promise<MetaEvaluationReport> {
  if (!Number.isInteger(input.repeats) || input.repeats < 1) throw new Error('repeats must be a positive integer');
  const judges: JudgeResult[] = []; const profiles: QualityProfile[] = []; const reports: Array<{ grounding?: Awaited<ReturnType<typeof calculateGrounding>>; adherence?: ReturnType<typeof checkJudgeAdherence>[] }> = [];
  for (let repeat = 0; repeat < input.repeats; repeat++) { const result = await input.judge({ bundle: input.bundle, context: input.context, repeat }); judges.push(...result); const profile = makeProfile(input.bundle, result); profiles.push(profile); reports.push({ grounding: await calculateGrounding(profile.findings, input.bundle), adherence: result.map(j => checkJudgeAdherence(j, RUBRIC_CRITERIA)) }); }
  return await buildReport('frozen-judge-consistency', input.repeats, input.runIds ?? [input.bundle.runId], input.bundle.artifacts.map(a => a.sha256), judges, profiles, reports);
}
export async function evaluatePipelineRepeats(input: PipelineRepeatInput): Promise<MetaEvaluationReport> {
  if (!Number.isInteger(input.repeats) || input.repeats < 1) throw new Error('repeats must be a positive integer');
  const runs: EvaluationRun[] = []; for (let i = 0; i < input.repeats; i++) runs.push(await input.run(i));
  const profiles = runs.flatMap(r => r.profile ? [r.profile] : []); const judges = runs.flatMap(r => r.judges ?? []); const reports: Array<{ grounding?: ReturnType<typeof calculateGrounding>; adherence?: ReturnType<typeof checkJudgeAdherence>[] }> = runs.map(r => r.bundle && r.profile ? { grounding: calculateGrounding(r.profile.findings, r.bundle), adherence: (r.judges ?? []).map(j => checkJudgeAdherence(j, RUBRIC_CRITERIA)) } : {});
  const completeJudgeRuns = runs.filter(r => completeJudgeResult(r.judges ?? []) && hasAllRubricCriteria(r.judges ?? [])).length;
  const numericIntegrity = validateNumericIntegrity(runs);
  const pipeline = { requestedRuns: input.repeats, successfulRuns: runs.filter(r => r.executionStatus === 'completed' && r.assessmentStatus === 'complete').length, failedRuns: runs.filter(r => r.executionStatus === 'failed' || r.executionStatus === 'not_started').length, unscorableRuns: runs.filter(r => r.assessmentStatus === 'unscorable').length, numericIntegrity, runSummaries: runs.map(r => ({ runId: r.runId, executionStatus: r.executionStatus, assessmentStatus: r.assessmentStatus, accessReason: r.bundle?.accessReason ?? null, scoreByDimension: Object.fromEntries(Object.entries(r.profile?.dimensions ?? {}).map(([k, v]) => [k, v.value])), findings: r.profile?.findings.length ?? 0, errors: r.errors.map(e => `${e.stage}:${e.code}`) })) };
  const resolvedReports = await Promise.all(reports.map(async r => { const resolved: { grounding?: Awaited<ReturnType<typeof calculateGrounding>>; adherence?: ReturnType<typeof checkJudgeAdherence>[] } = {}; if (r.grounding) resolved.grounding = await r.grounding; if (r.adherence) resolved.adherence = r.adherence; return resolved; }));
  return await buildReport('pipeline-consistency', input.repeats, runs.map(r => r.runId), runs.flatMap(r => r.bundle?.artifacts.map(a => a.sha256) ?? []), judges, profiles, resolvedReports, pipeline);
}
