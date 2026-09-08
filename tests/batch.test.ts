import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runJsonlBatch } from '../src/batch.js';
import type { EvaluationRun, RunInput } from '../src/contracts.js';

test('JSONL batch resumes without rerunning completed input hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-'));
  const manifest = join(root, 'input.jsonl');
  const state = join(root, 'state.jsonl');
  const input: RunInput = {
    url: 'https://example.com', recipeId: 'lead-fast',
    context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null,
    networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' },
    artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  let calls = 0;
  const evaluator = async (): Promise<EvaluationRun> => {
    calls += 1;
    return { schemaVersion: 1, runId: 'run-one', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'run-hash', profile: null, leadDecision: null, criticDecision: null, errors: [] };
  };

  const first = await runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 5, compatibilityKey: 'model-a', evaluate: evaluator });
  const second = await runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 5, compatibilityKey: 'model-a', evaluate: evaluator });

  assert.equal(calls, 1);
  assert.deepEqual(first, { total: 1, completed: 1, failed: 0, skipped: 0 });
  assert.deepEqual(second, { total: 1, completed: 0, failed: 0, skipped: 1 });
  const records = (await readFile(state, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { runId: string });
  assert.deepEqual(records.map(({ runId }) => runId), ['run-one']);
});

test('batch rejects manifests over the explicit item cap before evaluation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-cap-'));
  const manifest = join(root, 'input.jsonl');
  await writeFile(manifest, '{}\n{}\n');
  await assert.rejects(
    runJsonlBatch({ manifestPath: manifest, statePath: join(root, 'state.jsonl'), maxItems: 1, compatibilityKey: 'model-a', evaluate: async () => { throw new Error('must not run'); } }),
    /exceeds.*cap/i,
  );
});

