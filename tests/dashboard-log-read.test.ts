import assert from 'node:assert/strict';
import test from 'node:test';
import { ControlPlaneReadRepository } from '../src/dashboard/control-plane-read.js';
import type { SqlExecutor } from '../src/control-plane/database.js';

const ownerId = '11111111-1111-1111-1111-111111111111';

function executor(rows: unknown[]): SqlExecutor {
  return {
    query: async <T>() => ({ rows: rows as T[], rowCount: rows.length }),
  };
}

test('cursor log stream redacts sensitive payload and returns nextCursor', async () => {
  const repo = new ControlPlaneReadRepository(executor([{
    id: 'e1',
    sequence: '10',
    owner_organization_id: ownerId,
    aggregate_type: 'AgentRun',
    aggregate_id: 'r1',
    event_type: 'RunStarted',
    payload: { url: 'http://a', apiKey: 'sk-1234', data: { authorization: 'Bearer b', safe: true } },
    occurred_at: new Date().toISOString()
  }]));

  const res = await repo.listDomainEventsStream(ownerId, { cursor: '0' });
  assert.equal(res.events[0]?.id, 'e1');
  assert.equal(res.nextCursor, '10');
  
  const payload = res.events[0]?.payload as any;
  assert.equal(payload.url, 'http://a');
  assert.equal(payload.apiKey, '[redacted]');
  assert.equal(payload.data.authorization, '[redacted]');
  assert.equal(payload.data.safe, true);
});

test('cursor log stream handles empty result', async () => {
  const repo = new ControlPlaneReadRepository(executor([]));
  const res = await repo.listDomainEventsStream(ownerId, { cursor: '42' });
  assert.equal(res.events.length, 0);
  assert.equal(res.nextCursor, '42');
});

test('cursor log stream handles invalid cursor', async () => {
  const repo = new ControlPlaneReadRepository(executor([]));
  await assert.rejects(() => repo.listDomainEventsStream(ownerId, { cursor: 'abc' }), /Invalid cursor/);
});
