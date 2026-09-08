import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { RunInput } from '../src/contracts.js';
import { compareRuns } from '../src/diff.js';
import type { JudgeCaller, JudgeKind } from '../src/judges.js';
import { evaluate } from '../src/runner.js';
import { RUBRIC_CRITERIA } from '../src/prompts.js';
import { startFixtureServer } from './helpers.js';

const environment = { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' };

function recordedCaller(): JudgeCaller {
  return async ({ kind, bundle }) => {
    const evidenceId = bundle.artifacts.find(({ kind }) => kind === 'screenshot')?.id ?? 'missing';
    const ids = kind === 'visual' ? [...RUBRIC_CRITERIA.visual] : kind === 'experience' ? [...RUBRIC_CRITERIA.ux, ...RUBRIC_CRITERIA.responsive, ...RUBRIC_CRITERIA.conversion] : [];
    const ratings = ids.map((criterionId) => ({ criterionId, rating: 4 as const, state: 'assessed' as const, evidenceIds: [evidenceId], applicabilityReason: null }));
    return {
      id: kind, kind: kind as JudgeKind, status: 'complete' as const, model: 'recording', promptVersion: 'p1', rubricVersion: 'r1',
      classification: kind === 'classify' ? { archetype: 'local_service', designLanguage: 'clean', evidenceConfidence: 'high' as const, evidenceIds: [evidenceId] } : null,
      ratings, findings: [], limitations: [], usage: { inputTokens: 1, outputTokens: 1 },
    };
  };
}

async function criticInput(origin: string, path: string): Promise<RunInput> {
  return {
    url: `${origin}${path}`,
    recipeId: 'critic-standard',
    context: { objective: 'Book care', audience: 'Patients', locale: 'en', archetypeHint: null, primaryAction: 'Book a visit', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null,
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-e2e-')),
    baselineRunId: null,
    allowCloudVision: false,
    budgetUsd: null,
  };
}

async function leadInput(origin: string, path: string): Promise<RunInput> {
  const observedAt = new Date(0).toISOString();
  return {
    ...(await criticInput(origin, path)),
    recipeId: 'lead-fast',
    business: {
      commercialFit: { value: 0.9, evidenceIds: ['business-fit'], observedAt, provenance: 'provided' },
      fixability: { value: 0.9, evidenceIds: ['fixability'], observedAt, provenance: 'provided' },
      activity: { value: 0.9, evidenceIds: ['activity'], observedAt, provenance: 'provided' },
      inScope: true,
    },
  };
}

test('the same evaluator core produces profiles for Lead and Critic', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const lead = await evaluate(await leadInput(fixture.origin, '/good'), { caller: recordedCaller(), environment });
  const criticRequest = await criticInput(fixture.origin, '/good');
  criticRequest.context.requirements = [{ id: 'brand-promise', description: 'Independent dental care', required: true }];
  const critic = await evaluate(criticRequest, { caller: recordedCaller(), environment });

  assert.equal(lead.executionStatus, 'completed');
  assert.equal(critic.executionStatus, 'completed');
  assert.notEqual(lead.profile, null);
  assert.notEqual(critic.profile, null);
  assert.notEqual(lead.leadDecision, null);
  assert.equal(critic.criticDecision?.verdict, 'REVIEW');
  assert.deepEqual(critic.observedRequirementIds, []);
  assert.deepEqual(critic.criticDecision.unmetRequirements, ['brand-promise']);
  assert.deepEqual(lead.profile?.versions, critic.profile?.versions);
});

test('challenge is unscorable and spends zero judge calls', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  let calls = 0;
  const caller: JudgeCaller = async (request) => { calls += 1; return recordedCaller()(request); };
  const run = await evaluate(await leadInput(fixture.origin, '/challenge'), { caller, environment });

  assert.equal(run.assessmentStatus, 'unscorable');
  assert.equal(run.profile, null);
  assert.equal(calls, 0);
});

test('missing mobile evidence keeps Critic in review', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const run = await evaluate(await criticInput(fixture.origin, '/partial'), { caller: recordedCaller(), environment });

  assert.equal(run.assessmentStatus, 'partial');
  assert.equal(run.criticDecision?.verdict, 'REVIEW');
  assert.ok(run.criticDecision?.coverageGaps.includes('required_evidence_incomplete'));
});

test('a disabled primary action is an objective blocker that makes Critic iterate', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const run = await evaluate(await criticInput(fixture.origin, '/broken-cta'), { caller: recordedCaller(), environment });

  assert.equal(run.executionStatus, 'completed');
  assert.equal(run.criticDecision?.verdict, 'ITERATE');
  assert.equal(run.profile?.findings.some(({ ruleId, verification }) => ruleId === 'primary-action-disabled' && verification === 'verified'), true);
});

test('a compatible fresh capture marks a corrected primary action as fixed', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const baseline = await evaluate(await criticInput(fixture.origin, '/broken-cta'), { caller: recordedCaller(), environment });
  const current = await evaluate(await criticInput(fixture.origin, '/good'), { caller: recordedCaller(), environment });
  const fingerprint = baseline.profile?.findings.find(({ ruleId }) => ruleId === 'primary-action-disabled')?.fingerprint;

  assert.ok(fingerprint);
  const diff = compareRuns(baseline, current);
  assert.equal(diff.compatibility, 'compatible');
  assert.ok(diff.fixed.includes(fingerprint));
});
