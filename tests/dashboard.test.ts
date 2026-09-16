import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { saveRun } from '../src/store.js';
import { DashboardService } from '../src/dashboard/service.js';
import { createDashboardServer } from '../src/dashboard/server.js';
import type { EvaluationRun } from '../src/contracts.js';

test('DashboardService correctly lists evaluated websites from artifact runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-dashboard-test-'));
  try {
    const now = new Date().toISOString();
    const dummyRun: EvaluationRun = {
      schemaVersion: 1,
      runId: 'test-run-123',
      recipeId: 'lead-fast',
      executionStatus: 'completed',
      assessmentStatus: 'complete',
      inputHash: 'dummyhash',
      bundle: {
        schemaVersion: 1,
        runId: 'test-run-123',
        targetUrl: 'https://example.com',
        captureStartedAt: now,
        captureCompletedAt: now,
        assessmentStatus: 'complete',
        accessReason: null,
        artifacts: [],
        refs: [],
        requiredEvidence: 0,
        observedEvidence: 0,
        environmentLimitations: [],
        requirementChecks: [],
      },
      profile: {
        schemaVersion: 1,
        assessmentStatus: 'complete',
        classification: {
          archetype: 'saas_marketing',
          designLanguage: 'tailwind_clean',
          evidenceConfidence: 'high',
          evidenceIds: ['screenshot-1'],
        },
        dimensions: {
          visualClarity: { value: 85, state: 'assessed', method: 'rubric_v1', coverage: { observed: 1, applicable: 1 } },
          brandAlignment: { value: 90, state: 'assessed', method: 'rubric_v1', coverage: { observed: 1, applicable: 1 } },
        },
        findings: [],
        strengths: [],
        evidenceCoverage: { observed: 2, required: 2 },
        versions: { rubric: 'r1', prompt: 'p1', model: 'mock' },
      },
      leadDecision: {
        verdict: 'PROSPECT',
        opportunityScore: 85,
        signals: { visual: 85 },
        missingSignals: [],
        reasonCodes: ['high_clarity'],
      },
      criticDecision: null,
      errors: [],
    };

    await saveRun(dummyRun, root);

    const service = new DashboardService(root);
    const list = await service.listEvaluatedWebsites();

    assert.equal(list.length, 1);
    assert.equal(list[0]?.runId, 'test-run-123');
    assert.equal(list[0]?.url, 'https://example.com');
    assert.equal(list[0]?.verdict, 'PROSPECT');
    assert.equal(list[0]?.score, 88); // (85 + 90) / 2 = 87.5 -> 88
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('createDashboardServer can start and expose /api/evaluations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-server-test-'));
  const port = 34567;
  const server = createDashboardServer({ port, host: '127.0.0.1', artifactRoot: root });

  try {
    await server.listen();
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluations`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: unknown[] };
    assert.deepEqual(body, { data: [] });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
