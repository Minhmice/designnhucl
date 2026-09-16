# Agent Monitor and Detailed Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm Agent Monitor và Logs chạy bằng dữ liệu thật, hiển thị chi tiết đủ để truy vết từng agent run, step, lease, heartbeat, event, lỗi và correlation ID.

**Architecture:** Dashboard API đọc control-plane qua tenant-scoped repository. Agent Monitor dùng aggregate từ `agent_runs` + `run_steps`; Logs dùng `EventStore.listSince` với cursor tăng dần, filter server-side, payload bounded. Khi PostgreSQL chưa cấu hình, UI hiện trạng thái unavailable, không dựng agent giả.

**Tech Stack:** Node.js 24+, TypeScript strict, Next.js 16, React 19, Tailwind CSS, Lucide React, PostgreSQL, existing `AgentRunStore`, `EventStore`, `node:test`.

## Global Constraints

- Giữ branch hiện tại; không tạo, checkout hoặc merge branch khác.
- Mọi query bắt buộc owner-scoped và chạy qua tenant transaction.
- Không trả raw prompt, credential, provider secret hoặc payload vượt giới hạn.
- Không dùng fallback agent giả trong production UI.
- Logs phải append-only, cursor-based, sequence tăng dần; không dùng timestamp làm cursor.
- Payload log phải sanitize và bounded trước khi trả API.
- Operator action chỉ được phép theo transition hợp lệ và lease/state hiện tại.
- Chi tiết log phải có timestamp, sequence, event type, aggregate, run ID, step sequence, actor, trace/correlation/causation ID, state transition, lease data, input/output/error projection đã redact.

## Current gaps

- `dashboard/app/agents/page.tsx` gọi `/api/agents` nhưng chưa có Next API route; còn fallback agent giả.
- `dashboard/app/logs/page.tsx` gọi `/api/logs` nhưng chưa có Next API route; chưa có cursor/filter/detail.
- `src/dashboard/control-plane-read.ts` có query đọc agent/events nhưng chưa có cursor, steps chi tiết, filter hoặc bounded payload.
- `src/control-plane/agents.ts` và `src/control-plane/events.ts` đã có state machine, lease và event sequence; cần expose read/action boundary.

## File map

- Modify `src/dashboard/control-plane-read.ts`: typed agent snapshot, step projection, cursor event query, aggregation, payload redaction.
- Create `src/dashboard/control-plane-actions.ts`: cancel/requeue/mark-failed transition wrapper with tenant and lease checks.
- Create `dashboard/app/api/agents/route.ts`: real agent list and overview endpoint.
- Create `dashboard/app/api/logs/route.ts`: cursor/filter event feed endpoint.
- Create `dashboard/app/api/agents/[runId]/actions/route.ts`: safe operator transition endpoint.
- Modify `dashboard/app/agents/page.tsx`: real states, lease countdown, steps, stale/error panels, unavailable state.
- Modify `dashboard/app/logs/page.tsx`: filters, cursor polling, expandable full bounded detail, export-safe display.
- Modify `dashboard/lib/types.ts`: detail DTOs and API response types.
- Create `tests/dashboard-agent-read.test.ts`, `tests/dashboard-log-read.test.ts`, `tests/dashboard-agent-actions.test.ts`.

## Detailed log contract

```ts
export interface AgentStepDetail {
  id: string;
  runId: string;
  sequence: number;
  attempt: number;
  state: string;
  checkpoint: unknown | null;
  inputProjection: unknown | null;
  outputProjection: unknown | null;
  errorProvenance: unknown | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface AgentRunDetail {
  id: string;
  state: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AgentStepDetail[];
  lastEventSequence: string | null;
}

export interface DetailedLogEvent {
  id: string;
  sequence: string;
  occurredAt: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actor: string | null;
  traceId: string | null;
  causationId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}
```

## Task 1: Read model for real agent snapshots

**Files:** Modify `src/dashboard/control-plane-read.ts`; create `tests/dashboard-agent-read.test.ts`.

- [x] Test running, queued, stale, failed, and terminal agent states.
- [x] Test step count, latest step state, lease expiry, step duration, and error projection mapping.
- [x] Validate `limit` bounds and UUID owner/run IDs.
- [x] Query `agent_runs` and `run_steps` under owner predicate, ordered by `updated_at DESC`.
- [x] Add `getAgentRunDetail(ownerId, runId)` returning bounded steps ordered by sequence.
- [x] Return unavailable/error separately from empty data.
- [x] Run `npm run build && node --test dist/tests/dashboard-agent-read.test.js`.

## Task 2: Cursor-based detailed event stream

**Files:** Modify `src/dashboard/control-plane-read.ts`; create `tests/dashboard-log-read.test.ts`.

