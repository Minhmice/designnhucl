import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDatabase, runMigrations, type SqlExecutor, type SqlQueryResult } from '../src/control-plane/database.js';

test('tenant transaction sets local owner context before callback', async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const executor: SqlExecutor = { query: async (text, values) => { calls.push(values === undefined ? { text } : { text, values }); return { rows: [], rowCount: 0 }; } };
  const db = new PgDatabase(executor);
  await db.withTenant('00000000-0000-0000-0000-000000000001', async tx => { await tx.query('select $1', ['ok']); });
  assert.match(calls[0]!.text, /set_config\('app\.owner_organization_id'/);
  assert.deepEqual(calls[0]!.values, ['00000000-0000-0000-0000-000000000001', true]);
});

test('migration runner orders, checksums, and is idempotent', async () => {
  const applied = new Map<string, string>(); const calls: string[] = [];
  const executor: SqlExecutor = { query: async (text, values) => {
    calls.push(text); if (text.includes('SELECT version, checksum')) return { rows: [...applied].map(([version, checksum]) => ({ version, checksum })), rowCount: applied.size };
    if (text.includes('INSERT INTO control_plane_migrations')) { applied.set(String(values?.[0]), String(values?.[1])); return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  }} as SqlExecutor;
  const migrations = [{ version: '001', sql: 'create table x(id int);' }];
  await runMigrations(executor, migrations); await runMigrations(executor, migrations);
  assert.equal(calls.filter(c => c.includes('create table x')).length, 1);
});

test('migration checksum drift fails closed', async () => {
  const executor: SqlExecutor = { query: async text => text.includes('SELECT version, checksum') ? { rows: [{ version: '001', checksum: 'bad' }], rowCount: 1 } : { rows: [], rowCount: 0 } } as SqlExecutor;
  await assert.rejects(() => runMigrations(executor, [{ version: '001', sql: 'select 1' }]), /checksum/i);
});
