import type { JudgeResult } from '../contracts.js';
import { distribution0To4, summarizeNumbers } from './statistics.js';
import { RUBRIC_CRITERIA } from '../prompts.js';
import type { CriterionConsistency } from './types.js';

export function calculateCriterionConsistency(judges: readonly JudgeResult[]): CriterionConsistency[] {
  const grouped = new Map<string, Array<{ rating: number | null; state: string }>>();
  for (const judge of judges) for (const rating of judge.ratings) grouped.set(rating.criterionId, [...(grouped.get(rating.criterionId) ?? []), rating]);
  for (const criterionId of Object.values(RUBRIC_CRITERIA).flat()) if (!grouped.has(criterionId)) grouped.set(criterionId, []);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([criterionId, samples]) => {
    const numbers = samples.flatMap(({ rating, state }) => state === 'assessed' && rating !== null ? [rating] : []);
    const summary = summarizeNumbers(numbers); const exact = numbers.length ? numbers.filter(v => v === numbers[0]).length / numbers.length : null;
    const within = numbers.length ? numbers.filter(v => Math.abs(v - numbers[0]!) <= 1).length / numbers.length : null;
    return { criterionId, ...summary, exactAgreementRate: exact, withinOneAgreementRate: within, distribution: distribution0To4(numbers), unobservedRate: samples.length ? samples.filter(s => s.state === 'unobserved').length / samples.length : 1, notApplicableRate: samples.length ? samples.filter(s => s.state === 'not_applicable').length / samples.length : 0 };
  });
}

export function calculateDimensionConsistency(profiles: readonly import('../contracts.js').QualityProfile[]): Record<string, ReturnType<typeof summarizeNumbers>> {
  const values = new Map<string, number[]>();
  for (const profile of profiles) for (const [name, score] of Object.entries(profile.dimensions)) if (score.value !== null) values.set(name, [...(values.get(name) ?? []), score.value]);
  return Object.fromEntries([...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, nums]) => [name, summarizeNumbers(nums)]));
}
