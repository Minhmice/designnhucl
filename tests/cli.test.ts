import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import { saveRun } from '../src/store.js';
import type { EvaluationRun } from '../src/contracts.js';

test('replay reads an immutable run without browser or model dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-cli-'));
  const run: EvaluationRun = { schemaVersion: 1, runId: 'replay-me', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'hash', profile: null, leadDecision: null, criticDecision: null, errors: [] };
  await saveRun(run, root);
  const output: string[] = [];
  const code = await runCli(['replay', 'replay-me', '--artifacts', root], { stdout: (value: string) => output.push(value), stderr: () => undefined, environment: {} });
  assert.equal(code, 0);
  assert.match(output.join(''), /ASSESSMENT: COMPLETE/);
});

test('replay returns incomplete for an unscorable completed execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-cli-replay-'));
  const run: EvaluationRun = { schemaVersion: 1, runId: 'replay-unscorable', executionStatus: 'completed', assessmentStatus: 'unscorable', inputHash: 'hash', profile: null, leadDecision: null, criticDecision: null, errors: [] };
  await saveRun(run, root);
  const code = await runCli(['replay', run.runId, '--artifacts', root], { stdout: () => undefined, stderr: () => undefined, environment: {} });
  assert.equal(code, 3);
});

test('unknown commands return an input error', async () => {
  const code = await runCli(['explode'], { stdout: () => undefined, stderr: () => undefined, environment: {} });
  assert.equal(code, 2);
});

test('batch enforces its item cap before starting live evaluation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-cli-batch-'));
  const manifest = join(root, 'batch.jsonl');
  await writeFile(manifest, '{}\n{}\n');
  const errors: string[] = [];
  const code = await runCli(['batch', manifest, '--max-items', '1', '--allow-cloud-vision', '--budget', '1'], {
    stdout: () => undefined,
    stderr: (value) => errors.push(value),
    environment: { OPENAI_API_KEY: 'not-used', WEBLENS_ESTIMATED_RUN_COST_USD: '0.01' },
  });
  assert.equal(code, 2);
  assert.match(errors.join(''), /exceeds.*cap/i);
});

test('live evaluation requires an explicit local or public network mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-cli-mode-'));
  const context = join(root, 'context.json');
  await writeFile(context, JSON.stringify({ objective: 'x', audience: 'x', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }));
  const errors: string[] = [];
  const code = await runCli(['evaluate', 'https://example.com', '--context', context, '--artifacts', root, '--allow-cloud-vision', '--budget', '0.10'], {
    stdout: () => undefined,
    stderr: (value) => errors.push(value),
    environment: { OPENAI_API_KEY: 'not-used', WEBLENS_ESTIMATED_RUN_COST_USD: '0.01' },
  });
  assert.equal(code, 2);
  assert.match(errors.join(''), /explicitly select.*network mode/i);
});
