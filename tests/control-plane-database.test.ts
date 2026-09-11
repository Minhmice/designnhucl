import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PgDatabase, runMigrations, loadMigrations, type SqlExecutor, type SqlQueryResult } from '../src/control-plane/database.js';

test('tenant transaction sets local owner context before callback', async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const executor: SqlExecutor = { query: async (text, values) => { calls.push(values === undefined ? { text } : { text, values }); return { rows: [], rowCount: 0 }; } };
  const db = new PgDatabase(executor);
  await db.withTenant('00000000-0000-0000-0000-000000000001', async tx => { await tx.query('select $1', ['ok']); });
  assert.match(calls[1]!.text, /set_config\('app\.owner_organization_id'/);
  assert.deepEqual(calls[1]!.values, ['00000000-0000-0000-0000-000000000001', true]);
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

test('ordered evaluation adapter migration adds provenance and reference trace columns', async () => {
  const migrations = await loadMigrations();
  assert.deepEqual(migrations.map(m => m.version), ['001_control_plane', '002_identity_provenance', '003_identity_normalization', '004_evaluation_adapter', '005_evaluation_subject']);
  const adapterSql = migrations[3]!.sql;
  for (const column of ['subject_organization_id', 'recipe', 'artifact_uri', 'subject_context_sha256', 'trace_id', 'correlation_id']) assert.match(adapterSql, new RegExp(`evaluation_requests[\\s\\S]*${column}`));
  assert.match(adapterSql, /evaluation_references[\s\S]*trace_id/);
  assert.match(adapterSql, /evaluation_references[\s\S]*correlation_id/);
  const subjectSql = migrations.at(-1)!.sql;
  assert.match(subjectSql, /evaluation_references[\s\S]*subject_organization_id/);
  assert.match(subjectSql, /evaluation_references_subject_fk/);
  assert.match(subjectSql, /evaluation_references_subject_tenant_fk/);
  assert.match(subjectSql, /evaluation_requests_subject_tenant_fk/);
  assert.match(subjectSql, /evaluation_requests_subject_owner_check/);
  assert.match(subjectSql, /reconciliation_required/);
  assert.match(adapterSql, /ADD CONSTRAINT evaluation_requests_subject_fk/);
});

test('compiled package bundles migration SQL assets beside generated database code', () => {
  assert.equal(existsSync(new URL('../src/control-plane/sql/005_evaluation_subject.sql', import.meta.url)), true);
});

test('compiled migration loading does not depend on process.cwd', async () => {
  const original = process.cwd();
  const temporary = await (await import('node:fs/promises')).mkdtemp(`${original}\\migration-cwd-`);
  try {
    process.chdir(temporary);
    assert.equal((await loadMigrations()).at(-1)!.version, '005_evaluation_subject');
  } finally { process.chdir(original); await (await import('node:fs/promises')).rm(temporary, { recursive: true, force: true }); }
});
