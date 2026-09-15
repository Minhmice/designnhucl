import type { JudgeResult } from '../contracts.js';
import type { ClassificationStability } from './types.js';

function mode(values: string[]): string | null { if (!values.length) return null; const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1); return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]; }
function agreement(values: string[], selected: string | null): number | null { return values.length && selected ? values.filter(v => v === selected).length / values.length : null; }
function entropy(values: string[]): number | null { if (!values.length) return null; const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1); return [...counts.values()].reduce((sum, count) => { const p = count / values.length; return sum - p * Math.log2(p); }, 0); }

export function calculateClassificationStability(judges: readonly JudgeResult[]): ClassificationStability {
  const classifications = judges.map(j => j.classification).filter((v): v is NonNullable<typeof v> => v !== null);
  const archetypes = classifications.map(c => c.archetype); const languages = classifications.map(c => c.designLanguage);
  return { samples: classifications.length, modalArchetype: mode(archetypes), archetypeAgreement: agreement(archetypes, mode(archetypes)), modalDesignLanguage: mode(languages), designLanguageAgreement: agreement(languages, mode(languages)), confidenceDistribution: { high: classifications.filter(c => c.evidenceConfidence === 'high').length, medium: classifications.filter(c => c.evidenceConfidence === 'medium').length, low: classifications.filter(c => c.evidenceConfidence === 'low').length }, archetypeEntropy: entropy(archetypes), designLanguageEntropy: entropy(languages) };
}
