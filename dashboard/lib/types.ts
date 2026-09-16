export interface EvaluatedWebsiteItem {
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

export interface AgentRunItem {
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

export interface SystemOverviewStats {
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  averageScore: number | null;
  activeAgentsCount: number;
  queuedAgentsCount: number;
  staleAgentsCount: number;
  totalEventsCount?: number;
}

export interface DomainEventItem {
  id: string;
  sequence: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: unknown;
  occurredAt: string;
  actor?: string;
  traceId?: string;
  correlationId?: string;
}

export interface ApiResponse<T> {
  data: T;
  nextCursor?: string | null;
  error?: string;
}
