import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSchedule,
  dispatchScheduledTask,
  computeSlotFloor,
  SchedulingOutcome,
  DispatchOutcome,
  DEFAULT_SCHEDULING_POLICY,
  SourceSchedulingClassification
} from "../src/scheduler/scheduling-engine.mjs";
import { TaskType } from "../src/worker/worker-task.mjs";

test("SCHEDULER: ACTIVE + never scheduled yields DUE with valid WorkerTask", () => {
  const source = { id: "src-1", status: "ACTIVE" };
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, {}, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.DUE);
  assert.ok(decision.slotId.includes("src-1"));
  assert.ok(decision.slotId.includes(TaskType.DISCOVERY_EXECUTION));
  assert.ok(decision.slotId.includes("scheduler-policy-v1"));
  assert.ok(decision.task);
  assert.strictEqual(decision.task.sourceId, "src-1");
  assert.strictEqual(decision.task.taskType, TaskType.DISCOVERY_EXECUTION);
});

test("SCHEDULER: DEGRADED normal discovery interval is slower than ACTIVE (Finding 1 fix)", () => {
  assert.ok(DEFAULT_SCHEDULING_POLICY.cadences.DEGRADED >= DEFAULT_SCHEDULING_POLICY.cadences.ACTIVE);
  assert.strictEqual(DEFAULT_SCHEDULING_POLICY.cadences.ACTIVE, 3600000); // 1h
  assert.strictEqual(DEFAULT_SCHEDULING_POLICY.cadences.DEGRADED, 7200000); // 2h (slower, not hammering)

  const source = { id: "src-deg", status: "DEGRADED" };
  const state = { lastScheduledAt: "2026-08-30T11:00:00.000Z" }; // 1h ago (< 2h)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.NOT_DUE);
});

test("SCHEDULER: LOW_PRIORITY applies slower configured cadence (6 hours)", () => {
  const source = { id: "src-low", status: "LOW_PRIORITY" };
  const state = { lastScheduledAt: "2026-08-30T10:00:00.000Z" }; // 2 hours ago (< 6 hours)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.NOT_DUE);
});

test("SCHEDULER: Canonical source status matrix strictly classifies every lifecycle state (Finding 3 fix)", () => {
  const allStates = ["DISCOVERED", "CANDIDATE", "EVALUATING", "APPROVED", "ACTIVE", "LOW_PRIORITY", "DEGRADED", "PAUSED", "REJECTED", "RETIRED"];
  for (const s of allStates) {
    assert.ok(SourceSchedulingClassification[s], `State ${s} must have explicit classification`);
  }

  assert.strictEqual(SourceSchedulingClassification.DISCOVERED, "NOT_ELIGIBLE");
  assert.strictEqual(SourceSchedulingClassification.CANDIDATE, "NOT_ELIGIBLE");
  assert.strictEqual(SourceSchedulingClassification.EVALUATING, "NOT_ELIGIBLE");
  assert.strictEqual(SourceSchedulingClassification.APPROVED, "NOT_ELIGIBLE");
  assert.strictEqual(SourceSchedulingClassification.ACTIVE, "ELIGIBLE");
  assert.strictEqual(SourceSchedulingClassification.LOW_PRIORITY, "ELIGIBLE");
  assert.strictEqual(SourceSchedulingClassification.DEGRADED, "ELIGIBLE_RESTRICTED");
  assert.strictEqual(SourceSchedulingClassification.PAUSED, "BLOCKED");
  assert.strictEqual(SourceSchedulingClassification.REJECTED, "BLOCKED");
  assert.strictEqual(SourceSchedulingClassification.RETIRED, "BLOCKED");
});

test("SCHEDULER: Slot and Task IDs include taskType and policyVersion (Finding 2 & 5 fix)", () => {
  const source = { id: "src-id-test", status: "ACTIVE" };
  const now = "2026-08-30T12:00:00.000Z";

  const d1 = evaluateSchedule(source, {}, DEFAULT_SCHEDULING_POLICY, now);
  const customPolicy = { ...DEFAULT_SCHEDULING_POLICY, policyVersion: "scheduler-policy-v2" };
  const d2 = evaluateSchedule(source, {}, customPolicy, now);

  assert.ok(d1.slotId.includes("DISCOVERY_EXECUTION"));
  assert.ok(d1.slotId.includes("scheduler-policy-v1"));
  assert.ok(d1.taskId.includes("DISCOVERY_EXECUTION"));
  assert.ok(d1.taskId.includes("scheduler-policy-v1"));

  // Different policy version produces distinct slot/task ID
  assert.notStrictEqual(d1.slotId, d2.slotId);
  assert.notStrictEqual(d1.taskId, d2.taskId);
});

test("SCHEDULER: Slot dispatch replay protection prevents duplicate task creation (SCHED-I010)", () => {
  const source = { id: "src-1", status: "ACTIVE" };
  const now = "2026-08-30T12:00:00.000Z";
  const decision = evaluateSchedule(source, {}, DEFAULT_SCHEDULING_POLICY, now);

  const dispatchedSlots = new Set();
  const res1 = dispatchScheduledTask(decision, source, dispatchedSlots, now);
  const res2 = dispatchScheduledTask(decision, source, dispatchedSlots, now);

  assert.strictEqual(res1.outcome, DispatchOutcome.DISPATCHED);
  assert.strictEqual(res2.outcome, DispatchOutcome.REPLAYED);
  assert.strictEqual(dispatchedSlots.size, 1);
});

test("SCHEDULER: Source state change before dispatch yields STALE_SCHEDULE_DECISION (SCHED-I022)", () => {
  const sourceAtEvaluation = { id: "src-stale", status: "ACTIVE" };
  const now = "2026-08-30T12:00:00.000Z";
  const decision = evaluateSchedule(sourceAtEvaluation, {}, DEFAULT_SCHEDULING_POLICY, now);

  // State transitions to PAUSED before dispatch
  const sourceAtDispatch = { id: "src-stale", status: "PAUSED" };
  const dispatchedSlots = new Set();
  const res = dispatchScheduledTask(decision, sourceAtDispatch, dispatchedSlots, now);

  assert.strictEqual(res.outcome, DispatchOutcome.STALE_SCHEDULE_DECISION);
  assert.strictEqual(dispatchedSlots.size, 0); // Not dispatched
});
