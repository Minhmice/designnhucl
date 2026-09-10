import { runMigrations, loadMigrations, type SqlExecutor } from './database.js';
export { runMigrations, loadMigrations };
export async function migrate(executor: SqlExecutor): Promise<void> { await runMigrations(executor, await loadMigrations()); }
