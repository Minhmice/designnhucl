/**
 * Offline ATAD pipeline meta-eval from previously completed runs (no browser/model calls).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { loadRun } from '../../dist/src/store.js';
import { evaluatePipelineRepeats } from '../../dist/src/evals/orchestrator.js';
import { renderMetaReport } from '../../dist/src/evals/report.js';

const runIds = [
  '7f8e5b41-fb9b-4ca1-a7ac-e76ab03137c7',
  '8e7b4d80-e4e2-42b0-ba99-373ea04a1823',
  '5ea0b541-b5cf-446e-adce-0649f3d3bb89',
  'f090a175-d919-40f2-aaa5-9e5dcf5cf638',
  '121999fe-9c84-452c-b178-e42868ffeb24',
];

const runs = [];
for (const runId of runIds) {
  const run = await loadRun(runId, './runs');
  if (run.executionStatus !== 'completed' || run.assessmentStatus !== 'complete') {
    throw new Error(`Run ${runId} is not a complete ATAD evaluation.`);
  }
  if (run.bundle?.targetUrl !== 'https://atad.vn/') {
    throw new Error(`Run ${runId} target is not https://atad.vn/`);
  }
  runs.push(run);
}

const report = await evaluatePipelineRepeats({
  repeats: runs.length,
  run: async (repeat) => runs[repeat],
});

const resultDir = 'evals/promptfoo/results/atad-offline';
await mkdir(resultDir, { recursive: true });
const rendered = renderMetaReport(report);
await writeFile(`${resultDir}/meta-eval.json`, rendered.json, 'utf8');
await writeFile(`${resultDir}/report.md`, rendered.markdown, 'utf8');
await writeFile(`${resultDir}/run-ids.json`, JSON.stringify(runIds, null, 2), 'utf8');

const trust = report.trust;
console.log(JSON.stringify({
  mode: report.provenance.mode,
  sampleCount: report.provenance.sampleCount,
  pipeline: report.pipeline && {
    requestedRuns: report.pipeline.requestedRuns,
    successfulRuns: report.pipeline.successfulRuns,
    failedRuns: report.pipeline.failedRuns,
  },
  trust: trust && {
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
  },
  reportPath: `${resultDir}/report.md`,
}, null, 2));
process.exitCode = trust?.passed ? 0 : 1;
