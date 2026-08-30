# CONTROLLED SINGLE-INSTANCE PILOT OPERATOR RUNBOOK (PKG-PILOT-GATE-021)

## 1. Overview
This runbook defines standard operating procedures for executing a controlled single-instance Pilot.

---

## 2. Configuration Manifest (Variable Names Only)

### Non-Secret Variables
- `NODE_ENV`: Set to `production` or `staging`.
- `RUNTIME_MODE`: Set to `POSTGRES_STANDALONE` (or `REFERENCE` for dry-run).
- `PERSISTENCE_MODE`: Set to `POSTGRES_DURABLE` (or `IN_MEMORY`).
- `GOVERNANCE_APPLICATION_MODE`: Must be `DISABLED_FOR_PILOT`.
- `CYCLE_INTERVAL_MS`: Recommended `3600000` (1 hour).
- `SHUTDOWN_TIMEOUT_MS`: Recommended `10000` (10 seconds).
- `TELEMETRY_ENABLED`: `true` or `false`.
- `PGHOST`: Database hostname.
- `PGPORT`: Database port (default `5432`).
- `PGDATABASE`: Database name.
- `PGUSER`: Database user.

### Secret Variables (Never Stored in Code or Logged)
- `PGPASSWORD`: Database user password.
- `TRUSTMRR_API_BEARER_TOKEN`: Feed bearer token (mapped via `cred:source:trustmrr:bearer`).

---

## 3. Step-by-Step Operating Procedures

### Phase 1: Pre-Start Verification (`PRE_START`)
1. Verify database schema: Ensure `migrations/001_initial_schema.sql` and `migrations/002_operational_state.sql` have been applied to target PostgreSQL.
2. Verify environment secrets: Check that `PGPASSWORD` and `TRUSTMRR_API_BEARER_TOKEN` are set in the runtime process environment.
3. Run static checks:
   ```bash
   node --test
   node scripts/lint.mjs
   node scripts/typecheck.mjs
   ```

### Phase 2: Start Runtime (`START`)
1. Instantiate `HardenedRuntimeController` with validated runtime config and dependencies.
2. Execute `await controller.start()`.

### Phase 3: Readiness Check (`READINESS_CHECK`)
1. Poll `controller.getLiveness()` -> verify `live: true`, `state: "READY"`.
2. Poll `controller.getReadiness()` -> verify `ready: true`, `durable: true`.

### Phase 4: First Collection Execution (`FIRST_COLLECTION`)
1. Trigger controlled cycle: `await controller.triggerCycle()`.
2. Monitor log stream for:
   - `scheduler_slot_created`
   - `worker_task_claimed`
   - `worker_task_completed`

### Phase 5: Verify Persistence (`VERIFY_PERSISTENCE`)
1. Query `raw_documents` and `candidates` tables -> verify newly stored records.
2. Verify `source_lifecycle_transitions` and `worker_task_attempts` contain audit records.
3. Confirm zero raw secret tokens in database columns.

### Phase 6: Verify Telemetry (`VERIFY_TELEMETRY`)
1. Inspect emitted spans and metric counters.
2. Confirm metric labels are bounded and contain zero task IDs or credential values.

### Phase 7: Controlled Stop (`STOP`)
1. Trigger graceful shutdown: `await controller.stop({ timeoutMs: 10000 })`.
2. Verify state transitions to `STOPPED` and owned database pool is closed.

### Phase 8: Restart & Replay Verification (`RESTART & VERIFY_REPLAY_SAFETY`)
1. Start controller again.
2. Trigger cycle with identical timestamps -> verify `SLOT_ALREADY_DISPATCHED` / `replayed: true` (Zero duplicate tasks created).

### Phase 9: Emergency Stop (`EMERGENCY_STOP`)
1. Issue `SIGTERM` or `SIGINT` to the process.
2. Signal handler initiates graceful stop.
3. If process does not exit within 15 seconds, terminate process. Database transaction isolation guarantees no partially committed records.
