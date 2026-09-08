import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadRun, saveRun } from '../src/store.js';
import { evaluate } from '../src/runner.js';
import { RUBRIC_CRITERIA } from '../src/prompts.js';
import type { JudgeCaller, JudgeKind } from '../src/judges.js';
import type { EvaluationRun, RunInput } from '../src/contracts.js';
import { startFixtureServer } from './helpers.js';

function caller(): JudgeCaller {
  return async ({ kind, bundle }) => {
    const evidenceId = bundle.artifacts.find(({ kind }) => kind === 'screenshot')?.id ?? 'missing';
    const ids = kind === 'visual' ? [...RUBRIC_CRITERIA.visual] : kind === 'experience' ? [...RUBRIC_CRITERIA.ux, ...RUBRIC_CRITERIA.responsive, ...RUBRIC_CRITERIA.conversion] : [];
    const ratings = ids.map((criterionId) => ({ criterionId, rating: 2 as const, state: 'assessed' as const, evidenceIds: [evidenceId], applicabilityReason: null }));
    return {
      id: kind, kind: kind as JudgeKind, status: 'complete' as const, model: 'recording', promptVersion: 'p1', rubricVersion: 'r1',
      classification: kind === 'classify' ? { archetype: 'local_service', designLanguage: 'clean', evidenceConfidence: 'high' as const, evidenceIds: [evidenceId] } : null,
      ratings, findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 },
    };
  };
}

test('atomic store round-trips a validated run and writes reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-store-'));
  const run: EvaluationRun = { schemaVersion: 1, runId: 'stored', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'hash', profile: null, leadDecision: null, criticDecision: null, errors: [] };
  const path = await saveRun(run, root);
  assert.deepEqual(await loadRun('stored', root), run);
  await access(join(path, 'report.md'));
  await access(join(path, 'report.html'));
});

test('store refuses a run-directory junction that escapes the artifact root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-store-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'weblens-store-outside-'));
  await mkdir(root, { recursive: true });
  await symlink(outside, join(root, 'linked-run'), 'junction');
  const run: EvaluationRun = { schemaVersion: 1, runId: 'linked-run', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'hash', profile: null, leadDecision: null, criticDecision: null, errors: [] };
  await assert.rejects(saveRun(run, root), /escapes.*artifact root/i);
});

test('evaluates a local fixture through the shared profile and lead policy', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const root = await mkdtemp(join(tmpdir(), 'weblens-runner-'));
  const observedAt = new Date(0).toISOString();
  const input: RunInput = {
    url: `${fixture.origin}/good`, recipeId: 'lead-fast',
    context: { objective: 'Book care', audience: 'Patients', locale: 'en', archetypeHint: null, primaryAction: 'Book', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: { commercialFit: { value: 0.9, evidenceIds: ['b1'], observedAt, provenance: 'provided' }, fixability: { value: 0.9, evidenceIds: ['b2'], observedAt, provenance: 'provided' }, activity: { value: 0.9, evidenceIds: ['b3'], observedAt, provenance: 'provided' }, inScope: true },
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: root, baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: caller(), environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.executionStatus, 'completed');
  assert.equal(run.profile?.dimensions.visual?.value, 50);
  assert.notEqual(run.leadDecision, null);
  await access(join(root, run.runId, 'report.json'));
});

test('failed network preflight does not create an unscorable website assessment', async () => {
  const input: RunInput = {
    url: 'https://example.com', recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }, business: null,
    networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-preflight-')), baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: caller(), environment: {} });
  assert.equal(run.executionStatus, 'not_started');
  assert.equal(run.assessmentStatus, null);
  assert.equal(run.errors[0]?.origin, 'environment');
});

test('an unscorable challenge stops before any paid judge call', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  let calls = 0;
  const countingCaller: JudgeCaller = async (request) => { calls += 1; return caller()(request); };
  const input: RunInput = {
    url: `${fixture.origin}/challenge`, recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-unscorable-')), baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: countingCaller, environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.executionStatus, 'completed');
  assert.equal(run.assessmentStatus, 'unscorable');
  assert.equal(run.profile, null);
  assert.equal(calls, 0);
});

