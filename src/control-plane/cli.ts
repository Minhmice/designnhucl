import pg from 'pg';
import { migrate } from './migrations.js';
const url = process.env.WEBLENS_PG_URL ?? process.env.WEBLENS_PG_TEST_URL;
if (!url) throw new Error('WEBLENS_PG_URL is required');
const pool = new pg.Pool({ connectionString: url });
try { await migrate(pool); } finally { await pool.end(); }
