import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createDashboardServer } from '../src/dashboard/server.js';
import type { SqlExecutor, SqlQueryResult } from '../src/control-plane/database.js';
import { DashboardService } from '../src/dashboard/service.js';

test('dashboard API /api/agents and /api/logs with unavailable database', async () => {
  const srv = createDashboardServer({ port: 3011 });
  // Overwrite getControlPlaneReadRepository to return null or throw
  DashboardService.prototype.getControlPlaneReadRepository = () => { throw new Error('Control plane read repository not configured'); };

  await srv.listen();

  try {
    const agentsRes = await fetch('http://localhost:3011/api/agents');
    assert.equal(agentsRes.status, 503);
    const agentsData = await agentsRes.json() as { code: string };
    assert.equal(agentsData.code, 'control_plane_unavailable');

    const logsRes = await fetch('http://localhost:3011/api/logs?runId=123');
    assert.equal(logsRes.status, 503);
    const logsData = await logsRes.json() as { code: string };
    assert.equal(logsData.code, 'control_plane_unavailable');
  } finally {
    await srv.close();
  }
});
