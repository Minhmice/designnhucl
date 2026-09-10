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
    try { await c.query(`create schema ${schema}`); await c.query(`set search_path to ${schema}`); await migrate(c); await migrate(c);
      const uuid = await c.query("select uuidv7() as id"); assert.match(uuid.rows[0].id, /^[0-9a-f-]{36}$/i);
      const ownerA = '00000000-0000-0000-0000-0000000000a1'; const ownerB = '00000000-0000-0000-0000-0000000000b1';
      await c.query('begin'); await c.query('insert into organizations(id,owner_organization_id,name) values ($1,$1,$2),($3,$3,$4)', [ownerA,'A',ownerB,'B']); await c.query('commit');
      await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerA]); await c.query('insert into sources(owner_organization_id,uri) values ($1,$2)', [ownerA,'a']);
      assert.equal((await c.query('select count(*)::int n from sources')).rows[0].n, 1); await c.query("select set_config('app.owner_organization_id',$1,true)", [ownerB]); assert.equal((await c.query('select count(*)::int n from sources')).rows[0].n, 0);
      await c.query('begin'); await c.query('insert into sources(owner_organization_id,uri) values ($1,$2)', [ownerB,'rollback']); await c.query('rollback'); assert.equal((await c.query('select count(*)::int n from sources')).rows[0].n, 0);
    } finally { c.release(); }
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
