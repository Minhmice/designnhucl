import { evaluateFrozenJudges, type FrozenJudgeInput, type MetaEvaluationReport } from '../../src/evals/index.js';
export type PromptfooCase = Omit<FrozenJudgeInput, 'repeats'> & { repeats?: number };
export async function runWebLensPromptfooCase(input: PromptfooCase): Promise<{ output: MetaEvaluationReport; metadata: { sampleCount: number; mode: string } }> { const output = await evaluateFrozenJudges({ ...input, repeats: input.repeats ?? 1 }); return { output, metadata: { sampleCount: output.provenance.sampleCount, mode: output.provenance.mode } }; }
