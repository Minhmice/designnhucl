import { createHash } from 'node:crypto';

export interface SqlQueryResult<T = Record<string, unknown>> { rows: T[]; rowCount: number | null }
export interface SqlExecutor { query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<T>> }
export interface Transaction extends SqlExecutor { commit(): Promise<void>; rollback(): Promise<void> }
export interface PgClientLike extends SqlExecutor { release(): void }
export interface PgPoolLike extends SqlExecutor { connect(): Promise<PgClientLike> }

export class PgDatabase {
  constructor(private readonly executor: SqlExecutor, private readonly pool?: PgPoolLike) {}
  async query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]) { return this.executor.query<T>(text, values); }
  async withTenant<T>(ownerOrganizationId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = this.pool ? await this.pool.connect() : this.executor as PgClientLike;
    const txExecutor = client;
    await txExecutor.query('BEGIN');
    await txExecutor.query("select set_config('app.owner_organization_id', $1, $2)", [ownerOrganizationId, true]);
    const tx: Transaction = {
      query: txExecutor.query.bind(txExecutor),
      commit: async () => { await txExecutor.query('commit'); },
      rollback: async () => { await txExecutor.query('rollback'); },
    };
    try { const result = await work(tx); await tx.commit(); return result; }
    catch (error) { await tx.rollback(); throw error; }
    finally { if (this.pool) client.release(); }
  }
}

export interface Migration { version: string; sql: string }
export async function runMigrations(executor: SqlExecutor, migrations: readonly Migration[]): Promise<void> {
  const ordered = [...migrations].sort((a, b) => a.version.localeCompare(b.version));
  if (ordered.some((m, i) => !m.version || (i > 0 && m.version === ordered[i - 1]!.version))) throw new Error('Malformed migrations');
  await executor.query('SELECT pg_advisory_lock(hashtext($1))', ['weblens-control-plane-migrations']);
  try {
  await executor.query('CREATE TABLE IF NOT EXISTS control_plane_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const existing = await executor.query<{ version: string; checksum: string }>('SELECT version, checksum FROM control_plane_migrations');
  const known = new Map(existing.rows.map(r => [r.version, r.checksum]));
  for (const migration of ordered) {
    const checksum = createHash('sha256').update(migration.sql).digest('hex');
    const prior = known.get(migration.version);
    if (prior && prior !== checksum) throw new Error(`Migration checksum drift for ${migration.version}`);
    if (prior) continue;
    await executor.query('BEGIN');
    try {
      await executor.query(migration.sql);
      await executor.query('INSERT INTO control_plane_migrations (version, checksum) VALUES ($1, $2)', [migration.version, checksum]);
      await executor.query('COMMIT');
    } catch (error) { await executor.query('ROLLBACK'); throw error; }
  }
  } finally { await executor.query('SELECT pg_advisory_unlock(hashtext($1))', ['weblens-control-plane-migrations']); }
}

export async function loadMigrations(): Promise<Migration[]> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const sql = await readFile(fileURLToPath(new URL('./sql/001_control_plane.sql', import.meta.url)), 'utf8');
  const identity = await readFile(fileURLToPath(new URL('./sql/002_identity_provenance.sql', import.meta.url)), 'utf8');
  return [{ version: '001_control_plane', sql }, { version: '002_identity_provenance', sql: identity }];
}