- [x] Test cursor `0`, large bigint cursor, invalid cursor, max limit 1000, and stable ascending sequence.
- [x] Test filters: `eventType`, `aggregateType`, `aggregateId`, `runId`, `traceId`, `correlationId`, `from`, `to`.
- [x] Query `domain_events` with `sequence > cursor`, owner predicate, filter parameters, ascending order, bounded limit.
- [x] Sanitize payload recursively: preserve JSON primitives/objects, cap serialized bytes, redact keys matching `secret|token|password|apiKey|authorization|cookie|prompt`.
- [x] Return `nextCursor` equal to last returned sequence; return same cursor when empty.
- [x] Run focused test command and verify no raw secret survives.

## Task 3: Next API routes

**Files:** Create `dashboard/app/api/agents/route.ts`, `dashboard/app/api/logs/route.ts`, `dashboard/app/api/agents/[runId]/route.ts`; modify `dashboard/lib/types.ts`.

- [in_progress] Add owner context from server configuration; reject missing owner with `503 control_plane_unavailable`, never guess a tenant for DB queries.
- [ ] `/api/agents`: return `{ data, overview, unavailable }` with real snapshots.
- [ ] `/api/agents/:runId`: return detailed run and bounded steps.
- [ ] `/api/logs?cursor=&limit=&eventType=&aggregateType=&runId=&traceId=&correlationId=` returns `{ data, nextCursor, unavailable }`.
- [ ] Return `{ error, code }` for invalid query or DB error; do not leak SQL text.
- [ ] Add tests for 200, 400, 503, and bounded payload response.

## Task 4: Safe operator actions

**Files:** Create `src/dashboard/control-plane-actions.ts`, `dashboard/app/api/agents/[runId]/actions/route.ts`, `tests/dashboard-agent-actions.test.ts`.

- [ ] Accept only `cancel`, `requeue`, `mark_failed`.
- [ ] Map actions to existing transitions: `cancelled`, `queued` from `stale|blocked`, `failed` from `stale` only.
- [ ] Require expected current state; require lease owner for worker-owned transitions; reject expired/mismatched lease.
- [ ] Append actor and reason in event payload; never permit arbitrary SQL or arbitrary target state.
- [ ] Return updated bounded agent snapshot.
- [ ] Test unauthorized transition, invalid state, lease mismatch, valid stale requeue, valid cancel.

## Task 5: Agent Monitor UI

**Files:** Modify `dashboard/app/agents/page.tsx`, `dashboard/lib/types.ts`.

- [ ] Remove fallback fake `local-playwright-worker`.
- [ ] Poll `/api/agents` every 3 seconds with AbortController cleanup.
- [ ] Display queue depth, active, stale, failed, blocked, and unavailable DB state.
- [ ] Display per-run state badge, run ID, lease owner, lease expiry countdown, heartbeat age, step count, latest step, duration, error summary.
- [ ] Expand a run to show every step and projection/error metadata with redact-safe JSON viewer.
- [ ] Add buttons for allowed actions only; show confirmation and server response.
- [ ] Preserve accessible table semantics, keyboard focus, and visible empty/loading/error states.
- [ ] Verify no static “1 Online” remains.

## Task 6: Super Detail Logs UI

**Files:** Modify `dashboard/app/logs/page.tsx`; create `dashboard/components/log-detail.tsx`.

- [ ] Poll cursor feed every 2 seconds, append only events newer than current cursor, deduplicate by event ID.
- [ ] Add filters for event type, aggregate type, run ID, trace ID, correlation ID, and time range.
- [ ] Display each event with ISO timestamp, sequence, event type, aggregate/run ID, actor, trace/correlation/causation IDs, state transition, lease owner/expiry, step sequence/attempt, checkpoint/output/error projection.
- [ ] Expand/collapse JSON detail; syntax-safe escaped rendering; show `[redacted]` markers.
- [ ] Add pause/resume stream, clear visible feed, load older/newer cursor behavior, and event count.
- [ ] Show connection state: connected, polling, unavailable, invalid response, retrying.
- [ ] Do not fabricate “connected” when DB unavailable.

## Task 7: Verification

**Files:** Modify README only if needed; no plan file edits.

- [ ] Run `npm run build`.
- [ ] Run `npm run dashboard:build`.
- [ ] Run `node --test dist/tests/dashboard*.test.js`.
- [ ] Run `npm test` and record failures.
- [ ] Start `npm run dev`; verify `/agents`, `/logs`, `/api/agents`, `/api/logs`.
- [ ] Verify PostgreSQL-configured path if `WEBLENS_PG_TEST_URL` exists; otherwise verify explicit unavailable state.
- [ ] Confirm detailed logs contain event sequence and no secrets.
- [ ] Confirm current branch unchanged; no branch creation or checkout.

## Acceptance criteria

- Agent Monitor reads real agent/run/step data or clearly shows control-plane unavailable.
- Logs stream reads real append-only events by sequence cursor.
- Logs expose detailed trace data, state transitions, lease data, steps, bounded projections, and sanitized errors.
- No static fake agent, fake event, raw secret, unbounded payload, or SQL error leaks.
- Operator actions enforce existing state machine and lease rules.
- Submit Website job status remains compatible.
- All builds and focused tests pass.
