import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { DashboardService } from './service.js';
import { EvaluationWorkerQueue } from './worker-queue.js';
import type { JudgeCaller } from '../judges.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  artifactRoot?: string;
  judgeCaller?: JudgeCaller;
}

export function createDashboardServer(options: ServerOptions = {}) {
  const port = options.port ?? 3000;
  const host = options.host ?? '0.0.0.0';
  const artifactRoot = options.artifactRoot ?? resolve(process.cwd(), 'runs');
  const service = new DashboardService(artifactRoot);
  const queue = new EvaluationWorkerQueue(artifactRoot, options.judgeCaller);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for public API / dashboard access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = parsed.pathname;

    try {
      // API: Overview stats
      if (req.method === 'GET' && pathname === '/api/overview') {
        const stats = await service.getOverview();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: stats }));
        return;
      }

      // API: List evaluated websites
      if (req.method === 'GET' && pathname === '/api/evaluations') {
        const list = await service.listEvaluatedWebsites();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: list }));
        return;
      }

      // API: List agents
      if (req.method === 'GET' && pathname === '/api/agents') {
        try {
          const repo = service.getControlPlaneReadRepository();
          if (!repo) throw new Error('Control plane read repository not configured');
          
          const ownerId = process.env.WEBLENS_TENANT_ID || '11111111-1111-1111-1111-111111111111';
          const [data, overview] = await Promise.all([
            repo.listAgentRuns(ownerId, 50),
            repo.getControlPlaneOverview(ownerId),
          ]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data, overview }));
        } catch (error) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ unavailable: true, code: 'control_plane_unavailable', error: error instanceof Error ? error.message : 'Unavailable' }));
        }
        return;
      }

      // API: Get agent run detail
      if (req.method === 'GET' && pathname.startsWith('/api/agents/') && pathname.split('/').length === 4) {
        try {
          const repo = service.getControlPlaneReadRepository();
          if (!repo) throw new Error('Control plane read repository not configured');
          
          const ownerId = process.env.WEBLENS_TENANT_ID || '11111111-1111-1111-1111-111111111111';
          const runId = pathname.split('/')[3];
          if (!runId) throw new Error('Invalid runId');

          const detail = await repo.getAgentRunDetail(ownerId, runId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: detail }));
        } catch (error) {
          const code = error instanceof Error && error.message.includes('not found') ? 404 : 503;
          res.writeHead(code, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ unavailable: true, code: 'control_plane_unavailable', error: error instanceof Error ? error.message : 'Unavailable' }));
        }
        return;
      }

      // API: List logs
      if (req.method === 'GET' && pathname === '/api/logs') {
        try {
          const repo = service.getControlPlaneReadRepository();
          if (!repo) throw new Error('Control plane read repository not configured');
          
          const ownerId = process.env.WEBLENS_TENANT_ID || '11111111-1111-1111-1111-111111111111';
          const cursor = parsed.searchParams.get('cursor');
          const runId = parsed.searchParams.get('runId');
          const options: any = {};
          if (cursor) options.cursor = cursor;
          if (runId) options.runId = runId;
          
          const result = await repo.listDomainEventsStream(ownerId, options);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: result.events, nextCursor: result.nextCursor }));
        } catch (error) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ unavailable: true, code: 'control_plane_unavailable', error: error instanceof Error ? error.message : 'Unavailable' }));
        }
        return;
      }

      // API: Get evaluation run detail
      if (req.method === 'GET' && pathname.startsWith('/api/runs/') && pathname.endsWith('/run.json')) {
        const parts = pathname.split('/');
        const runId = parts[3];
        if (!runId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing runId' }));
          return;
        }
        const run = await service.getRunDetail(runId);
        if (!run) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Run not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(run));
        return;
      }

      // API: Get report HTML
      if (req.method === 'GET' && pathname.startsWith('/api/runs/') && pathname.endsWith('/report.html')) {
        const parts = pathname.split('/');
        const runId = parts[3];
        if (!runId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing runId');
          return;
        }
        const html = await service.getRunReportHtml(runId);
        if (!html) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Report HTML not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // API: Check job status
      if (req.method === 'GET' && pathname.startsWith('/api/jobs/')) {
        const jobId = pathname.replace('/api/jobs/', '');
        const job = queue.getJob(jobId);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Job not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: job }));
        return;
      }

      // API: List async evaluation jobs
      if (req.method === 'GET' && pathname === '/api/jobs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: queue.listJobs() }));
        return;
      }

      // API: Submit website evaluation
      if (req.method === 'POST' && pathname === '/api/evaluate') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const targetUrl = data.url;
            const recipeId = data.recipeId === 'critic-standard' ? 'critic-standard' : 'lead-fast';
            if (!targetUrl || typeof targetUrl !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Valid URL is required' }));
              return;
            }

            const job = queue.enqueue(targetUrl, recipeId);
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              jobId: job.id,
              state: job.state,
              statusUrl: `/api/jobs/${job.id}`,
            }));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Evaluation dispatch failed' }));
          }
        });
        return;
      }

      // Serve Single-Page App UI
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html' || !pathname.startsWith('/api/'))) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderDashboardHtml());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (error: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
    }
  });

  return {
    server,
    listen: () => new Promise<void>(resolve => server.listen(port, host, resolve)),
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-950 text-slate-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebLens Operator Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 500: '#3b82f6', 600: '#2563eb' }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    body { font-family: 'Inter', sans-serif; }
    code, pre { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="h-full flex overflow-hidden">
  <!-- Sidebar -->
  <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
    <div class="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
      <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">W</div>
      <span class="font-bold tracking-tight text-lg">WebLens</span>
      <span class="text-[10px] uppercase font-semibold bg-blue-950 text-blue-400 border border-blue-800 px-1.5 py-0.5 rounded">Ops</span>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1">
      <button onclick="switchTab('overview')" id="nav-overview" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 text-blue-400">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        Overview
      </button>
      <button onclick="switchTab('submit')" id="nav-submit" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        Submit Website
      </button>
      <button onclick="switchTab('evaluations')" id="nav-evaluations" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        Evaluated Websites
      </button>
      <button onclick="switchTab('agents')" id="nav-agents" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        Agent Monitor
      </button>
      <button onclick="switchTab('logs')" id="nav-logs" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
        Super Detail Logs
      </button>
    </nav>

    <div class="p-4 border-t border-slate-800">
      <div class="text-xs text-slate-500 font-mono">Branch: codex/weblens-mvp</div>
      <div class="text-xs text-slate-500 font-mono">Status: Public Operator Mode</div>
    </div>
  </aside>

  <!-- Main Container -->
  <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
    <!-- Navbar -->
    <header class="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8 shrink-0">
      <div class="flex items-center gap-4">
        <h1 id="page-title" class="font-semibold text-lg text-slate-100">Overview Dashboard</h1>
      </div>
      <div class="flex items-center gap-4">
        <button onclick="refreshData()" class="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 border border-slate-700">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <!-- Content Tabs -->
    <main class="flex-1 overflow-y-auto p-8">
      <!-- Tab 1: Overview -->
      <div id="tab-overview" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div class="text-slate-400 text-sm font-medium">Total Evaluated</div>
            <div id="stat-total" class="text-3xl font-bold mt-2 text-white">0</div>
          </div>
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div class="text-slate-400 text-sm font-medium">Active Agents</div>
            <div id="stat-active-agents" class="text-3xl font-bold mt-2 text-emerald-400">1 Online</div>
          </div>
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div class="text-slate-400 text-sm font-medium">Completed Runs</div>
            <div id="stat-completed" class="text-3xl font-bold mt-2 text-blue-400">0</div>
          </div>
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div class="text-slate-400 text-sm font-medium">Average Score</div>
            <div id="stat-avg-score" class="text-3xl font-bold mt-2 text-amber-400">--</div>
          </div>
        </div>

        <!-- Recent Runs Section -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">Recent Evaluations</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-800/60 text-slate-400 uppercase text-xs">
                <tr>
                  <th class="py-3 px-4 rounded-l-lg">Target Website</th>
                  <th class="py-3 px-4">Recipe</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Verdict</th>
                  <th class="py-3 px-4">Score</th>
                  <th class="py-3 px-4">Evaluated At</th>
                  <th class="py-3 px-4 rounded-r-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="recent-runs-table" class="divide-y divide-slate-800 text-slate-300">
                <tr><td colspan="7" class="py-6 text-center text-slate-500">No evaluations found. Submit one to get started!</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tab 2: Submit Website -->
      <div id="tab-submit" class="hidden max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-sm">
        <h2 class="text-xl font-semibold mb-2">Evaluate New Website</h2>
        <p class="text-sm text-slate-400 mb-6">Dispatch an autonomous evaluation agent to assess UI quality, accessibility, visual design, and UX.</p>
        
        <form id="submit-form" onsubmit="handleFormSubmit(event)" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Website Target URL</label>
            <input type="url" id="input-url" required placeholder="https://example.com" class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Recipe Mode</label>
            <select id="input-recipe" class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="lead-fast">lead-fast (Fast single-page scan, no Lighthouse)</option>
              <option value="critic-standard">critic-standard (Deep audit, multi-page, Lighthouse required)</option>
            </select>
          </div>

          <div class="pt-2">
            <button type="submit" id="btn-submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 font-medium text-sm text-white rounded-lg transition-colors flex items-center gap-2">
              <span>Start Evaluation</span>
            </button>
          </div>
          <div id="submit-status" class="hidden text-sm mt-3"></div>
        </form>
      </div>

      <!-- Tab 3: Evaluated Websites List -->
      <div id="tab-evaluations" class="hidden space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">All Evaluated Websites</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-800/60 text-slate-400 uppercase text-xs">
                <tr>
                  <th class="py-3 px-4 rounded-l-lg">Target Website</th>
                  <th class="py-3 px-4">Run ID</th>
                  <th class="py-3 px-4">Recipe</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Verdict</th>
                  <th class="py-3 px-4">Score</th>
                  <th class="py-3 px-4">Findings</th>
                  <th class="py-3 px-4 rounded-r-lg text-right">Reports</th>
                </tr>
              </thead>
              <tbody id="all-evaluations-table" class="divide-y divide-slate-800 text-slate-300">
                <tr><td colspan="8" class="py-6 text-center text-slate-500">Loading evaluations...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tab 4: Agent Monitor -->
      <div id="tab-agents" class="hidden space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
              <h3 class="font-semibold text-slate-200">Local Capture Worker</h3>
            </div>
            <p class="text-sm text-slate-400 mt-2">Playwright browser automation engine and audit pipeline worker.</p>
            <div class="mt-4 pt-4 border-t border-slate-800 flex justify-between text-xs text-slate-400">
              <span>State: <strong class="text-emerald-400">READY</strong></span>
              <span>Concurrency: 1</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 5: Super Detail Logs -->
      <div id="tab-logs" class="hidden space-y-4">
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 class="text-lg font-semibold text-slate-100 mb-2">Super Detail Event Stream</h2>
          <p class="text-xs text-slate-400 mb-4">Live chronological telemetry, capture events, and audit logs.</p>
          <div id="log-terminal" class="bg-black rounded-lg p-4 font-mono text-xs text-slate-300 h-96 overflow-y-auto space-y-1">
            <div class="text-slate-600">[system] Operator Dashboard started. Listening for evaluations...</div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    let currentTab = 'overview';

    function logMessage(msg) {
      const term = document.getElementById('log-terminal');
      if (!term) return;
      const d = new Date().toISOString().substring(11, 19);
      const line = document.createElement('div');
      line.textContent = '[' + d + '] ' + msg;
      term.appendChild(line);
      term.scrollTop = term.scrollHeight;
    }

    function switchTab(tabId) {
      currentTab = tabId;
      const tabs = ['overview', 'submit', 'evaluations', 'agents', 'logs'];
      tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        const nav = document.getElementById('nav-' + t);
        if (t === tabId) {
          el?.classList.remove('hidden');
          nav?.classList.add('bg-slate-800', 'text-blue-400');
          nav?.classList.remove('text-slate-400');
        } else {
          el?.classList.add('hidden');
          nav?.classList.remove('bg-slate-800', 'text-blue-400');
          nav?.classList.add('text-slate-400');
        }
      });

      const titleMap = {
        overview: 'Overview Dashboard',
        submit: 'Submit Website',
        evaluations: 'Evaluated Websites',
        agents: 'Agent Observability Monitor',
        logs: 'Super Detail Logs'
      };
      document.getElementById('page-title').textContent = titleMap[tabId] || 'Dashboard';
      logMessage('Navigated to ' + tabId);
    }

    async function refreshData() {
      logMessage('Fetching evaluation runs from server...');
      try {
        const res = await fetch('/api/evaluations');
        const json = await res.json();
        const runs = json.data || [];
        logMessage('Loaded ' + runs.length + ' evaluation records.');

        document.getElementById('stat-total').textContent = runs.length;
        document.getElementById('stat-completed').textContent = runs.filter(r => r.executionStatus === 'completed').length;

        const scoredRuns = runs.filter(r => r.score !== null);
        if (scoredRuns.length > 0) {
          const avg = (scoredRuns.reduce((acc, r) => acc + r.score, 0) / scoredRuns.length).toFixed(1);
          document.getElementById('stat-avg-score').textContent = avg + '/100';
        }

        renderTables(runs);
      } catch (err) {
        logMessage('Error fetching runs: ' + err.message);
      }
    }

    function renderTables(runs) {
      const recentTbody = document.getElementById('recent-runs-table');
      const allTbody = document.getElementById('all-evaluations-table');

      if (runs.length === 0) {
        recentTbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">No evaluations found.</td></tr>';
        allTbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-slate-500">No evaluations found.</td></tr>';
        return;
      }

      const rowsHtml = runs.map(r => {
        const scoreBadge = r.score !== null 
          ? '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-950 text-blue-400 border border-blue-800">' + r.score + '</span>'
          : '<span class="text-slate-500">--</span>';
        const verdictBadge = r.verdict
          ? '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">' + r.verdict + '</span>'
          : '<span class="text-slate-500">--</span>';

        return '<tr>' +
          '<td class="py-3 px-4 font-medium text-slate-200">' + escapeHtml(r.url) + '</td>' +
          '<td class="py-3 px-4 text-xs font-mono text-slate-400">' + escapeHtml(r.recipeId) + '</td>' +
          '<td class="py-3 px-4 text-xs">' + escapeHtml(r.executionStatus) + '</td>' +
          '<td class="py-3 px-4">' + verdictBadge + '</td>' +
          '<td class="py-3 px-4">' + scoreBadge + '</td>' +
          '<td class="py-3 px-4 text-xs text-slate-400">' + new Date(r.timestamp).toLocaleString() + '</td>' +
          '<td class="py-3 px-4 text-right space-x-2">' +
            '<a href="' + r.reportUrl + '" target="_blank" class="text-xs text-blue-400 hover:underline">HTML Report</a>' +
            '<a href="' + r.runJsonUrl + '" target="_blank" class="text-xs text-slate-400 hover:underline">Raw JSON</a>' +
          '</td>' +
        '</tr>';
      }).join('');

      recentTbody.innerHTML = rowsHtml;
      allTbody.innerHTML = rowsHtml;
    }

    async function handleFormSubmit(e) {
      e.preventDefault();
      const url = document.getElementById('input-url').value;
      const recipeId = document.getElementById('input-recipe').value;
      const btn = document.getElementById('btn-submit');
      const status = document.getElementById('submit-status');

      btn.disabled = true;
      btn.innerHTML = 'Running agent...';
      status.classList.remove('hidden', 'text-red-400', 'text-emerald-400');
      status.classList.add('text-blue-400');
      status.textContent = 'Agent dispatched. Capturing and evaluating website...';
      logMessage('Dispatched agent to evaluate ' + url + ' with ' + recipeId);

      try {
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, recipeId })
        });
        const data = await res.json();
        if (data.success) {
          status.className = 'text-sm mt-3 text-emerald-400';
          status.textContent = 'Evaluation complete! Run ID: ' + data.runId;
          logMessage('Evaluation finished successfully: ' + data.runId);
          await refreshData();
          setTimeout(() => switchTab('evaluations'), 1000);
        } else {
          throw new Error(data.error || 'Evaluation failed');
        }
      } catch (err) {
        status.className = 'text-sm mt-3 text-red-400';
        status.textContent = 'Error: ' + err.message;
        logMessage('Evaluation error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Start Evaluation</span>';
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // Auto-load runs on boot
    refreshData();
  </script>
</body>
</html>`;
}
