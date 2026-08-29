import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";
import { TaskType, createWorkerTask } from "../worker/worker-task.mjs";

/**
 * ============================================================================
 * DISCOVERY SCHEDULING ENGINE (PKG-SCHED-015)
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

export const DEFAULT_SCHEDULING_POLICY = Object.freeze({
  policyVersion: SCHEDULING_POLICY_VERSION,
  cadences: {
    ACTIVE: 3600000, // 1 hour
    LOW_PRIORITY: 21600000, // 6 hours
    DEGRADED: 1800000 // 30 minutes (diagnostic/recovery)
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

  const span = telemetry.startSpan("scheduler.evaluate", {
    sourceId: source.id,
    sourceState: source.status
  });

  telemetry.recordCounter("scheduler_evaluated", 1, {
    sourceState: source.status || "UNKNOWN"
  });

  // Source state eligibility gate (SCHED-I004)
  const eligibleStates = ["ACTIVE", "LOW_PRIORITY", "DEGRADED"];
  if (!eligibleStates.includes(source.status)) {
    const isBlocked = ["PAUSED", "REJECTED", "RETIRED"].includes(source.status);
    const outcome = isBlocked ? SchedulingOutcome.BLOCKED : SchedulingOutcome.NOT_ELIGIBLE;

    span.setStatus("OK", `Source ${source.status} not eligible for scheduling`);
    span.end();

    telemetry.recordCounter(isBlocked ? "scheduler_blocked" : "scheduler_not_due", 1, {
      sourceState: source.status || "UNKNOWN",
      reason: outcome
    });

    return deepFreeze({
      sourceId: source.id,
      outcome,
      reason: `Source state ${source.status} is not eligible for automatic dispatch`,
      evaluatedAt: nowIso,
      policyVersion: policy.policyVersion || SCHEDULING_POLICY_VERSION
    });
  }

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
        policyVersion: policy.policyVersion || SCHEDULING_POLICY_VERSION
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
        policyVersion: policy.policyVersion || SCHEDULING_POLICY_VERSION
      });
    }
  }

  // Source is DUE (SCHED-I006)
  // Deterministic slot identity and missed run coalescing (SCHED-I008, SCHED-I030)
  const slotFloorMs = computeSlotFloor(nowMs, intervalMs);
  const slotId = `slot:${source.id}:${slotFloorMs}`;
  const taskId = `task:sched:${source.id}:${slotFloorMs}`;

  const generatedTask = createWorkerTask({
    taskId,
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: source.id,
    createdAt: nowIso,
    metadata: {
      slotId,
      scheduledCadence: source.status,
      cadenceIntervalMs: intervalMs
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
    slotId,
    taskId,
    task: generatedTask,
    nextEligibleAt: new Date(slotFloorMs + intervalMs).toISOString(),
    evaluatedAt: nowIso,
    policyVersion: policy.policyVersion || SCHEDULING_POLICY_VERSION
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

  // Stale decision protection (SCHED-I022): Verify current source state
  const eligibleStates = ["ACTIVE", "LOW_PRIORITY", "DEGRADED"];
  if (!currentSource || !eligibleStates.includes(currentSource.status)) {
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
