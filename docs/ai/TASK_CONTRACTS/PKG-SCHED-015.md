# TASK CONTRACT: PKG-SCHED-015

## 1. Overview
- **Package ID**: `PKG-SCHED-015`
- **Title**: Discovery Scheduling Engine, Cadence Coordination & Gated Task Dispatch
- **Role**: Scheduler Architect & Platform Engineer (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Scheduling Engine Specifications
1. **SCHED-I001 through SCHED-I005 (Policy & State Contract)**: Immutable `SchedulingPolicy` (`scheduler-policy-v1`), source eligibility gating, and explicit separation between `evaluateSchedule` and `dispatchScheduledTask`.
2. **SCHED-I006 & SCHED-I007 (Cadence Models)**: Configured intervals for `ACTIVE` (1h), `LOW_PRIORITY` (6h), `DEGRADED` (30m recovery cadence); `PAUSED`, `REJECTED`, `RETIRED` strictly `BLOCKED`.
3. **SCHED-I008 through SCHED-I010 (Slot & Task Identity & Replay)**: Deterministic floored slot IDs (`slot:sourceId:slotFloorMs`), deterministic task generation, and duplicate dispatch protection (`REPLAYED`).
4. **SCHED-I009 (notBefore & Backoff Respect)**: Scheduler respects worker retry `nextEligibleAt` without recalculating backoff math.
5. **SCHED-I022 (Stale Decision Protection)**: Real-time verification of source status at dispatch boundary producing `STALE_SCHEDULE_DECISION` if source state transitioned to ineligible.
6. **SCHED-I030 (Missed Run Coalescing)**: Coalesces multiple past missed intervals to a single current due task (`COALESCE_TO_ONE_CURRENT_DUE_TASK`).
7. **SCHED-I024 & SCHED-I025 (Observability & Isolation)**: Metric counters and spans with strict metric cardinality guards.
8. **SCHED-I027 through SCHED-I029 (Agnostic & Zero Mutation)**: Zero source-specific conditionals; scheduler evaluation never mutates SourceRegistry lifecycle state.
