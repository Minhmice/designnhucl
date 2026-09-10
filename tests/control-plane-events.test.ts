import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore, type EventInput } from '../src/control-plane/events.js';
import type { SqlExecutor, SqlQueryResult, Transaction } from '../src/control-plane/database.js';

const owner = '00000000-0000-0000-0000-000000000001';
const aggregate = '00000000-0000-0000-0000-000000000002';
const input: EventInput = { ownerOrganizationId: owner, aggregateType: 'run', aggregateId: aggregate, eventType: 'created', eventVersion: 1, payload: { ok: true }, actor: 'agent', traceId: 'trace-1' };

function row(sequence = '1') { return { id: '00000000-0000-0000-0000-000000000003', ...input, sequence, occurredAt: new Date('2026-01-01T00:00:00Z').toISOString(), causationId: null, correlationId: null, idempotencyKey: null }; }

test('append allocates owner sequence and returns inserted event', async () => {
  let seen: { text: string; values: readonly unknown[] | undefined } | undefined;
  const executor: SqlExecutor = { query: async <T>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<T>> => { seen = { text, values }; return { rows: [row() as T], rowCount: 1 }; } };
  const result = await new EventStore(executor, { withTenant: async (_owner, work) => work(executor) }).append(input);
  assert.equal(result.sequence, '1');
  assert.match(seen!.text, /event_counters/); assert.match(seen!.text, /owner_organization_id/);
  assert.deepEqual(seen!.values, [owner, aggregate, 'run', 'created', 1, input.payload, undefined, 'agent', 'trace-1', undefined, undefined, undefined]);
});

test('appendInTransaction uses supplied transaction', async () => {
  let called = false;
  const tx: Transaction = { query: async <T>() => { called = true; return { rows: [row() as T], rowCount: 1 }; }, commit: async () => {}, rollback: async () => {} };
  await new EventStore({ query: async () => ({ rows: [], rowCount: 0 }) }).appendInTransaction(tx, input);
  assert.equal(called, true);
});

test('list methods are tenant scoped with cursor and limit', async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const executor: SqlExecutor = { query: async <T>(text: string, values?: readonly unknown[]) => { calls.push({ text, values }); return { rows: [row() as T], rowCount: 1 }; } };
  const store = new EventStore(executor);
  await store.listByAggregate(owner, 'run', aggregate);
  await store.listSince(owner, 4, 10);
  assert.match(calls[0]!.text, /owner_organization_id/); assert.match(calls[0]!.text, /aggregate_type/);
  assert.deepEqual(calls[1]!.values, [owner, '4', 10]);
});

test('listSince binds canonical precision-safe cursor strings and accepts returned sequence', async () => {
  const calls: Array<{ values: readonly unknown[] | undefined }> = [];
  const executor: SqlExecutor = { query: async <T>(_text: string, values?: readonly unknown[]) => { calls.push({ values }); return { rows: [row('9007199254740993') as T], rowCount: 1 }; } };
  const store = new EventStore(executor);
  const events = await store.listSince(owner, '0009007199254740993', 10);
  await store.listSince(owner, events[0]!.sequence, 10);
  await store.listSince(owner, 9007199254740993n, 10);
  assert.deepEqual(calls.map(c => c.values), [[owner, '9007199254740993', 10], [owner, '9007199254740993', 10], [owner, '9007199254740993', 10]]);
});

test('listSince rejects unsafe numeric and malformed cursors', async () => {
  const executor: SqlExecutor = { query: async () => ({ rows: [], rowCount: 0 }) };
  const store = new EventStore(executor);
  await assert.rejects(() => store.listSince(owner, Number.MAX_SAFE_INTEGER + 1), /cursor/);
  await assert.rejects(() => store.listSince(owner, '-1'), /cursor/);
  await assert.rejects(() => store.listSince(owner, '1.2'), /cursor/);
});

