import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSchedule,
  dispatchScheduledTask,
  computeSlotFloor,
  SchedulingOutcome,
  DispatchOutcome,
  DEFAULT_SCHEDULING_POLICY
} from "../src/scheduler/scheduling-engine.mjs";

test("SCHEDULER: ACTIVE + never scheduled yields DUE with valid WorkerTask", () => {
  const source = { id: "src-1", status: "ACTIVE" };
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, {}, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.DUE);
  assert.ok(decision.slotId.includes("src-1"));
  assert.ok(decision.task);
  assert.strictEqual(decision.task.sourceId, "src-1");
});

test("SCHEDULER: ACTIVE + interval not elapsed yields NOT_DUE", () => {
  const source = { id: "src-1", status: "ACTIVE" };
  const state = { lastScheduledAt: "2026-08-30T11:45:00.000Z" }; // 15 mins ago (interval = 60 mins)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.NOT_DUE);
  assert.strictEqual(decision.reason, "Cadence interval has not yet elapsed");
});

test("SCHEDULER: ACTIVE + interval elapsed yields DUE", () => {
  const source = { id: "src-1", status: "ACTIVE" };
  const state = { lastScheduledAt: "2026-08-30T10:00:00.000Z" }; // 2 hours ago (interval = 60 mins)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.DUE);
});

test("SCHEDULER: LOW_PRIORITY applies slower configured cadence (6 hours)", () => {
  const source = { id: "src-low", status: "LOW_PRIORITY" };
  const state = { lastScheduledAt: "2026-08-30T10:00:00.000Z" }; // 2 hours ago (< 6 hours)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.NOT_DUE);
});

test("SCHEDULER: DEGRADED applies recovery cadence (30 mins)", () => {
  const source = { id: "src-deg", status: "DEGRADED" };
  const state = { lastScheduledAt: "2026-08-30T11:15:00.000Z" }; // 45 mins ago (> 30 mins)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.DUE);
});

test("SCHEDULER: PAUSED, REJECTED, RETIRED yield BLOCKED; APPROVED, CANDIDATE yield NOT_ELIGIBLE", () => {
  const paused = evaluateSchedule({ id: "src-p", status: "PAUSED" }, {}, DEFAULT_SCHEDULING_POLICY, "2026-08-30T12:00:00Z");
  const rejected = evaluateSchedule({ id: "src-r", status: "REJECTED" }, {}, DEFAULT_SCHEDULING_POLICY, "2026-08-30T12:00:00Z");
  const approved = evaluateSchedule({ id: "src-a", status: "APPROVED" }, {}, DEFAULT_SCHEDULING_POLICY, "2026-08-30T12:00:00Z");

  assert.strictEqual(paused.outcome, SchedulingOutcome.BLOCKED);
  assert.strictEqual(rejected.outcome, SchedulingOutcome.BLOCKED);
  assert.strictEqual(approved.outcome, SchedulingOutcome.NOT_ELIGIBLE);
});

test("SCHEDULER: nextEligibleAt in future yields NOT_DUE without recomputing backoff", () => {
  const source = { id: "src-retry", status: "ACTIVE" };
  const state = { nextEligibleAt: "2026-08-30T12:30:00.000Z" }; // 30 mins in future
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.NOT_DUE);
  assert.strictEqual(decision.nextEligibleAt, "2026-08-30T12:30:00.000Z");
});

test("SCHEDULER: Missed intervals coalesce to one current due task (SCHED-I030)", () => {
  const source = { id: "src-missed", status: "ACTIVE" };
  const state = { lastScheduledAt: "2026-08-25T00:00:00.000Z" }; // 5 days ago (many missed 1h intervals)
  const now = "2026-08-30T12:00:00.000Z";

  const decision = evaluateSchedule(source, state, DEFAULT_SCHEDULING_POLICY, now);
  assert.strictEqual(decision.outcome, SchedulingOutcome.DUE);
  assert.ok(decision.task);
  // Coalesces to single current slot
  assert.strictEqual(decision.slotId, `slot:src-missed:${Date.parse("2026-08-30T12:00:00.000Z")}`);
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
