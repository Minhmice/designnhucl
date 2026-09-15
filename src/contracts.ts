import { z } from 'zod';

const Id = z.string().min(1);
const Hash = z.string().min(1);
const Score = z.number().int().min(0).max(100);
const Ratio = z.number().min(0).max(1);

export const ViewportSchema = z.object({
  id: Id,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().default(1),
}).strict();

export const NetworkPolicySchema = z.object({
  mode: z.enum(['offline', 'local-only', 'local-public', 'public']),
  allowedPrivateOrigins: z.array(z.string().url()),
  allowedPublicOrigins: z.array(z.string().url()).optional(),
  enforcementProfile: z.string().min(1).nullable(),
}).strict();

export const EvaluationRecipeSchema = z.object({
  id: Id,
  version: Id,
  maxPages: z.number().int().positive(),
  viewports: z.array(ViewportSchema).min(1),
  maxInteractions: z.number().int().nonnegative(),
  navigationTimeoutMs: z.number().int().positive(),
  settleTimeoutMs: z.number().int().nonnegative(),
  runTimeoutMs: z.number().int().positive(),
  maxModelCallsPerPage: z.number().int().nonnegative(),
  maxFullPageHeight: z.number().int().positive(),
  requireLighthouse: z.boolean(),
}).strict();

export const QualityReviewSchema = z.object({
  runId: Id,
  profileHash: Hash,
  subjectContextHash: Hash,
  reviewerId: Id,
  reviewedAt: z.string().datetime(),
  decision: z.enum(['accept', 'request_changes']),
  findingIds: z.array(Id),
}).strict();

const InteractionSelector = z.string().min(1).max(500).regex(/^(?:[#.]?[A-Za-z_][\w-]*|\[[A-Za-z_][\w-]*\])(?:\s+(?:[#.]?[A-Za-z_][\w-]*|\[[A-Za-z_][\w-]*\]))*$/, 'Invalid interaction selector; use a bounded CSS id, class, tag, or attribute selector.');

const RequirementCheckSchema = z.object({
  route: z.string().min(1),
  action: z.object({ kind: z.literal('click'), selector: InteractionSelector }).strict(),
  assertion: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('visible'), selector: InteractionSelector }).strict(),
    z.object({ kind: z.literal('url'), pattern: z.string().min(1).max(500) }).strict(),
  ]),
}).strict().superRefine((value, ctx) => {
  if (value.assertion.kind !== 'url') return;
  try {
    new RegExp(value.assertion.pattern);
  } catch {
    ctx.addIssue({ code: 'custom', path: ['assertion', 'pattern'], message: 'Invalid regular expression.' });
  }
});

export const RequirementSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  description: z.string().min(1),
  required: z.boolean().default(true),
  check: RequirementCheckSchema.optional(),
}).strict();

export const RedactionConfigSchema = z.object({
  selectors: z.array(z.string().min(1).max(500)).max(50).default([]),
  textPatterns: z.array(z.object({
    id: Id,
    source: z.string().min(1).max(200),
    flags: z.string().regex(/^[gimsu]*$/).default('gi'),
    replacement: z.string().min(1).max(200).default('[redacted-custom]'),
  }).strict()).max(50).default([]),
}).strict();

export const EvaluationContextSchema = z.object({
  objective: z.string().min(1).nullable(),
  audience: z.string().min(1).nullable(),
  locale: z.string().min(1).default('en'),
  archetypeHint: z.string().min(1).nullable(),
  primaryAction: z.string().min(1).nullable(),
  routes: z.array(z.string().min(1)).default(['/']),
  requirements: z.array(RequirementSchema).default([]),
  referenceIds: z.array(Id).default([]),
  qualityReview: QualityReviewSchema.nullable().default(null),
}).strict();

export const BusinessSignalSchema = z.object({
  value: Ratio,
  evidenceIds: z.array(Id).min(1),
  observedAt: z.string().datetime(),
  provenance: z.enum(['provided', 'observed', 'verified']),
}).strict();

export const BusinessContextSchema = z.object({
  commercialFit: BusinessSignalSchema.nullable(),
  fixability: BusinessSignalSchema.nullable(),
  activity: BusinessSignalSchema.nullable(),
  inScope: z.boolean().default(true),
}).strict();

export const RunInputSchema = z.object({
  url: z.string().url(),
  recipeId: z.enum(['lead-fast', 'critic-standard']),
  context: EvaluationContextSchema,
  business: BusinessContextSchema.nullable().default(null),
  networkPolicy: NetworkPolicySchema,
  artifactRoot: z.string().min(1),
  baselineRunId: Id.nullable().default(null),
  allowCloudVision: z.boolean().default(false),
  budgetUsd: z.number().positive().nullable().default(null),
  redaction: RedactionConfigSchema.optional(),
}).strict();

