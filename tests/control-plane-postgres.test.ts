import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../src/control-plane/migrations.js';
const url = process.env.WEBLENS_PG_TEST_URL;
test('PostgreSQL control-plane integration (requires WEBLENS_PG_TEST_URL)', { skip: !url ? 'WEBLENS_PG_TEST_URL is not configured' : false }, async () => {
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url });
  const schema = `weblens_test_${process.pid}_${Date.now()}`;
  try {
    const c = await pool.connect();
    try {
      await c.query(`create schema ${schema}`);
      await c.query(`set search_path to ${schema}`);

      await migrate(c);
      const firstMigrations = await c.query<{ version: string; checksum: string }>('select version, checksum from control_plane_migrations order by version');
      assert.equal(firstMigrations.rows.length, 1, 'one migration should be recorded');
      await migrate(c);
      const secondMigrations = await c.query<{ version: string; checksum: string }>('select version, checksum from control_plane_migrations order by version');
      assert.deepEqual(secondMigrations.rows, firstMigrations.rows, 'reapplying migrations must be a no-op');

      const ownerA = '11111111-1111-7111-8111-111111111111';
      const ownerB = '22222222-2222-7222-8222-222222222222';
      for (const [ownerId, name] of [[ownerA, 'A'], [ownerB, 'B']] as const) {
        await c.query('begin');
        await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerId]);
        const owner = await c.query<{ id: string }>(
          'insert into organizations(id,owner_organization_id,name) values ($1,$1,$2) returning id',
          [ownerId, name],
        );
        assert.equal(owner.rows[0]!.id, ownerId);
        await c.query('commit');
      }

      await c.query('begin');
      await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerA]);
      const generated = await c.query<{ id: string }>(
        'insert into sources(owner_organization_id,uri) values ($1,$2) returning id',
        [ownerA, 'a'],
      );
      const generatedId = generated.rows[0]!.id;
      assert.match(generatedId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      assert.equal(generatedId[14]!.toLowerCase(), '7', 'source IDs use UUIDv7 defaults');
      assert.match(generatedId[19]!, /[89ab]/i, 'source IDs use the RFC 9562 variant');
      assert.equal((await c.query('select count(*)::int n from sources')).rows[0]!.n, 1);
      await c.query('commit');

      await c.query('begin');
      await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerB]);
      assert.equal((await c.query('select count(*)::int n from sources')).rows[0]!.n, 0, 'tenant B cannot read tenant A rows');
      await assert.rejects(
        () => c.query('insert into sources(owner_organization_id,uri) values ($1,$2)', [ownerA, 'cross-tenant-write']),
        /row-level security|policy/i,
      );
      await c.query('rollback');

      await c.query('begin');
      await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerB]);
      await c.query('insert into sources(owner_organization_id,uri) values ($1,$2)', [ownerB, 'rollback']);
      await c.query('rollback');
      await c.query('begin');
      await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerB]);
      assert.equal((await c.query("select count(*)::int n from sources where uri = 'rollback'")).rows[0]!.n, 0, 'rolled-back rows must be absent');
      await c.query('commit');
    } finally { c.release(); }
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
