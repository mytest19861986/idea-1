# Production Backup Schedule & Retention Policy (PROD-READINESS-001R2)

## 1. Backup Policy Specification
- **BACKUP_METHOD**: Automated compressed binary dump via `pg_dump -F c`
- **BACKUP_SCHEDULE**: Daily at 02:00 UTC
- **RETENTION_POLICY**: 30-day rolling snapshot retention with automated purge of backups older than 30 days
- **ENCRYPTION_AT_REST**: AES-256 encrypted storage via filesystem/cloud provider KMS
- **PITR_DECISION**: `PITR_REQUIRED_FOR_INITIAL_PROFILE = NO` (Daily automated snapshots satisfy RPO < 24h and RTO < 30m without complex WAL overhead)

---

## 2. Measurable Targets & Measured Durations
- **RPO_TARGET**: `< 24 Hours` (Daily scheduled baseline)
- **RTO_TARGET**: `< 30 Minutes` (Recovery objective)
- **MEASURED_BACKUP_DURATION**: `~128 ms` (on reference dataset)
- **MEASURED_RESTORE_DURATION**: `~1628 ms` (on clean target database)

---

## 3. Database Restore Runbook & Guard Controls
1. **Safety Guard**: `RESTORE_TARGET_GUARD` blocks restore execution if connection string points to active production DSN without explicit `--force-test-restore` flag.
2. **Execution Steps**:
   ```bash
   # 1. Take safety snapshot of current instance
   pg_dump -U $DB_USER -d discovery_test -h $DB_HOST -F c -f /var/backups/pre_restore_safety.dump

   # 2. Re-create isolated target schema
   psql -U $DB_USER -h $DB_HOST -c "DROP DATABASE IF EXISTS discovery_restore_test; CREATE DATABASE discovery_restore_test;"

   # 3. Restore and verify integrity
   pg_restore -U $DB_USER -d discovery_restore_test -h $DB_HOST /var/backups/discovery_latest.dump
   psql -U $DB_USER -d discovery_restore_test -c "SELECT count(*) FROM discovery_candidates;"
   ```
