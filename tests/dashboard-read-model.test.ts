import assert from 'node:assert/strict';
import test from 'node:test';
import { ControlPlaneReadRepository } from '../src/dashboard/control-plane-read.js';
import type { SqlExecutor } from '../src/control-plane/database.js';

test('ControlPlaneReadRepository maps agent runs and handles tenant bounds', async () => {
  const fakeExecutor: SqlExecutor = {
    query: async <T = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      let rows: unknown[] = [];
      if (text.includes('FROM agent_runs a')) {
        rows = [
          {
            id: '00000000-0000-0000-0000-000000000001',
            owner_organization_id: values?.[0],
            state: 'running',
            lease_owner: 'worker-1',
            lease_expires_at: new Date(Date.now() + 60000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            step_count: '3',
            latest_step_state: 'running',
          },
        ];
        return { rows: rows as T[], rowCount: 1 };
      }
      if (text.includes('FILTER (WHERE state IN')) {
        rows = [
          {
            active_count: '1',
            queued_count: '0',
            stale_count: '0',
            total_count: '1',
          },
        ];
        return { rows: rows as T[], rowCount: 1 };
      }
      if (text.includes('SELECT COUNT(*) as total_events')) {
        rows = [{ total_events: '12' }];
        return { rows: rows as T[], rowCount: 1 };
      }
      if (text.includes('FROM domain_events')) {
        rows = [
          {
            id: '00000000-0000-0000-0000-000000000002',
            sequence: '1',
            owner_organization_id: values?.[0],
            aggregate_type: 'agent_run',
            aggregate_id: '00000000-0000-0000-0000-000000000001',
            event_type: 'agent_run.created',
            event_version: 1,
            payload: { state: 'queued' },
            occurred_at: new Date().toISOString(),
          },
        ];
        return { rows: rows as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };

  const repo = new ControlPlaneReadRepository(fakeExecutor);
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const runs = await repo.listAgentRuns(tenantId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.state, 'running');
  assert.equal(runs[0]?.stepCount, 3);

  const overview = await repo.getControlPlaneOverview(tenantId);
  assert.equal(overview.activeAgentsCount, 1);
  assert.equal(overview.totalDomainEvents, 12);

  const events = await repo.listDomainEvents(tenantId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, 'agent_run.created');
});
