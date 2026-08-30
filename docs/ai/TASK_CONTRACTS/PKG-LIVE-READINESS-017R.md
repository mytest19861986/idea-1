# TASK CONTRACT: PKG-LIVE-READINESS-017R

## 1. Overview
- **Package ID**: `PKG-LIVE-READINESS-017R`
- **Title**: Live Readiness Evidence Classification & Dependency Trace Remediation
- **Role**: Lead Systems Architect & Verification Authority (Antigravity)
- **Status**: Remediated & Authoritative
- **Target Invariants**: LIVE-I001 through LIVE-I030

---

## 2. Remediated Evidence Hierarchy & Taxonomy
1. **DURABLE_RUNTIME_PROVEN = NO**:
   - PostgreSQL schema DDL and adapter code exist and pass mock tests (`CONTRACT_PROVEN`), but actual durable execution against a live running PostgreSQL database is `ENVIRONMENT_BLOCKED` pending `PKG-DBRUN-012B`.
2. **DISTRIBUTED_RUNTIME_PROVEN = NO**:
   - Queue leasing and multi-node scheduler synchronization are unproven; current system operates strictly under `SINGLE_PROCESS_REFERENCE`.
3. **Source State Authority & Governance Atomicity**:
   - `POSTGRES_SOURCE_STATE_AUTHORITY=EXTERNAL` (Lifecycle state currently owned by in-memory `SourceStore`).
   - `GOVERNANCE_DURABLE_ATOMICITY=ARCHITECTURE_GAP_NOT_PROVEN` (`DB-GOV-STATE-001` gap remains visible).
   - Assessment: Automatic governance mutation can be safely disabled for Pilot (`AUTOMATIC_GOVERNANCE_APPLICATION=DISABLED_FOR_PILOT`) to prevent uncoordinated in-memory/durable state drift.
4. **Idempotency Multi-Level Classification**:
   - `DOMAIN_IDEMPOTENCY=PROVEN`
   - `REFERENCE_REPLAY=PROVEN`
   - `DATABASE_RUNTIME_IDEMPOTENCY=NOT_PROVEN`
   - `CONCURRENT_IDEMPOTENCY=PROVEN_IN_PROCESS`
   - `DISTRIBUTED_IDEMPOTENCY=NOT_PROVEN`
5. **Concrete P0 Pilot Blockers**:
   - `P0-1`: `ACTUAL_DURABLE_POSTGRESQL_PATH_NOT_PROVEN` (`PKG-DBRUN-012B`)
   - `P0-2`: `COMPLETE_RUNTIME_COMPOSITION_NOT_PROVEN` (`PKG-COMPOSITION-018`)
   - `P0-3`: `NO_AUTHORIZED_LIVE_SOURCE_PATH_PROVEN` (`PKG-COL-002B`)
6. **Next Authorized Step**:
   - Proceed directly to `PKG-COMPOSITION-018` to compose Scheduler → Worker → SecretResolver → Collector → Persistence → Telemetry in an executable runtime loop.
