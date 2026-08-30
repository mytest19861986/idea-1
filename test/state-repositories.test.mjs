import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import { SourceStateRepository } from "../src/persistence/source-state-repository.mjs";
import { SchedulingStateRepository } from "../src/persistence/scheduling-state-repository.mjs";
import { WorkerTaskRepository, TaskExecutionState } from "../src/persistence/worker-task-repository.mjs";

// ============================================================================
// 1. SOURCE STATE REPOSITORY TESTS (STATE-I001 - STATE-I010)
// ============================================================================

test("STATE: Optimistic concurrency transitions revision from 1 to 2, and rejects stale revision", () => {
  const repo = new SourceStateRepository();
  repo.saveSource({ id: "src-concurrency", name: "Concurrency Feed", status: SourceStatus.ACTIVE });

  const source = repo.getSource("src-concurrency");
  assert.strictEqual(source.revision, 1);
  assert.strictEqual(source.status, SourceStatus.ACTIVE);

  // Valid transition with expected revision 1 -> 2
  const res = repo.transitionSourceState("src-concurrency", 1, SourceStatus.DEGRADED, {
    reason: "Observed high error rate in window"
  });
  assert.strictEqual(res.source.revision, 2);
  assert.strictEqual(res.source.status, SourceStatus.DEGRADED);

  // Stale transition using old revision 1 -> throws STALE_SOURCE_STATE
  assert.throws(
    () => repo.transitionSourceState("src-concurrency", 1, SourceStatus.ACTIVE, { reason: "Stale recovery" }),
    (err) => err.code === "STALE_SOURCE_STATE"
  );
});

test("STATE: Illegal lifecycle transition is strictly rejected", () => {
  const repo = new SourceStateRepository();
  repo.saveSource({ id: "src-illegal", name: "Illegal Feed", status: SourceStatus.ACTIVE });

  // ACTIVE -> DISCOVERED is invalid in canonical lifecycle
  assert.throws(
    () => repo.transitionSourceState("src-illegal", 1, SourceStatus.DISCOVERED, { reason: "Illegal back-transition" }),
    (err) => err.code === "ILLEGAL_LIFECYCLE_TRANSITION"
  );
});

test("STATE: Lifecycle transitions are appended to immutable audit log", () => {
  const repo = new SourceStateRepository();
  repo.saveSource({ id: "src-audit", status: SourceStatus.ACTIVE });

  repo.transitionSourceState("src-audit", 1, SourceStatus.DEGRADED, { reason: "Rate limited" });
  repo.transitionSourceState("src-audit", 2, SourceStatus.ACTIVE, { reason: "Recovered" });

  const audit = repo.getTransitionAuditLog("src-audit");
  assert.strictEqual(audit.length, 2);
  assert.strictEqual(audit[0].fromStatus, SourceStatus.ACTIVE);
  assert.strictEqual(audit[0].toStatus, SourceStatus.DEGRADED);
  assert.strictEqual(audit[1].fromStatus, SourceStatus.DEGRADED);
  assert.strictEqual(audit[1].toStatus, SourceStatus.ACTIVE);
});

// ============================================================================
// 2. SCHEDULING STATE REPOSITORY TESTS (STATE-I011 - STATE-I017)
// ============================================================================

test("STATE: Scheduling slot multi-factor uniqueness and replay protection", () => {
  const repo = new SchedulingStateRepository();

  const slotBase = {
    slotId: "slot-001",
    sourceId: "src-feed-1",
    taskType: "DISCOVERY_EXECUTION",
    policyVersion: "policy-v1",
    slotFloorAt: "2026-08-30T10:00:00.000Z",
    taskId: "task-001"
  };

  // First record -> created
  const res1 = repo.recordSlot(slotBase);
  assert.strictEqual(res1.created, true);
  assert.strictEqual(res1.replayed, false);

  // Exact same slot replay -> replayed
  const res2 = repo.recordSlot({ ...slotBase, slotId: "slot-001-dup" });
  assert.strictEqual(res2.created, false);
  assert.strictEqual(res2.replayed, true);
  assert.strictEqual(res2.slot.slotId, "slot-001");

  // Different taskType -> creates new slot
  const res3 = repo.recordSlot({
    ...slotBase,
    slotId: "slot-002",
    taskType: "HEALTH_CHECK",
    taskId: "task-002"
  });
  assert.strictEqual(res3.created, true);

  // Different policyVersion -> creates new slot
  const res4 = repo.recordSlot({
    ...slotBase,
    slotId: "slot-003",
    policyVersion: "policy-v2",
    taskId: "task-003"
  });
  assert.strictEqual(res4.created, true);
});