export const RequirementCheckResultSchema = z.object({
  requirementId: Id,
  status: z.enum(['passed', 'failed', 'unobserved']),
  evidenceIds: z.array(Id),
  message: z.string().min(1),
}).strict();

export const BoundingBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  coordinateSpace: z.literal('document-css-px'),
}).strict();

export const EvidenceArtifactSchema = z.object({
  id: Id,
  kind: z.enum(['screenshot', 'dom', 'style', 'runtime', 'audit', 'interaction']),
  path: z.string().min(1),
  sha256: Hash,
  pageId: Id,
  viewportId: Id,
  stateId: Id,
  width: z.number().positive().nullable().default(null),
  height: z.number().positive().nullable().default(null),
  truncated: z.boolean().default(false),
}).strict();

export const EvidenceRefSchema = z.object({
  artifactId: Id,
  pageId: Id,
  viewportId: Id,
  stateId: Id,
  selector: z.string().min(1).nullable().default(null),
  regionId: z.string().min(1).nullable().default(null),
  bbox: BoundingBoxSchema.nullable().default(null),
}).strict();

export const EvidenceBundleSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Id,
  targetUrl: z.string().url(),
  captureStartedAt: z.string().datetime(),
  captureCompletedAt: z.string().datetime(),
  assessmentStatus: z.enum(['complete', 'partial', 'unscorable']),
  accessReason: z.string().min(1).nullable().default(null),
  artifacts: z.array(EvidenceArtifactSchema),
  refs: z.array(EvidenceRefSchema),
  requiredEvidence: z.number().int().nonnegative(),
  observedEvidence: z.number().int().nonnegative(),
  environmentLimitations: z.array(z.string()),
  requirementChecks: z.array(RequirementCheckResultSchema).optional(),
}).strict();

export const CriterionRatingSchema = z.object({
  criterionId: Id,
  rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  state: z.enum(['assessed', 'not_applicable', 'unobserved']),
  evidenceIds: z.array(Id),
  applicabilityReason: z.string().min(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.state === 'assessed' && (value.rating === null || value.evidenceIds.length === 0)) ctx.addIssue({ code: 'custom', message: 'Assessed ratings require an anchor and evidence.' });
  if (value.state === 'unobserved' && value.rating !== null) ctx.addIssue({ code: 'custom', message: 'Unobserved ratings must be null.' });
  if (value.state === 'not_applicable' && (value.rating !== null || value.applicabilityReason === null)) ctx.addIssue({ code: 'custom', message: 'Not-applicable ratings require a reason and a null rating.' });
});

export const DimensionScoreSchema = z.object({
  value: Score.nullable(),
  state: z.enum(['assessed', 'partial', 'not_assessed']),
  method: z.enum(['rubric_v1', 'lighthouse_performance', 'audit_only']),
  coverage: z.object({ observed: z.number().int().nonnegative(), applicable: z.number().int().nonnegative() }).strict(),
}).strict();

export const SiteClassificationSchema = z.object({
  archetype: Id,
  designLanguage: Id,
  evidenceConfidence: z.enum(['high', 'medium', 'low']),
  evidenceIds: z.array(Id),
}).strict();

export const FindingSchema = z.object({
  id: Id,
  fingerprint: Hash,
  ruleId: Id,
  category: Id,
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['blocker', 'high', 'medium', 'low', 'observation']),
  epistemicType: z.enum(['objective', 'semi_objective', 'subjective']),
  verification: z.enum(['verified', 'model_only', 'human_confirmed', 'unverified']),
  evidenceIds: z.array(Id).min(1),
  recommendation: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  affectedRoutes: z.array(z.string()),
  affectedViewports: z.array(Id),
}).strict();

export const QualityProfileSchema = z.object({
  schemaVersion: z.literal(1),
  assessmentStatus: z.enum(['complete', 'partial', 'unscorable']),
  classification: SiteClassificationSchema,
  dimensions: z.record(z.string(), DimensionScoreSchema),
  findings: z.array(FindingSchema),
  strengths: z.array(FindingSchema),
  evidenceCoverage: z.object({ observed: z.number().int().nonnegative(), required: z.number().int().nonnegative() }).strict(),
  versions: z.object({ rubric: Id, prompt: Id, model: Id }).strict(),
}).strict();

export const LeadDecisionSchema = z.object({
  verdict: z.enum(['SKIP', 'WATCH', 'PROSPECT', 'HIGH_PRIORITY_PROSPECT']),
  opportunityScore: Score.nullable(),
  signals: z.record(z.string(), z.number()),
  missingSignals: z.array(z.string()),
  reasonCodes: z.array(z.string()),
}).strict();

export const PrioritizedFixSchema = z.object({
  findingId: Id,
  current: z.string().min(1),
  target: z.string().min(1),
  acceptanceChecks: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(Id).min(1),
}).strict();

