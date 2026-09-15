import assert from 'node:assert/strict';
import test from 'node:test';
import { runWebLensPromptfooCase } from '../evals/promptfoo/provider.js';
import type { EvidenceBundle, EvaluationContext, JudgeResult } from '../src/contracts.js';
const bundle = { runId: 'r', artifacts: [], observedEvidence: 1, requiredEvidence: 1 } as unknown as EvidenceBundle;
const context = { objective: 'x', audience: 'y', locale: 'en', archetypeHint: null, primaryAction: 'x', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null } as EvaluationContext;
test('Promptfoo adapter delegates to the standalone frozen evaluator', async () => { let calls = 0; const judge = async (): Promise<JudgeResult[]> => { calls++; return []; }; const result = await runWebLensPromptfooCase({ bundle, context, repeats: 3, judge }); assert.equal(calls, 3); assert.equal(result.metadata.mode, 'frozen-judge-consistency'); });