test("STATE: Source scheduling state tracks last dispatch and next eligible timestamps", () => {
  const repo = new SchedulingStateRepository();

  const state = repo.updateSourceSchedulingState("src-1", {
    lastDispatchedSlotId: "slot-101",
    lastDispatchedAt: "2026-08-30T10:00:00.000Z",
    nextEligibleAt: "2026-08-30T11:00:00.000Z"
  });

  assert.strictEqual(state.lastDispatchedSlotId, "slot-101");
  const fetched = repo.getSourceSchedulingState("src-1");
  assert.strictEqual(fetched.nextEligibleAt, "2026-08-30T11:00:00.000Z");
});

// ============================================================================
// 3. WORKER TASK REPOSITORY & LEASE TESTS (STATE-I018 - STATE-I028)
// ============================================================================

test("STATE: Secret leakage in task payload is strictly rejected", () => {
  const repo = new WorkerTaskRepository();

  assert.throws(
    () => repo.createTask({
      taskId: "task-bad",
      taskType: "DISCOVERY_EXECUTION",
      sourceId: "src-1",
      payload: { secretToken: "raw-secret-value-123" }
    }),
    /SECRET_LEAKAGE_PREVENTION/
  );
});

test("STATE: Lease claim, expiration reclaim, and stale token write protection", () => {
  const repo = new WorkerTaskRepository();
  repo.createTask({ taskId: "task-lease-1", taskType: "DISCOVERY_EXECUTION", sourceId: "src-1" });

  const t0 = new Date("2026-08-30T10:00:00.000Z");

  // Worker 1 claims task with 30s lease
  const claim1 = repo.claimTask("worker-1", { leaseDurationMs: 30000, asOfDate: t0 });
  assert.strictEqual(claim1.claimed, true);
  assert.strictEqual(claim1.task.claimRevision, 1);
  assert.strictEqual(claim1.task.leaseOwner, "worker-1");

  // Time advances 40s (lease expires)
  const t1 = new Date("2026-08-30T10:00:40.000Z");

  // Worker 2 reclaims task with new lease
  const claim2 = repo.claimTask("worker-2", { leaseDurationMs: 30000, asOfDate: t1 });
  assert.strictEqual(claim2.claimed, true);
  assert.strictEqual(claim2.isReclaim, true);
  assert.strictEqual(claim2.task.claimRevision, 2);
  assert.strictEqual(claim2.task.leaseOwner, "worker-2");

  // Worker 1 attempts to complete task with old leaseToken -> rejected
  assert.throws(
    () => repo.completeTask("task-lease-1", claim1.leaseToken, { result: { count: 10 } }),
    (err) => err.code === "STALE_LEASE_TOKEN"
  );

  // Worker 2 completes task with valid new leaseToken -> succeeds
  const comp = repo.completeTask("task-lease-1", claim2.leaseToken, { result: { count: 10 } });
  assert.strictEqual(comp.success, true);
  assert.strictEqual(comp.task.state, TaskExecutionState.SUCCEEDED);
});

test("STATE: Immutable attempt ledger distinguishes FINAL_FAILURE and EXHAUSTED", () => {
  const repo = new WorkerTaskRepository();
  repo.createTask({ taskId: "task-err-1", taskType: "DISCOVERY_EXECUTION", sourceId: "src-1", maxAttempts: 2 });

  // Attempt 1 fails with non-retryable 401 error -> produces FINAL_FAILURE
  repo.recordAttempt("task-err-1", {
    attemptNumber: 1,
    workerId: "worker-1",
    status: "FAILURE",
    errorMessage: "401 Unauthorized",
    errorClassification: "FINAL_FAILURE",
    durationMs: 120
  });

  const taskFinal = repo.getTask("task-err-1");
  assert.strictEqual(taskFinal.state, TaskExecutionState.FINAL_FAILURE);

  // Create another task for exhausted retry test
  repo.createTask({ taskId: "task-err-2", taskType: "DISCOVERY_EXECUTION", sourceId: "src-1", maxAttempts: 2 });
  repo.claimTask("worker-1", { asOfDate: new Date() }); // attempt 1
  repo.recordAttempt("task-err-2", {
    attemptNumber: 1,
    workerId: "worker-1",
    status: "FAILURE",
    errorMessage: "503 Service Unavailable",
    errorClassification: "RETRYABLE_FAILURE"
  });

  repo.claimTask("worker-1", { asOfDate: new Date() }); // attempt 2 (maxAttempts reached)
  repo.recordAttempt("task-err-2", {
    attemptNumber: 2,
    workerId: "worker-1",
    status: "FAILURE",
    errorMessage: "503 Service Unavailable",
    errorClassification: "RETRYABLE_FAILURE"
  });

  const taskExhausted = repo.getTask("task-err-2");
  assert.strictEqual(taskExhausted.state, TaskExecutionState.EXHAUSTED);
  assert.strictEqual(repo.getAttemptsForTask("task-err-2").length, 2);
});
