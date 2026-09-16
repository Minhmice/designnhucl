import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EvaluationWorkerQueue } from '../src/dashboard/worker-queue.js';
import type { JudgeCaller } from '../src/judges.js';

test('EvaluationWorkerQueue enqueues and asynchronously completes a job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-worker-queue-test-'));
  const mockCaller: JudgeCaller = async ({ kind }) => ({
    id: `${kind}-test`,
    kind,
    status: 'complete',
    model: 'mock',
    promptVersion: 'p1',
    rubricVersion: 'r1',
    classification: null,
    ratings: [],
    findings: [],
    limitations: [],
    usage: { inputTokens: 0, outputTokens: 0 },
  });

  try {
    const queue = new EvaluationWorkerQueue(root, mockCaller);
    const job = queue.enqueue('https://example.com', 'lead-fast');
    assert.equal(job.state, 'queued');
    assert.equal(job.url, 'https://example.com');

    const found = queue.getJob(job.id);
    assert.ok(found);
    assert.equal(found?.id, job.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
