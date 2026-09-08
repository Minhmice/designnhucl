import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

import { RunInputSchema, type EvaluationRun, type RunInput } from './contracts.js';
import { PROMPT_VERSION, RUBRIC_VERSION } from './prompts.js';
import { recipes } from './recipes.js';

type BatchRecord = {
  inputHash: string;
  runId: string;
  executionStatus: EvaluationRun['executionStatus'];
  assessmentStatus: EvaluationRun['assessmentStatus'];
  reservedUsd?: number | undefined;
  actualUsd?: number | undefined;
  actualCostKnown?: boolean | undefined;
};

const BatchRecordSchema = z.object({
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  runId: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  executionStatus: z.enum(['not_started', 'running', 'completed', 'failed']),
  assessmentStatus: z.enum(['complete', 'partial', 'unscorable']).nullable(),
  reservedUsd: z.number().nonnegative().optional(),
  actualUsd: z.number().nonnegative().optional(),
  actualCostKnown: z.boolean().optional(),
}).strict();

export type BatchSummary = { total: number; completed: number; failed: number; skipped: number };

export type BatchRequest = {
  manifestPath: string;
  statePath: string;
  maxItems: number;
  compatibilityKey: string;
  aggregateBudgetUsd?: number;
  estimatedItemCostUsd?: number;
  evaluate: (input: RunInput) => Promise<EvaluationRun>;
};

function hash(input: RunInput, compatibilityKey: string): string {
  return createHash('sha256').update(JSON.stringify({ input, compatibilityKey, recipeVersion: recipes[input.recipeId].version, promptVersion: PROMPT_VERSION, rubricVersion: RUBRIC_VERSION, engineVersion: 2 })).digest('hex');
}

async function readRecords(path: string): Promise<BatchRecord[]> {
  try {
    return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => BatchRecordSchema.parse(JSON.parse(line)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeRecords(path: string, records: BatchRecord[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, records.map((record) => JSON.stringify(record)).join('\n') + '\n', { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, path);
}

export async function runJsonlBatch(request: BatchRequest): Promise<BatchSummary> {
  if (!Number.isInteger(request.maxItems) || request.maxItems < 1) throw new Error('Batch maxItems must be a positive integer.');
  const lines = (await readFile(request.manifestPath, 'utf8')).split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > request.maxItems) throw new Error(`Batch contains ${lines.length} items and exceeds the ${request.maxItems} item cap.`);
  const inputs = lines.map((line) => RunInputSchema.parse(JSON.parse(line)));
  const records = await readRecords(request.statePath);
  const accountedCost = (record: BatchRecord): number => record.actualCostKnown ? (record.actualUsd ?? 0) : (record.reservedUsd ?? record.actualUsd ?? 0);
  const completedHashes = new Set(records.filter(({ executionStatus, assessmentStatus }) => executionStatus === 'completed' && assessmentStatus === 'complete').map(({ inputHash }) => inputHash));
  const pending = inputs.filter((input) => !completedHashes.has(hash(input, request.compatibilityKey)));
  if (request.aggregateBudgetUsd !== undefined || request.estimatedItemCostUsd !== undefined) {
    if (!Number.isFinite(request.aggregateBudgetUsd) || request.aggregateBudgetUsd! <= 0) throw new Error('Aggregate budget must be a positive amount.');
    if (!Number.isFinite(request.estimatedItemCostUsd) || request.estimatedItemCostUsd! <= 0) throw new Error('Estimated item cost must be positive.');
    if (records.some((record) => record.reservedUsd === undefined && record.actualUsd === undefined)) throw new Error('Historical batch record has unknown cost; use a new state journal for an aggregate-budget run.');
    const historical = records.reduce((sum, record) => sum + accountedCost(record), 0);
    const reservation = pending.filter(({ allowCloudVision }) => allowCloudVision).length * request.estimatedItemCostUsd!;
    if (historical + reservation > request.aggregateBudgetUsd! + Number.EPSILON) throw new Error(`Pending estimates exceed the remaining aggregate budget after ${historical.toFixed(4)} of prior cost.`);
  }
  const summary: BatchSummary = { total: inputs.length, completed: 0, failed: 0, skipped: 0 };

  for (const input of inputs) {
    const inputHash = hash(input, request.compatibilityKey);
    if (completedHashes.has(inputHash)) {
      summary.skipped += 1;
      continue;
    }
    if (request.aggregateBudgetUsd !== undefined && request.estimatedItemCostUsd !== undefined && input.allowCloudVision) {
      const accounted = records.reduce((sum, record) => sum + accountedCost(record), 0);
      if (accounted + request.estimatedItemCostUsd > request.aggregateBudgetUsd + Number.EPSILON) throw new Error('The next item estimate exceeds the remaining aggregate budget.');
    }
    const run = await request.evaluate(input);
    records.push({ inputHash, runId: run.runId, executionStatus: run.executionStatus, assessmentStatus: run.assessmentStatus, ...(run.costLedger ? { reservedUsd: run.costLedger.reservedUsd, actualUsd: run.costLedger.actualUsd, actualCostKnown: run.costLedger.records.length > 0 && run.costLedger.records.every(({ actualUsd }) => actualUsd !== null) } : {}) });
    await writeRecords(request.statePath, records);
    if (request.aggregateBudgetUsd !== undefined) {
      const cumulative = records.reduce((sum, record) => sum + accountedCost(record), 0);
      if (cumulative > request.aggregateBudgetUsd + Number.EPSILON) throw new Error('Accounted batch cost exceeded the aggregate budget.');
    }
    if (run.executionStatus === 'completed' && run.assessmentStatus === 'complete') {
      summary.completed += 1;
      completedHashes.add(inputHash);
    } else {
      summary.failed += 1;
    }
  }
  return summary;
}
