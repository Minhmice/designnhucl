import { runMigrations, loadMigrations, type SqlExecutor, type PgPoolLike } from './database.js';
export { runMigrations, loadMigrations };
export async function migrate(executor: SqlExecutor | PgPoolLike): Promise<void> {
  if ('connect' in executor) { const client = await executor.connect(); try { await runMigrations(client, await loadMigrations()); } finally { client.release(); } }
  else await runMigrations(executor, await loadMigrations());
}
