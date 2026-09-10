import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../src/control-plane/migrations.js';
const url = process.env.WEBLENS_PG_TEST_URL;
test('PostgreSQL control-plane integration (requires WEBLENS_PG_TEST_URL)', { skip: !url ? 'WEBLENS_PG_TEST_URL is not configured' : false }, async () => {
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url });
  try {
    await migrate(pool); await migrate(pool);
    const uuid = await pool.query("select uuidv7() as id");
    assert.match(uuid.rows[0].id, /^[0-9a-f-]{36}$/i);
    await pool.query('begin'); await pool.query('rollback');
    assert.equal((await pool.query('select count(*)::int as n from control_plane_migrations')).rows[0].n >= 1, true);
  } finally { await pool.end(); }
});