test('batch rejects pending cloud runs whose reserved estimates exceed the aggregate cap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-budget-'));
  const manifest = join(root, 'input.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast',
    context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' },
    artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n${JSON.stringify({ ...input, url: 'https://example.org' })}\n`);
  let calls = 0;
  await assert.rejects(() => runJsonlBatch({
    manifestPath: manifest, statePath: join(root, 'state.jsonl'), maxItems: 5, compatibilityKey: 'model-a',
    aggregateBudgetUsd: 0.15, estimatedItemCostUsd: 0.10,
    evaluate: async () => { calls += 1; throw new Error('must not run'); },
  }), /aggregate budget/i);
  assert.equal(calls, 0);
});

test('resumed batch subtracts completed actual cost before dispatching another item', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-resume-actual-'));
  const manifest = join(root, 'input.jsonl');
  const statePath = join(root, 'state.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' }, artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  const costLedger = { limitUsd: 1, reservedUsd: 0.08, actualUsd: 0.08, pricingVersion: 'test-v1', records: [] };
  await runJsonlBatch({ manifestPath: manifest, statePath, maxItems: 5, compatibilityKey: 'model-a', aggregateBudgetUsd: 1, estimatedItemCostUsd: 0.10, evaluate: async () => ({ schemaVersion: 1, runId: 'spent', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'x', costLedger, profile: null, leadDecision: null, criticDecision: null, errors: [] }) });
  await writeFile(manifest, `${JSON.stringify(input)}\n${JSON.stringify({ ...input, url: 'https://example.org' })}\n`);
  let calls = 0;
  await assert.rejects(() => runJsonlBatch({ manifestPath: manifest, statePath, maxItems: 5, compatibilityKey: 'model-a', aggregateBudgetUsd: 0.15, estimatedItemCostUsd: 0.10, evaluate: async () => { calls += 1; throw new Error('must not run'); } }), /remaining aggregate budget/i);
  assert.equal(calls, 0);
});

test('resumed batch conservatively subtracts unresolved reservations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-resume-reserved-'));
  const manifest = join(root, 'input.jsonl');
  const statePath = join(root, 'state.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' }, artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  const costLedger = { limitUsd: 1, reservedUsd: 0.08, actualUsd: 0, pricingVersion: 'test-v1', records: [] };
  await runJsonlBatch({ manifestPath: manifest, statePath, maxItems: 5, compatibilityKey: 'model-a', aggregateBudgetUsd: 1, estimatedItemCostUsd: 0.10, evaluate: async () => ({ schemaVersion: 1, runId: 'interrupted', executionStatus: 'failed', assessmentStatus: null, inputHash: 'x', costLedger, profile: null, leadDecision: null, criticDecision: null, errors: [] }) });
  let calls = 0;
  await assert.rejects(() => runJsonlBatch({ manifestPath: manifest, statePath, maxItems: 5, compatibilityKey: 'model-a', aggregateBudgetUsd: 0.15, estimatedItemCostUsd: 0.10, evaluate: async () => { calls += 1; throw new Error('must not run'); } }), /remaining aggregate budget/i);
  assert.equal(calls, 0);
});

test('aggregate-budget resume rejects a legacy journal with unknown historical cost', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-legacy-cost-'));
  const manifest = join(root, 'input.jsonl');
  const statePath = join(root, 'state.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' }, artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  await runJsonlBatch({ manifestPath: manifest, statePath, maxItems: 5, compatibilityKey: 'model-a', evaluate: async () => ({ schemaVersion: 1, runId: 'legacy', executionStatus: 'failed', assessmentStatus: null, inputHash: 'x', profile: null, leadDecision: null, criticDecision: null, errors: [] }) });
  await assert.rejects(() => runJsonlBatch({ manifestPath: manifest, statePath, maxItems: 5, compatibilityKey: 'model-a', aggregateBudgetUsd: 1, estimatedItemCostUsd: 0.10, evaluate: async () => { throw new Error('must not run'); } }), /unknown cost/i);
});

test('batch rejects malformed resume records instead of trusting a completed marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-state-'));
  const manifest = join(root, 'input.jsonl');
  const state = join(root, 'state.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast',
    context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' },
    artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  await writeFile(state, '{"executionStatus":"completed"}\n');
  await assert.rejects(
    runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 1, compatibilityKey: 'model-a', evaluate: async () => { throw new Error('must not run'); } }),
    /invalid|expected/i,
  );
});

test('changing the model compatibility key reruns a completed batch input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-version-'));
  const manifest = join(root, 'input.jsonl');
  const state = join(root, 'state.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' }, artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  let calls = 0;
  const evaluator = async (): Promise<EvaluationRun> => ({ schemaVersion: 1, runId: `run-${++calls}`, executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'run-hash', profile: null, leadDecision: null, criticDecision: null, errors: [] });
  await runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 1, compatibilityKey: 'model-a', evaluate: evaluator });
  await runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 1, compatibilityKey: 'model-b', evaluate: evaluator });
  assert.equal(calls, 2);
});

test('an unscorable execution is not treated as resumably complete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-batch-unscorable-'));
  const manifest = join(root, 'input.jsonl');
  const state = join(root, 'state.jsonl');
  const input = {
    url: 'https://example.com', recipeId: 'lead-fast', context: { objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null },
    business: null, networkPolicy: { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' }, artifactRoot: root, baselineRunId: null, allowCloudVision: true, budgetUsd: 1,
  };
  await writeFile(manifest, `${JSON.stringify(input)}\n`);
  let calls = 0;
  const evaluator = async (): Promise<EvaluationRun> => ({ schemaVersion: 1, runId: `run-${++calls}`, executionStatus: 'completed', assessmentStatus: 'unscorable', inputHash: 'run-hash', profile: null, leadDecision: null, criticDecision: null, errors: [] });
  const first = await runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 1, compatibilityKey: 'model-a', evaluate: evaluator });
  const second = await runJsonlBatch({ manifestPath: manifest, statePath: state, maxItems: 1, compatibilityKey: 'model-a', evaluate: evaluator });
  assert.equal(calls, 2);
  assert.deepEqual(first, { total: 1, completed: 0, failed: 1, skipped: 0 });
  assert.deepEqual(second, { total: 1, completed: 0, failed: 1, skipped: 0 });
});
