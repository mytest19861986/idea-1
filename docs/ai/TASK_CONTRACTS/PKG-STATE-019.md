# TASK CONTRACT: PKG-STATE-019

## 1. Overview
- **Package ID**: `PKG-STATE-019`
- **Title**: Durable Operational State, Lifecycle Transitions & Lease Ledger Contracts
- **Role**: Lead Systems Architect & Verification Authority (Antigravity & GLM-5.3)
- **Status**: Implemented & Formally Verified
- **Target Invariants**: `STATE-I001` through `STATE-I035`

---

## 2. Invariants & Scope Boundaries
1. **Source State & Optimistic Concurrency (`STATE-I001` to `STATE-I010`)**:
   - `SourceStateRepository` maintains monotonic revision integer for every source.
   - Transition from revision `N` to `N+1` fails closed with `STALE_SOURCE_STATE` if expected revision does not match.
   - All lifecycle transitions recorded in immutable `source_lifecycle_transitions` ledger.
2. **Durable Scheduling State & Replay Protection (`STATE-I011` to `STATE-I017`)**:
   - `SchedulingStateRepository` enforces multi-factor slot uniqueness: `(sourceId, taskType, policyVersion, slotFloorAt)`.
   - Recording an identical slot returns `{ created: false, replayed: true }`.
3. **Worker Task Queue & Lease Model (`STATE-I018` to `STATE-I028`)**:
   - Tasks persist secret-free payloads.
   - Leases have owner, expiration, and monotonic `claimRevision`.
   - Expired leases are reclaimable by other workers with an incremented revision.
   - Stale worker completions with an outdated `leaseToken` are strictly rejected (`STALE_LEASE_TOKEN`).
   - Immutable attempt history with strict `FINAL_FAILURE` vs `EXHAUSTED` separation.
4. **Additive DDL Schema (`STATE-I029` to `STATE-I030`)**:
   - `migrations/002_operational_state.sql` introduces non-destructive tables (`source_runtime_state`, `source_lifecycle_transitions`, `scheduler_slots`, `source_scheduling_state`, `worker_tasks`, `worker_task_attempts`).
   - Zero production database mutations or connections.
