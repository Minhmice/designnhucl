import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { EvaluationRunSchema, type EvaluationRun } from './contracts.js';
import { renderReports } from './reports.js';

async function runPath(root: string, runId: string, create = false): Promise<{ path: string; root: string }> {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error('Invalid run ID.');
  const absoluteRoot = resolve(root);
  if (create) await mkdir(absoluteRoot, { recursive: true });
  const canonicalRoot = await realpath(absoluteRoot);
  const lexicalPath = resolve(absoluteRoot, runId);
  if (!lexicalPath.startsWith(`${absoluteRoot}${sep}`)) throw new Error('Run path escapes the artifact root.');
  if (create) await mkdir(lexicalPath, { recursive: true });
  const canonicalPath = await realpath(lexicalPath);
  if (!canonicalPath.startsWith(`${canonicalRoot}${sep}`)) throw new Error('Run path escapes the artifact root through a link.');
  return { path: canonicalPath, root: canonicalRoot };
}

async function atomicWrite(path: string, content: string, canonicalRoot: string): Promise<void> {
  const canonicalDirectory = await realpath(dirname(path));
  if (canonicalDirectory !== canonicalRoot && !canonicalDirectory.startsWith(`${canonicalRoot}${sep}`)) throw new Error('Write path escapes the artifact root.');
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  const checkedDirectory = await realpath(dirname(path));
  if (checkedDirectory !== canonicalDirectory) throw new Error('Write directory changed during atomic write.');
  await rename(temporary, path);
}

export async function saveRun(candidate: EvaluationRun, root: string): Promise<string> {
  const run = EvaluationRunSchema.parse(candidate);
  const { path, root: canonicalRoot } = await runPath(root, run.runId, true);
  const reports = renderReports(run);
  await atomicWrite(resolve(path, 'run.json'), reports.json, canonicalRoot);
  await atomicWrite(resolve(path, 'report.json'), reports.json, canonicalRoot);
  await atomicWrite(resolve(path, 'report.md'), reports.markdown, canonicalRoot);
  await atomicWrite(resolve(path, 'report.html'), reports.html, canonicalRoot);
  return path;
}

export async function loadRun(runId: string, root: string): Promise<EvaluationRun> {
  const { path } = await runPath(root, runId);
  return EvaluationRunSchema.parse(JSON.parse(await readFile(resolve(path, 'run.json'), 'utf8')));
}

export async function saveDecisionRevision(runId: string, decision: unknown, root: string): Promise<string> {
  const { path: runDirectory, root: canonicalRoot } = await runPath(root, runId);
  const directory = resolve(runDirectory, 'decisions');
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${Date.now()}-${randomUUID()}.json`);
  await atomicWrite(path, JSON.stringify(decision, null, 2), canonicalRoot);
  return path;
}
