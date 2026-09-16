import assert from 'node:assert/strict';
import test from 'node:test';
import { ControlPlaneReadRepository } from '../src/dashboard/control-plane-read.js';
import type { SqlExecutor } from '../src/control-plane/database.js';

const ownerId = '11111111-1111-1111-1111-111111111111';
const runId = '22222222-2222-2222-2222-222222222222';

function executor(): SqlExecutor {
  return {
    query: async <T = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      if (text.includes('FROM agent_runs')) return {
        rows: [{ id: runId, owner_organization_id: values?.[0], state: 'running', lease_owner: 'worker-a', lease_expires_at: new Date(Date.now() + 60000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), step_count: '2', latest_step_state: 'running' }] as T[], rowCount: 1,
      };
      if (text.includes('FROM run_steps')) return {
        rows: [{ id: '33333333-3333-3333-3333-333333333333', owner_organization_id: ownerId, run_id: runId, sequence: 1, attempt: 1, state: 'succeeded', checkpoint: { page: '/' }, input_projection: { url: 'https://example.com' }, output_projection: { artifactCount: 2 }, error_provenance: null, lease_owner: 'worker-a', lease_expires_at: new Date().toISOString(), started_at: new Date(Date.now() - 1000).toISOString(), finished_at: new Date().toISOString() }] as T[], rowCount: 1,
      };
      if (text.includes('FROM domain_events')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
}

test('agent read model maps run and bounded step detail', async () => {
  const repository = new ControlPlaneReadRepository(executor());
  const runs = await repository.listAgentRuns(ownerId, 10);
  assert.equal(runs[0]?.state, 'running');
  assert.equal(runs[0]?.stepCount, 2);
  const detail = await repository.getAgentRunDetail(ownerId, runId);
  assert.equal(detail.id, runId);
  assert.equal(detail.steps[0]?.state, 'succeeded');
  assert.equal(detail.steps[0]?.durationMs, 1000);
});

test('agent read model rejects invalid owner and run IDs', async () => {
  const repository = new ControlPlaneReadRepository(executor());
  await assert.rejects(() => repository.listAgentRuns('not-an-uuid'), /Invalid ownerOrganizationId/);
  await assert.rejects(() => repository.getAgentRunDetail(ownerId, 'bad-id'), /Invalid runId/);
});
