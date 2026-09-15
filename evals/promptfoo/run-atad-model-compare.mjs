/**
 * Live ATAD 5-repeat meta-eval for model comparison.
 * Writes under evals/promptfoo/results/atad-model-compare/.
 */
import WebLensProvider from './provider.mjs';

const provider = new WebLensProvider();
const started = Date.now();
const result = await provider.callApi('ATAD homepage reliability experiment', {
  vars: {
    url: 'https://atad.vn/',
    sampleCount: 5,
    resultDir: `evals/promptfoo/results/atad-${String(process.env.WEBLENS_MODEL ?? 'unknown').replaceAll(/[^a-zA-Z0-9._-]+/g, '-')}`,
  },
});
const compact = JSON.parse(result.output);
const trust = compact.trust;
const pipeline = compact.pipeline;
console.log(JSON.stringify({
  durationMs: Date.now() - started,
  model: result.metadata?.model ?? process.env.WEBLENS_MODEL,
  website: result.metadata?.website,
  pipeline,
  trust: trust ? {
    passed: trust.passed,
    reasons: trust.reasons,
    meanStandardDeviation: trust.meanStandardDeviation,
    meanExactAgreement: trust.meanExactAgreement,
    meanWithinOneAgreement: trust.meanWithinOneAgreement,
    findingRecurrence: trust.findingRecurrence,
    evidenceExistenceRate: trust.evidenceExistenceRate,
    evidenceSupportRate: trust.evidenceSupportRate,
    hallucinationRate: trust.hallucinationRate,
    criterionCoverage: trust.criterionCoverage,
    completeCriterionCoverage: trust.completeCriterionCoverage,
    schemaComplianceRate: trust.schemaComplianceRate,
    numericIntegrityRate: trust.numericIntegrityRate,
  } : null,
  reportPath: result.metadata?.reportPath,
  runIds: result.metadata?.runIds,
}, null, 2));
process.exitCode = trust?.passed && pipeline?.successfulRuns === pipeline?.requestedRuns ? 0 : 1;
