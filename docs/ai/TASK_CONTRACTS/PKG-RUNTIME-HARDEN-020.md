# TASK CONTRACT: PKG-RUNTIME-HARDEN-020

## 1. Overview
- **Package ID**: `PKG-RUNTIME-HARDEN-020`
- **Title**: Single-Process Lifecycle, Startup Readiness & Graceful Shutdown Hardening
- **Role**: Lead Systems Architect & Verification Authority (Antigravity & GLM-5.3)
- **Status**: Implemented & Formally Verified
- **Target Invariants**: `RUNTIME-I001` through `RUNTIME-I040`

---

## 2. Invariants & Scope Boundaries
1. **Process Lifecycle States (`RUNTIME-I001` to `RUNTIME-I008`)**:
   - `CREATED` -> `STARTING` -> `READY` -> `STOPPING` -> `STOPPED` (or `FAILED`).
   - Idempotent `start()` and `stop()`.
2. **Liveness & Readiness Separation (`RUNTIME-I009` to `RUNTIME-I012`)**:
   - `getLiveness()` verifies process responsiveness.
   - `getReadiness()` verifies dependency health (`DURABLE=false` in Reference mode; `READY=false` if PostgreSQL mode selected but database is unavailable).
   - Zero silent fallback from PostgreSQL to In-Memory mode.
3. **Cycle Execution & Overlap Protection (`RUNTIME-I013` to `RUNTIME-I017`)**:
   - `triggerCycle()` throws `OVERLAPPING_CYCLE_REJECTED` if an existing discovery cycle is actively executing.
4. **Clock Port (`RUNTIME-I029` to `RUNTIME-I030`)**:
   - Domain logic receives explicit timestamps. Operational controller uses `Clock` port (`SystemClock` / `DeterministicClock`).
5. **Graceful Shutdown & Resource Ownership (`RUNTIME-I021` to `RUNTIME-I026`)**:
   - `stop({ timeoutMs })` waits for in-flight tasks and closes only owned resources.
   - Signal adapters for `SIGTERM` and `SIGINT`.
6. **Safety & Zero Source Mutation (`RUNTIME-I031` to `RUNTIME-I033`)**:
   - Zero automatic source approval, activation, rejection, or retirement during startup or shutdown.
   - `AUTOMATIC_GOVERNANCE_APPLICATION=DISABLED_FOR_PILOT` strictly preserved.
   - Health and error diagnostics strictly secret-redacted.
