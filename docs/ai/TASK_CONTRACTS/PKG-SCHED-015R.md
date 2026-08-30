# TASK CONTRACT: PKG-SCHED-015R

## 1. Overview
- **Package ID**: `PKG-SCHED-015R`
- **Title**: Scheduler Cadence Safety & Deterministic Dispatch Identity Hardening
- **Role**: Scheduler Architect & Systems Engineer (GLM-5.3 & Antigravity)
- **Status**: Remediated & Verified

---

## 2. Remediated Findings & Invariants
1. **Finding 1 Fix (DEGRADED Cadence Safety)**:
   - `ACTIVE`: 3,600,000 ms (1 hour).
   - `LOW_PRIORITY`: 21,600,000 ms (6 hours).
   - `DEGRADED`: 7,200,000 ms (2 hours). Slower than ACTIVE, guaranteeing degraded sources are never hammered with increased collection frequency.
2. **Finding 2 & 5 Fix (Hardened Slot & Task Identity)**:
   - `slotId`: `slot:${sourceId}:${taskType}:${slotFloorMs}:${policyVersion}`.
   - `taskId`: `task:sched:${sourceId}:${taskType}:${slotFloorMs}:${policyVersion}`.
   - Stable discriminators prevent collisions across task types and policy revisions.
3. **Finding 3 Fix (Canonical Lifecycle Classification Matrix)**:
   - `DISCOVERED`, `CANDIDATE`, `EVALUATING`, `APPROVED` -> `NOT_ELIGIBLE`.
   - `ACTIVE`, `LOW_PRIORITY` -> `ELIGIBLE`.
   - `DEGRADED` -> `ELIGIBLE_RESTRICTED`.
   - `PAUSED`, `REJECTED`, `RETIRED` -> `BLOCKED`.
4. **Finding 4 Fix (Task-Type Authority)**:
   - Normal source scheduling is strictly bound to `TaskType.DISCOVERY_EXECUTION`.
