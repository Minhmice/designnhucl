import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadRun } from '../store.js';
import type { EvaluationRun } from '../contracts.js';
import { ControlPlaneReadRepository } from './control-plane-read.js';
import type { SqlExecutor } from '../control-plane/database.js';

let pgPool: any = null;
try {
  const connectionString = process.env.WEBLENS_PG_URL ?? process.env.WEBLENS_PG_TEST_URL;
  if (connectionString) {
    const { Pool } = await import('pg');
    pgPool = new Pool({ connectionString });
  }
} catch {
  // pg might not be installed or connection string not provided
}

export interface EvaluatedWebsiteSummary {
  runId: string;
  url: string;
  recipeId: string;
  executionStatus: string;
  assessmentStatus: string | null;
  score: number | null;
  verdict: string | null;
  findingsCount: number;
  timestamp: string;
  reportUrl: string;
  runJsonUrl: string;
}

export interface AgentRunSummary {
  id: string;
  ownerOrganizationId: string;
  state: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  latestStepState: string | null;
}

export interface SystemOverview {
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  averageScore: number | null;
  activeAgentsCount: number;
  queuedAgentsCount: number;
  staleAgentsCount: number;
}

export class DashboardService {
  constructor(private readonly artifactRoot: string = resolve(process.cwd(), 'runs')) {}

  getControlPlaneReadRepository(): ControlPlaneReadRepository | null {
    return pgPool ? new ControlPlaneReadRepository(pgPool as SqlExecutor) : null;
  }

  async listEvaluatedWebsites(): Promise<EvaluatedWebsiteSummary[]> {
    const root = resolve(this.artifactRoot);
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      return [];
    }

    const summaries: EvaluatedWebsiteSummary[] = [];

    for (const entry of entries) {
      if (!/^[a-zA-Z0-9._-]+$/.test(entry)) continue;
      const runDir = join(root, entry);
      try {
        const info = await stat(runDir);
        if (!info.isDirectory()) continue;
        const run = await loadRun(entry, root);
        
        let score: number | null = null;
        let verdict: string | null = null;

        if (run.leadDecision) {
          verdict = run.leadDecision.verdict;
        } else if (run.criticDecision) {
          verdict = run.criticDecision.verdict;
        }

        if (run.profile?.dimensions) {
          const dimValues = Object.values(run.profile.dimensions)
            .map(d => d.value)
            .filter((v): v is number => typeof v === 'number');
          if (dimValues.length > 0) {
            score = Math.round(dimValues.reduce((a, b) => a + b, 0) / dimValues.length);
          }
        }

        const findingsCount = run.profile?.findings ? run.profile.findings.length : 0;

        summaries.push({
          runId: run.runId,
          url: run.bundle?.targetUrl ?? 'unknown',
          recipeId: run.recipeId ?? 'unknown',
          executionStatus: run.executionStatus,
          assessmentStatus: run.assessmentStatus,
          score,
          verdict,
          findingsCount,
          timestamp: info.mtime.toISOString(),
          reportUrl: `/api/runs/${run.runId}/report.html`,
          runJsonUrl: `/api/runs/${run.runId}/run.json`,
        });
      } catch {
        // Skip incomplete or unreadable run folders
      }
    }

    // Sort by timestamp descending
    summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return summaries;
  }

  async getRunDetail(runId: string): Promise<EvaluationRun | null> {
    try {
      return await loadRun(runId, this.artifactRoot);
    } catch {
      return null;
    }
  }

  async getRunReportHtml(runId: string): Promise<string | null> {
    try {
      const filePath = resolve(this.artifactRoot, runId, 'report.html');
      return await readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  async getRunReportJson(runId: string): Promise<string | null> {
    try {
      const filePath = resolve(this.artifactRoot, runId, 'report.json');
      return await readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  async getOverview(): Promise<SystemOverview> {
    const list = await this.listEvaluatedWebsites();
    const totalEvaluations = list.length;
    const completedEvaluations = list.filter(r => r.executionStatus === 'completed').length;
    const failedEvaluations = list.filter(r => r.executionStatus === 'failed' || r.executionStatus === 'not_started').length;
    const scored = list.filter(r => typeof r.score === 'number');
    const averageScore = scored.length > 0 ? Math.round(scored.reduce((acc, r) => acc + (r.score ?? 0), 0) / scored.length) : null;

    return {
      totalEvaluations,
      completedEvaluations,
      failedEvaluations,
      averageScore,
      activeAgentsCount: 1, // local worker
      queuedAgentsCount: 0,
      staleAgentsCount: 0,
    };
  }
}
