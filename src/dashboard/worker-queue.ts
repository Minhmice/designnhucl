import { randomUUID } from 'node:crypto';
import { evaluate } from '../runner.js';
import type { RunInput } from '../contracts.js';
import type { JudgeCaller } from '../judges.js';

export interface EvaluationJob {
  id: string;
  url: string;
  recipeId: 'lead-fast' | 'critic-standard';
  state: 'queued' | 'running' | 'completed' | 'failed';
  runId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export class EvaluationWorkerQueue {
  private readonly jobs = new Map<string, EvaluationJob>();

  constructor(
    private readonly artifactRoot: string,
    private readonly judgeCaller?: JudgeCaller
  ) {}

  enqueue(url: string, recipeId: 'lead-fast' | 'critic-standard'): EvaluationJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: EvaluationJob = {
      id,
      url,
      recipeId,
      state: 'queued',
      runId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);

    // Process asynchronously without blocking HTTP caller
    setImmediate(() => {
      this.processJob(job).catch(err => {
        job.state = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.updatedAt = new Date().toISOString();
      });
    });

    return job;
  }

  getJob(id: string): EvaluationJob | null {
    return this.jobs.get(id) ?? null;
  }

  listJobs(): EvaluationJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private async processJob(job: EvaluationJob): Promise<void> {
    job.state = 'running';
    job.updatedAt = new Date().toISOString();

    const runInput: RunInput = {
      url: job.url,
      recipeId: job.recipeId,
      networkPolicy: {
        mode: 'public',
        allowedPrivateOrigins: [],
        enforcementProfile: 'public-egress',
      },
      artifactRoot: this.artifactRoot,
      baselineRunId: null,
      business: null,
      allowCloudVision: false,
      budgetUsd: null,
      context: {
        objective: null,
        audience: null,
        locale: 'en',
        archetypeHint: null,
        primaryAction: null,
        routes: [],
        requirements: [],
        referenceIds: [],
        qualityReview: null,
      },
    };

    const defaultCaller: JudgeCaller = async ({ kind }) => ({
      id: `${kind}-mock`,
      kind,
      status: 'complete',
      model: 'local-evaluator',
      promptVersion: 'p1',
      rubricVersion: 'r1',
      classification: null,
      ratings: [],
      findings: [],
      limitations: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    try {
      const run = await evaluate(runInput, { caller: this.judgeCaller ?? defaultCaller });
      job.runId = run.runId;
      job.state = run.executionStatus === 'completed' ? 'completed' : 'failed';
      job.updatedAt = new Date().toISOString();
    } catch (error) {
      job.state = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = new Date().toISOString();
    }
  }
}
