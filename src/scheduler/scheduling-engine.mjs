import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";
import { TaskType, createWorkerTask } from "../worker/worker-task.mjs";

/**
 * ============================================================================
 * DISCOVERY SCHEDULING ENGINE (PKG-SCHED-015R)
 * Invariants: SCHED-I001 through SCHED-I032
 * Scheduling Policy Version: scheduler-policy-v1
 * ============================================================================
 */

export const SCHEDULING_POLICY_VERSION = "scheduler-policy-v1";

export const SchedulingOutcome = Object.freeze({
  DUE: "DUE",
  NOT_DUE: "NOT_DUE",
  BLOCKED: "BLOCKED",
  NOT_ELIGIBLE: "NOT_ELIGIBLE"
});

export const DispatchOutcome = Object.freeze({
  DISPATCHED: "DISPATCHED",
  REPLAYED: "REPLAYED",
  STALE_SCHEDULE_DECISION: "STALE_SCHEDULE_DECISION",
  BLOCKED_NOT_ELIGIBLE: "BLOCKED_NOT_ELIGIBLE"
});

/**
 * Canonical Source Lifecycle Classification Matrix (Finding 3)
 */
export const SourceSchedulingClassification = Object.freeze({
  DISCOVERED: "NOT_ELIGIBLE",
  CANDIDATE: "NOT_ELIGIBLE",
  EVALUATING: "NOT_ELIGIBLE",
  APPROVED: "NOT_ELIGIBLE",
  ACTIVE: "ELIGIBLE",
  LOW_PRIORITY: "ELIGIBLE",
  DEGRADED: "ELIGIBLE_RESTRICTED",
  PAUSED: "BLOCKED",
  REJECTED: "BLOCKED",
  RETIRED: "BLOCKED"
});

/**
 * Default Scheduling Policy (Finding 1: DEGRADED cadence is slower than ACTIVE)
 */
export const DEFAULT_SCHEDULING_POLICY = Object.freeze({
  policyVersion: SCHEDULING_POLICY_VERSION,
  normalTaskType: TaskType.DISCOVERY_EXECUTION,
  cadences: {
    ACTIVE: 3600000, // 1 hour (normal collection)
    LOW_PRIORITY: 21600000, // 6 hours (slower collection)
    DEGRADED: 7200000 // 2 hours (slower/restricted collection; Finding 1 fix)
  }
});

/**
 * Compute the slot floor timestamp deterministically.
 */
export function computeSlotFloor(timestampMs, intervalMs) {
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new TypeError("intervalMs must be a positive integer");
  }
  return Math.floor(timestampMs / intervalMs) * intervalMs;
}

/**
 * Evaluate if a source is due for scheduling.
 * Pure evaluation function (SCHED-I022).
 */