test('cloud judging does not start without a known estimate inside the approved budget', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  let calls = 0;
  const countingCaller: JudgeCaller = async (request) => { calls += 1; return caller()(request); };
  const base: RunInput = {
    url: `${fixture.origin}/good`, recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-budget-')), baselineRunId: null, allowCloudVision: true, budgetUsd: 0.05,
  };
  const unknown = await evaluate(base, { caller: countingCaller, environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  const over = await evaluate(base, { caller: countingCaller, estimatedModelCostUsd: 0.10, environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(unknown.executionStatus, 'not_started');
  assert.equal(over.executionStatus, 'not_started');
  assert.equal(calls, 0);
});

test('exhausted judge retry is recorded as a retryable provider-stage failure', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const failingCaller: JudgeCaller = async () => { throw new Error('provider temporarily unavailable'); };
  const input: RunInput = {
    url: `${fixture.origin}/good`, recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-provider-fail-')), baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: failingCaller, environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.executionStatus, 'failed');
  assert.deepEqual(run.errors[0], { stage: 'judge-classify', code: 'judgestageerror', origin: 'provider', retryable: true, evidenceIds: [] });
  assert.equal(run.judgeAttempts?.length, 2);
});

test('a cloud-capable caller cannot upload when the current run denies cloud vision', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  let calls = 0;
  const cloudCaller = Object.assign(async (request: Parameters<JudgeCaller>[0]) => { calls += 1; return caller()(request); }, {
    metadata: { provider: 'test-cloud', cloudVision: true as const, model: 'recording', estimatedCostUsdPerCall: 0.01, pricingVersion: 'test-v1' },
  });
  const input: RunInput = {
    url: `${fixture.origin}/good`, recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-consent-')), baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: cloudCaller, environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.executionStatus, 'not_started');
  assert.equal(calls, 0);
});

test('records per-call reservations and token usage for an approved cloud-capable caller', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const cloudCaller = Object.assign(caller(), {
    metadata: { provider: 'test-cloud', cloudVision: true, model: 'recording', estimatedCostUsdPerCall: 0.01, pricingVersion: 'test-v1', calculateActualCostUsd: () => 0.005 },
  });
  const input: RunInput = {
    url: `${fixture.origin}/good`, recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-ledger-')), baselineRunId: null, allowCloudVision: true, budgetUsd: 0.05,
  };
  const run = await evaluate(input, { caller: cloudCaller, environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.executionStatus, 'completed');
  assert.equal(run.costLedger?.records.length, 3);
  assert.equal(run.costLedger?.actualUsd, 0.015);
  assert.deepEqual(run.costLedger?.records.map(({ inputTokens, outputTokens }) => [inputTokens, outputTokens]), [[1, 1], [1, 1], [1, 1]]);
});

test('critic decisions consume passed results from declared requirement checks', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const input: RunInput = {
    url: `${fixture.origin}/interaction`, recipeId: 'critic-standard', context: {
      objective: 'Explain deployment', audience: 'Developers', locale: 'en', archetypeHint: 'saas', primaryAction: 'Show details', routes: ['/interaction'],
      requirements: [{ id: 'details-panel', description: 'Details can be revealed', required: true, check: { route: '/interaction', action: { kind: 'click', selector: '#details' }, assertion: { kind: 'visible', selector: '#panel' } } }], referenceIds: [], qualityReview: null,
    }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-requirement-')), baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: caller(), environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.executionStatus, 'completed');
  assert.deepEqual(run.observedRequirementIds, ['details-panel']);
  assert.deepEqual(run.criticDecision?.unmetRequirements, []);
});

test('a reproducibly failed required interaction becomes an objective ITERATE gate', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const input: RunInput = {
    url: `${fixture.origin}/interaction`, recipeId: 'critic-standard', context: {
      objective: 'Explain deployment', audience: 'Developers', locale: 'en', archetypeHint: 'saas', primaryAction: 'Show details', routes: ['/interaction'],
      requirements: [{ id: 'missing-panel', description: 'Missing navigation must occur', required: true, check: { route: '/interaction', action: { kind: 'click', selector: '#details' }, assertion: { kind: 'url', pattern: 'never-match-this-url' } } }], referenceIds: [], qualityReview: null,
    }, business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' }, artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-requirement-fail-')), baselineRunId: null, allowCloudVision: false, budgetUsd: null,
  };
  const run = await evaluate(input, { caller: caller(), environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' } });
  assert.equal(run.criticDecision?.verdict, 'ITERATE');
  assert.deepEqual(run.failedRequirementIds, ['missing-panel']);
  assert.equal(run.profile?.findings.some(({ ruleId, verification }) => ruleId === 'required-interaction-failed:missing-panel' && verification === 'verified'), true);
});
