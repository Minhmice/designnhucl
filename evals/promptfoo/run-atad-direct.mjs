/**
 * Direct ATAD pipeline meta-eval (5 repeats) without Promptfoo's outer timeout.
 * Writes the same artifacts as provider.mjs under evals/promptfoo/results/atad/.
 */
import WebLensProvider from './provider.mjs';

const provider = new WebLensProvider();
const started = Date.now();
const result = await provider.callApi('ATAD homepage reliability experiment', {
  vars: {
    url: 'https://atad.vn/',
    sampleCount: 5,
    resultDir: 'evals/promptfoo/results/atad',
  },
});
const compact = JSON.parse(result.output);
const trust = compact.trust;
const pipeline = compact.pipeline;
console.log(JSON.stringify({
  durationMs: Date.now() - started,
  website: result.metadata?.website,
  pipeline,
  trust: trust ? {
    passed: trust.passed,
    reasons: trust.reasons,
    evidenceSupportRate: trust.evidenceSupportRate,
    hallucinationRate: trust.hallucinationRate,
    meanExactAgreement: trust.meanExactAgreement,
    completeCriterionCoverage: trust.completeCriterionCoverage,
    numericIntegrityRate: trust.numericIntegrityRate,
  } : null,
  reportPath: result.metadata?.reportPath,
  runIds: result.metadata?.runIds,
}, null, 2));
process.exitCode = trust?.passed && pipeline?.successfulRuns === pipeline?.requestedRuns ? 0 : 1;