export function evaluateSchedule(source, state = {}, policy = DEFAULT_SCHEDULING_POLICY, nowIso = new Date().toISOString()) {
  validateIsoTimestamp(nowIso, "nowIso");
  const nowMs = Date.parse(nowIso);

  if (!source || !source.id) {
    throw new TypeError("valid source with id is required");
  }

  const policyVersion = policy.policyVersion || SCHEDULING_POLICY_VERSION;
  const taskType = policy.normalTaskType || TaskType.DISCOVERY_EXECUTION;

  const span = telemetry.startSpan("scheduler.evaluate", {
    sourceId: source.id,
    sourceState: source.status,
    taskType,
    policyVersion
  });

  telemetry.recordCounter("scheduler_evaluated", 1, {
    sourceState: source.status || "UNKNOWN"
  });

  // Explicit Canonical Source State Gate (Finding 3)
  const classification = SourceSchedulingClassification[source.status] || "NOT_ELIGIBLE";

  if (classification === "BLOCKED") {
    span.setStatus("OK", `Source ${source.status} is BLOCKED from scheduling`);
    span.end();

    telemetry.recordCounter("scheduler_blocked", 1, {
      sourceState: source.status || "UNKNOWN",
      reason: "BLOCKED"
    });

    return deepFreeze({
      sourceId: source.id,
      outcome: SchedulingOutcome.BLOCKED,
      reason: `Source state ${source.status} is strictly BLOCKED from automatic dispatch`,
      evaluatedAt: nowIso,
      policyVersion
    });
  }

  if (classification === "NOT_ELIGIBLE") {
    span.setStatus("OK", `Source ${source.status} is NOT_ELIGIBLE for scheduling`);
    span.end();

    telemetry.recordCounter("scheduler_not_due", 1, {
      sourceState: source.status || "UNKNOWN",
      reason: "NOT_ELIGIBLE"
    });

    return deepFreeze({
      sourceId: source.id,
      outcome: SchedulingOutcome.NOT_ELIGIBLE,
      reason: `Source state ${source.status} is not eligible for automatic dispatch`,
      evaluatedAt: nowIso,
      policyVersion
    });
  }

  // Eligible states: ACTIVE, LOW_PRIORITY, DEGRADED
  const intervalMs = policy.cadences?.[source.status] || DEFAULT_SCHEDULING_POLICY.cadences.ACTIVE;
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    span.setStatus("ERROR", "Invalid policy cadence interval");
    span.end();
    throw new Error(`INVALID_POLICY: Cadence interval for ${source.status} must be a positive integer`);
  }

  // Check notBefore / nextEligibleAt (SCHED-I009)
  if (state.nextEligibleAt) {
    validateIsoTimestamp(state.nextEligibleAt, "state.nextEligibleAt");
    const nextEligibleMs = Date.parse(state.nextEligibleAt);
    if (nowMs < nextEligibleMs) {
      span.setStatus("OK", "Source nextEligibleAt is in future");
      span.end();

      telemetry.recordCounter("scheduler_not_due", 1, {
        sourceState: source.status,
        reason: "FUTURE_NEXT_ELIGIBLE"
      });

      return deepFreeze({
        sourceId: source.id,
        outcome: SchedulingOutcome.NOT_DUE,
        reason: "Source is in backoff/cooldown until nextEligibleAt",
        nextEligibleAt: state.nextEligibleAt,
        evaluatedAt: nowIso,
        policyVersion
      });
    }
  }

  // Check lastScheduledAt interval (SCHED-I007)
  if (state.lastScheduledAt) {
    validateIsoTimestamp(state.lastScheduledAt, "state.lastScheduledAt");
    const lastScheduledMs = Date.parse(state.lastScheduledAt);
    const elapsedMs = nowMs - lastScheduledMs;
    if (elapsedMs < intervalMs) {
      const nextEligibleAt = new Date(lastScheduledMs + intervalMs).toISOString();
      span.setStatus("OK", "Cadence interval has not yet elapsed");
      span.end();

      telemetry.recordCounter("scheduler_not_due", 1, {
        sourceState: source.status,
        reason: "INTERVAL_NOT_ELAPSED"
      });

      return deepFreeze({
        sourceId: source.id,
        outcome: SchedulingOutcome.NOT_DUE,
        reason: "Cadence interval has not yet elapsed",
        nextEligibleAt,
        evaluatedAt: nowIso,
        policyVersion
      });
    }
  }

  // Source is DUE (SCHED-I006)
  // Hardened Slot & Task Identity with TaskType & PolicyVersion (Finding 2 & 5)
  const slotFloorMs = computeSlotFloor(nowMs, intervalMs);
  const slotId = `slot:${source.id}:${taskType}:${slotFloorMs}:${policyVersion}`;
  const taskId = `task:sched:${source.id}:${taskType}:${slotFloorMs}:${policyVersion}`;

  const generatedTask = createWorkerTask({
    taskId,
    taskType,
    sourceId: source.id,
    createdAt: nowIso,
    metadata: {
      slotId,
      scheduledCadence: source.status,
      cadenceIntervalMs: intervalMs,
      policyVersion
    }
  });

  span.setStatus("OK", `Source is DUE for slot ${slotId}`);
  span.end();

  telemetry.recordCounter("scheduler_due", 1, {
    sourceState: source.status
  });

  return deepFreeze({
    sourceId: source.id,
    outcome: SchedulingOutcome.DUE,
    taskType,
    slotId,
    taskId,
    task: generatedTask,
    nextEligibleAt: new Date(slotFloorMs + intervalMs).toISOString(),
    evaluatedAt: nowIso,
    policyVersion
  });
}

/**
 * Dispatch a scheduled task against current source state.
 * Prevents stale dispatch if source state transitioned between evaluation and dispatch (SCHED-I022).
 */
export function dispatchScheduledTask(decision, currentSource, dispatchedSlots = new Set(), nowIso = new Date().toISOString()) {
  validateIsoTimestamp(nowIso, "nowIso");

  if (!decision || decision.outcome !== SchedulingOutcome.DUE || !decision.task) {
    return deepFreeze({
      outcome: DispatchOutcome.BLOCKED_NOT_ELIGIBLE,
      reason: "Decision is not DUE for task generation"
    });
  }

  const span = telemetry.startSpan("scheduler.dispatch", {
    sourceId: decision.sourceId,
    slotId: decision.slotId
  });

  // Stale decision protection (SCHED-I022): Verify current source state against canonical matrix
  const classification = SourceSchedulingClassification[currentSource?.status] || "NOT_ELIGIBLE";
  if (classification !== "ELIGIBLE" && classification !== "ELIGIBLE_RESTRICTED") {
    span.setStatus("ERROR", "Stale schedule decision: source state changed to ineligible");
    span.end();

    telemetry.recordCounter("scheduler_dispatch_stale", 1, {
      currentStatus: currentSource?.status || "UNKNOWN"
    });

    return deepFreeze({
      outcome: DispatchOutcome.STALE_SCHEDULE_DECISION,
      reason: `Source state changed to ${currentSource?.status || "UNKNOWN"} prior to dispatch`,
      decision
    });
  }

  // Duplicate dispatch / slot replay protection (SCHED-I010)
  if (dispatchedSlots.has(decision.slotId)) {
    span.setStatus("OK", "Slot already dispatched; replaying without duplicate task");
    span.end();

    telemetry.recordCounter("scheduler_dispatch_replayed", 1, {
      sourceState: currentSource.status
    });

    return deepFreeze({
      outcome: DispatchOutcome.REPLAYED,
      slotId: decision.slotId,
      taskId: decision.taskId,
      task: decision.task
    });
  }

  dispatchedSlots.add(decision.slotId);

  span.setStatus("OK", "Task dispatched successfully");
  span.end();

  telemetry.recordCounter("scheduler_task_created", 1, {
    sourceState: currentSource.status
  });

  return deepFreeze({
    outcome: DispatchOutcome.DISPATCHED,
    slotId: decision.slotId,
    taskId: decision.taskId,
    task: decision.task,
    dispatchedAt: nowIso
  });
}
