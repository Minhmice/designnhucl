import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRunStore, type EventAppender } from '../src/control-plane/agents.js';
import type { SqlExecutor } from '../src/control-plane/database.js';

const owner = '00000000-0000-0000-0000-000000000001';
const runId = '00000000-0000-0000-0000-000000000002';
const now = new Date('2026-01-01T00:00:00Z');

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: runId, owner_organization_id: owner, state: 'queued', lease_owner: null, lease_expires_at: null, created_at: now.toISOString(), updated_at: now.toISOString(), ...overrides };
}

function harness(rows: Record<string, unknown>[] = [row()]) {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const tx: SqlExecutor = { query: async <T>(text: string, values?: readonly unknown[]) => { calls.push({ text, values });
    if (text.startsWith('SELECT id FROM agent_runs')) return { rows: [row({ state: 'running', lease_owner: 'worker-1', lease_expires_at: new Date(now.getTime() + 60000).toISOString() })] as T[], rowCount: 1 };
    if (text.includes('run_steps')) return { rows: [{ id: 'step-1', owner_organization_id: owner, run_id: runId, sequence: 1, attempt: 1, state: 'queued', lease_owner: 'worker-1', lease_expires_at: new Date(now.getTime() + 60000).toISOString() }] as T[], rowCount: 1 };
    if (text.includes('lease_expires_at =') && text.includes('state NOT IN')) return { rows: [row({ state: 'succeeded', lease_owner: 'worker-1' })] as T[], rowCount: 1 };
    if (text.includes("state = 'leased'")) return { rows: [row({ state: 'leased', lease_owner: 'worker-1', lease_expires_at: new Date(now.getTime() + 60000).toISOString() })] as T[], rowCount: 1 };
    return { rows: rows as T[], rowCount: rows.length }; } };
  const events: Array<{ type: string; payload: unknown }> = [];
  const eventAppender: EventAppender = { appendInTransaction: async (_tx: SqlExecutor, input) => { events.push({ type: input.eventType, payload: input.payload }); return { ...input, id: 'event', sequence: '1', occurredAt: now.toISOString() }; } };
  const store = new AgentRunStore({ withTenant: async <T>(_owner: string, work: (tx: SqlExecutor) => Promise<T>) => work(tx) }, eventAppender);
  return { store, calls, events };
}

test('create appends event in tenant transaction with parameterized owner', async () => {
  const h = harness([row()]);
  const result = await h.store.create(owner);
  assert.equal(result.state, 'queued');
  assert.match(h.calls[0]!.text, /INSERT INTO agent_runs/);
  assert.deepEqual(h.calls[0]!.values, [owner, undefined]);
  assert.equal(h.events[0]!.type, 'agent_run.created');
});

test('claimNext uses SKIP LOCKED and leases only queued owner runs', async () => {
  const h = harness([row()]);
  const result = await h.store.claimNext(owner, 'worker-1', 30, now);
  assert.equal(result?.state, 'leased');
  assert.match(h.calls[0]!.text, /FOR UPDATE SKIP LOCKED/);
  assert.match(h.calls[0]!.text, /owner_organization_id = \$1/);
  assert.deepEqual(h.calls[0]!.values, [owner, 'worker-1', now, 30]);
  assert.equal(h.events[0]!.type, 'agent_run.leased');
  assert.match(h.calls[0]!.text, /LIMIT 1/);
});

test('direct queued to leased transition is rejected; claimNext is leasing path', async () => {
  const h = harness([row({ state: 'queued' })]);
  await assert.rejects(() => h.store.transition(owner, runId, 'leased', { expectedFrom: 'queued' }), /claimNext|lease/i);
  assert.equal(h.calls.filter(c => c.text.startsWith('UPDATE agent_runs')).length, 0);
});

test('transition rejects invalid state before SQL', async () => {
  const h = harness([row()]);
  await assert.rejects(() => h.store.transition(owner, runId, 'succeeded', { expectedFrom: 'queued', actor: 'actor' }), /transition/i);
  assert.equal(h.calls.length, 1);
});

test('worker transition requires matching unexpired lease', async () => {
  const h = harness([row({ state: 'leased', lease_owner: 'worker-1', lease_expires_at: new Date(now.getTime() - 1).toISOString() })]);
  await assert.rejects(() => h.store.transition(owner, runId, 'running', { expectedFrom: 'leased', leaseOwner: 'worker-1', now }), /lease|expired/i);
  assert.equal(h.calls.filter(c => c.text.startsWith('UPDATE agent_runs')).length, 0);
  await assert.rejects(() => h.store.transition(owner, runId, 'running', { expectedFrom: 'leased', leaseOwner: '' }), /lease owner/i);
});

test('heartbeat requires lease owner and never resurrects terminal run', async () => {
  const h = harness([row({ state: 'succeeded', lease_owner: 'worker-1' })]);
  await assert.rejects(() => h.store.heartbeat(owner, runId, 'worker-1', 30, now), /terminal|state/i);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0]!.text, /state NOT IN/);
});

test('step sequence and attempt are persisted with bounded projections', async () => {
  const h = harness([row({ state: 'running', lease_owner: 'worker-1', lease_expires_at: new Date(now.getTime() + 60000).toISOString() })]);
  const step = await h.store.appendStep(owner, runId, 'worker-1', { inputProjection: { url: 'https://example.com' }, checkpoint: { cursor: 1 } }, now);
  assert.equal(step.sequence, 1);
  assert.equal(step.attempt, 1);
  assert.match(h.calls.find(c => c.text.includes('run_steps'))!.text, /run_steps/);
  assert.equal(h.events[0]!.type, 'agent_run.step_appended');
  assert.match(h.calls.find(c => c.text.includes('FOR UPDATE'))!.text, /FOR UPDATE/);
  assert.match(h.calls.find(c => c.text.includes('s.owner_organization_id'))!.text, /s\.owner_organization_id = \$1/);
});

test('terminal transition clears lease metadata', async () => {
  const h = harness([row({ state: 'running', lease_owner: 'worker-1', lease_expires_at: new Date(now.getTime() + 60000).toISOString() })]);
  await h.store.transition(owner, runId, 'succeeded', { expectedFrom: 'running', leaseOwner: 'worker-1', now });
  assert.match(h.calls.at(-1)!.text, /lease_owner = NULL/);
  assert.match(h.calls.at(-1)!.text, /lease_expires_at = NULL/);
});

test('malformed ids and oversized projections fail before executor calls', async () => {
  const h = harness();
  await assert.rejects(() => h.store.create('bad'), /UUID/);
  await assert.rejects(() => h.store.appendStep(owner, runId, 'worker', { outputProjection: { huge: 'x'.repeat(20000) } }), /projection|size/i);
  await assert.rejects(() => h.store.appendStep(owner, runId, 'worker', { outputProjection: { huge: 'é'.repeat(10000) } }), /projection|size/i);
  assert.equal(h.calls.length, 0);
});
