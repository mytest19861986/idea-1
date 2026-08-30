# RESTRICTED PRODUCTION INCIDENT RESPONSE RUNBOOK (PROD-OPS-002)

## 1. DATABASE UNAVAILABLE (PostgreSQL 16)
- **Detection**: Healthcheck returns 503, connection pool exhausted, or critical alert `DATABASE_UNAVAILABLE`.
- **Action**:
  1. Inspect Postgres service status: `systemctl status postgresql`
  2. Verify disk capacity: `df -h /var/lib/postgresql`
  3. Verify connection count: `SELECT count(*) FROM pg_stat_activity;`
  4. If locked/stuck, restart daemon: `systemctl restart postgresql`
  5. If data corrupted, initiate Encrypt-Then-MAC restore from `/var/backups/discovery/`.

## 2. APPLICATION CRASH LOOP
- **Detection**: Supervisor triggers `CRASH_LOOP_DETECTED` (>5 restarts in 60s).
- **Action**:
  1. Inspect supervisor logs for unhandled exception or OOM killer event.
  2. Check recent configuration/secret changes.
  3. Execute automated rollback to previous-good release: `node src/security/release-manager.mjs --rollback`
  4. Verify healthcheck on restored release.

## 3. BACKUP FAILURE
- **Detection**: Daily cron fails to emit `.tag` or alert `BACKUP_FAILURE` fired.
- **Action**:
  1. Check disk space on `/var/backups/discovery`.
  2. Verify master backup key integrity.
  3. Execute manual backup: `bash scripts/automated_backup.sh`.
  4. Verify pre-decrypt HMAC tag immediately.

## 4. ALERT PATH FAILURE (Out-of-process Sink Unreachable)
- **Detection**: `HttpAlertSinkAdapter` encounters HTTP 5xx or connection timeout.
- **Action**:
  1. Telemetry buffer switches to local bounded ring buffer (retaining latest 1,000 alerts).
  2. Memory bounding strictly enforced via `DROP_OLDEST` (zero OOM crash).
  3. Verify external webhook sink connectivity.
  4. Flush buffer once sink recovers.

## 5. AUTH / RBAC BYPASS & CONFIDENTIALITY LEAK
- **Detection**: Audit ledger logs unauthorized mutation attempt or confidential data access without ANALYST/ADMIN role.
- **Action**:
  1. Immediately revoke active JWT tokens by rotating signing secret.
  2. Isolate client IP via `SecurityPerimeterService` rate-limiter block.
  3. Inspect audit trail via `OperatorAuditService.queryAuditTrail({ action: 'MUTATE_PORTFOLIO' })`.

## 6. DISK CAPACITY CRITICAL (>90%)
- **Detection**: Alert `DATABASE_DISK_HIGH` fired at 90% threshold.
- **Action**:
  1. Purge old log files and transient files.
  2. Enforce backup retention: `find /var/backups/discovery -name "*.dump.enc" -mtime +7 -delete`.
  3. Vacuum PostgreSQL dead tuples: `VACUUM ANALYZE;`.