export const CriticDecisionSchema = z.object({
  verdict: z.enum(['PASS', 'ITERATE', 'REVIEW']),
  failedGates: z.array(z.string()),
  unmetRequirements: z.array(z.string()),
  prioritizedFixes: z.array(PrioritizedFixSchema).max(3),
  coverageGaps: z.array(z.string()),
  scopeStatement: z.string().min(1),
}).strict();

export const AuditResultSchema = z.object({
  id: Id,
  kind: z.enum(['dom', 'accessibility', 'lighthouse', 'runtime', 'interaction']),
  status: z.enum(['complete', 'partial', 'failed']),
  evidenceIds: z.array(Id),
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  findings: z.array(FindingSchema),
  limitations: z.array(z.string()),
}).strict();

export const JudgeResultSchema = z.object({
  id: Id,
  kind: z.enum(['classify', 'visual', 'experience']),
  status: z.enum(['complete', 'refused', 'incomplete', 'failed']),
  model: Id,
  promptVersion: Id,
  rubricVersion: Id,
  classification: SiteClassificationSchema.nullable(),
  ratings: z.array(CriterionRatingSchema),
  findings: z.array(FindingSchema),
  limitations: z.array(z.string()),
  usage: z.object({ inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable() }).strict(),
}).strict();

export const RunErrorSchema = z.object({
  stage: Id,
  code: Id,
  origin: z.enum(['target', 'harness', 'provider', 'environment']),
  retryable: z.boolean(),
  evidenceIds: z.array(Id),
}).strict();

export const CostLedgerSchema = z.object({
  limitUsd: z.number().positive(),
  reservedUsd: z.number().nonnegative(),
  actualUsd: z.number().nonnegative(),
  pricingVersion: Id,
  records: z.array(z.object({
    kind: z.enum(['classify', 'visual', 'experience']),
    reservedUsd: z.number().positive(),
    actualUsd: z.number().nonnegative().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  }).strict()),
}).strict();

export const JudgeAttemptSchema = z.object({
  kind: z.enum(['classify', 'visual', 'experience']),
  attempt: z.number().int().positive(),
  status: z.enum(['complete', 'failed']),
  reason: z.string().min(1).nullable(),
  retryable: z.boolean(),
}).strict();

export const EvaluationRunSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Id,
  executionStatus: z.enum(['not_started', 'running', 'completed', 'failed']),
  assessmentStatus: z.enum(['complete', 'partial', 'unscorable']).nullable(),
  inputHash: Hash,
  recipeId: z.enum(['lead-fast', 'critic-standard']).optional(),
  context: EvaluationContextSchema.optional(),
  business: BusinessContextSchema.nullable().optional(),
  bundle: EvidenceBundleSchema.optional(),
  audits: z.array(AuditResultSchema).optional(),
  judges: z.array(JudgeResultSchema).optional(),
  profileHash: Hash.optional(),
  subjectContextHash: Hash.optional(),
  observedRequirementIds: z.array(Id).optional(),
  failedRequirementIds: z.array(Id).optional(),
  costLedger: CostLedgerSchema.optional(),
  judgeAttempts: z.array(JudgeAttemptSchema).optional(),
  profile: QualityProfileSchema.nullable().default(null),
  leadDecision: LeadDecisionSchema.nullable().default(null),
  criticDecision: CriticDecisionSchema.nullable().default(null),
  errors: z.array(RunErrorSchema),
}).strict().superRefine((value, ctx) => {
  if (value.executionStatus === 'not_started' && value.assessmentStatus !== null) ctx.addIssue({ code: 'custom', message: 'A preflight failure has no website assessment status.' });
  if (value.executionStatus === 'completed' && value.assessmentStatus === null) ctx.addIssue({ code: 'custom', message: 'Completed execution requires an assessment status.' });
});

export type Viewport = z.infer<typeof ViewportSchema>;
export type NetworkPolicy = z.infer<typeof NetworkPolicySchema>;
export type EvaluationRecipe = z.infer<typeof EvaluationRecipeSchema>;
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type RedactionConfig = z.infer<typeof RedactionConfigSchema>;
export type RedactionConfigInput = z.input<typeof RedactionConfigSchema>;
export type RequirementCheckResult = z.infer<typeof RequirementCheckResultSchema>;
export type BusinessContext = z.infer<typeof BusinessContextSchema>;
export type RunInput = z.infer<typeof RunInputSchema>;
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type CriterionRating = z.infer<typeof CriterionRatingSchema>;
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type QualityProfile = z.infer<typeof QualityProfileSchema>;
export type LeadDecision = z.infer<typeof LeadDecisionSchema>;
export type CriticDecision = z.infer<typeof CriticDecisionSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
export type EvaluationRun = z.infer<typeof EvaluationRunSchema>;
export type JudgeAttempt = z.infer<typeof JudgeAttemptSchema>;