test('malformed owner id is rejected before SQL execution', async () => {
  let calls = 0; const executor: SqlExecutor = { query: async () => { calls++; return { rows: [], rowCount: 0 }; } };
  await assert.rejects(() => new EventStore(executor).append({ ...input, ownerOrganizationId: 'bad' }), /ownerOrganizationId/);
  assert.equal(calls, 0);
});

test('reusing an idempotency key returns an identical existing event', async () => {
  const existing = { ...row(), idempotencyKey: 'request-1' };
  let calls = 0;
  const executor: SqlExecutor = { query: async <T>() => ({ rows: (++calls === 2 ? [existing] : []) as T[], rowCount: 1 }) };
  const result = await new EventStore(executor, { withTenant: async (_owner, work) => work(executor) }).append({ ...input, idempotencyKey: 'request-1' });
  assert.equal(result.id, existing.id); assert.equal(calls, 2);
});

test('conflicting idempotency-key reuse throws without issuing a second append', async () => {
  const existing = { ...row(), idempotencyKey: 'request-1', eventType: 'other' };
  let calls = 0;
  const executor: SqlExecutor = { query: async <T>() => ({ rows: (++calls === 2 ? [existing] : []) as T[], rowCount: 1 }) };
  await assert.rejects(() => new EventStore(executor, { withTenant: async (_owner, work) => work(executor) }).append({ ...input, idempotencyKey: 'request-1' }), /Idempotency key conflict/);
  assert.equal(calls, 2);
});

test('idempotency payload comparison follows JSON object semantics', async () => {
  const existing = { ...row(), idempotencyKey: 'request-2', payload: { a: 1, b: 2 } };
  let calls = 0; const executor: SqlExecutor = { query: async <T>() => ({ rows: (++calls === 2 ? [existing] : []) as T[], rowCount: 1 }) };
  const result = await new EventStore(executor, { withTenant: async (_owner, work) => work(executor) }).append({ ...input, idempotencyKey: 'request-2', payload: { b: 2, a: 1 } });
  assert.equal(result.id, existing.id);
});

test('append rejects malformed optional fields before SQL', async () => {
  let calls = 0; const executor: SqlExecutor = { query: async () => { calls++; return { rows: [], rowCount: 0 }; } };
  await assert.rejects(() => new EventStore(executor).append({ ...input, causationId: 'bad' }), /causationId/);
  await assert.rejects(() => new EventStore(executor).append({ ...input, occurredAt: 'bad-date' }), /occurredAt/);
  await assert.rejects(() => new EventStore(executor).append({ ...input, idempotencyKey: '' }), /idempotencyKey/);
  assert.equal(calls, 0);
});

test('idempotent replay locks then looks up without allocation', async () => {
  const calls: string[] = []; const existing = { ...row(), idempotencyKey: 'replay' };
  const executor: SqlExecutor = { query: async <T>(text: string) => { calls.push(text); return { rows: (calls.length === 2 ? [existing] : []) as T[], rowCount: 1 }; } };
  await new EventStore(executor, { withTenant: async (_owner, work) => work(executor) }).append({ ...input, idempotencyKey: 'replay' });
  assert.match(calls[0]!, /pg_advisory_xact_lock/); assert.match(calls[1]!, /FROM domain_events/); assert.equal(calls.length, 2);
});

test('nested invalid JSON and cycles fail before executor invocation', async () => {
  let calls = 0; const executor: SqlExecutor = { query: async () => { calls++; return { rows: [], rowCount: 0 }; } };
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
  await assert.rejects(() => new EventStore(executor).append({ ...input, payload: { nested: undefined } }), /payload/);
  await assert.rejects(() => new EventStore(executor).append({ ...input, payload: cyclic }), /payload/);
  await assert.rejects(() => new EventStore(executor).append({ ...input, payload: [Number.NaN] }), /payload/);
  assert.equal(calls, 0);
});

test('append requires a tenant transaction runner', async () => {
  const executor: SqlExecutor = { query: async () => ({ rows: [], rowCount: 0 }) };
  await assert.rejects(() => new EventStore(executor).append(input), /transaction runner/);
});
