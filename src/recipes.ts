import type { EvaluationRecipe } from './contracts.js';

const viewports = [
  { id: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { id: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
] as const;

export const recipes: Record<'lead-fast' | 'critic-standard', EvaluationRecipe> = {
  'lead-fast': { id: 'lead-fast', version: '2', maxPages: 1, viewports: [...viewports], maxInteractions: 0, navigationTimeoutMs: 30_000, settleTimeoutMs: 10_000, runTimeoutMs: 180_000, maxModelCallsPerPage: 4, maxFullPageHeight: 20_000, requireLighthouse: false },
  'critic-standard': { id: 'critic-standard', version: '2', maxPages: 3, viewports: [...viewports], maxInteractions: 5, navigationTimeoutMs: 30_000, settleTimeoutMs: 10_000, runTimeoutMs: 900_000, maxModelCallsPerPage: 4, maxFullPageHeight: 20_000, requireLighthouse: true },
};
