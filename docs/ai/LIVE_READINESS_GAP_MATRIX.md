# LIVE READINESS GAP MATRIX (PKG-LIVE-READINESS-017R)

## 1. Subsystem Evidence Classification

| Subsystem | Classification | Status / Implementation | Pilot Level | Gap Description |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Adapter** | `CONTRACT_PROVEN` | `src/persistence/postgres-adapter.mjs` | `P0` | Live runtime execution is `ENVIRONMENT_BLOCKED` (`PKG-DBRUN-012B`) |
| **Source State Authority** | `EXTERNAL` | In-memory `SourceStore` owns lifecycle | `P1` | Database does not own primary lifecycle state (`DB-GOV-STATE-001`) |
| **Governance Atomicity** | `ARCHITECTURE_GAP` | Multi-table audit without DB transaction | `P1` | Unproven under process failure; can be disabled for pilot |
| **Task Executor** | `REFERENCE_PROVEN` | `WorkerRuntime` + `calculateBackoffMs` | `P0` | Queue is in-memory (`DURABLE_QUEUE=NOT_IMPLEMENTED`) |
| **Distributed Leasing** | `NOT_PROVEN` | Single process memory only | `P2` | Multi-instance locking not implemented |
| **Scheduler Engine** | `REFERENCE_PROVEN` | `evaluateSchedule` + `slotId` replay safe | `P0` | Schedule state in-memory (`DURABLE_SCHEDULER_STATE=NOT_IMPLEMENTED`) |
| **Secret Management** | `CONTRACT_PROVEN` | Scoped resolver + Env provider | `P0` | Live authorized credential missing (`REAL_CREDENTIAL_AVAILABLE=NO`) |
| **Production Secret Manager** | `NOT_IMPLEMENTED` | Vault/AWS Secrets Manager adapter | `P2` | Environment variable provider used for Pilot |
| **Observability Sinks** | `REFERENCE_PROVEN` | In-memory telemetry facade + sanitization | `P2` | `REAL_LOG_SINK=NOT_PROVEN`, `REAL_METRICS_EXPORT=NOT_PROVEN`, `REAL_TRACE_EXPORT=NOT_PROVEN` |
| **Runtime Composition** | `NOT_IMPLEMENTED` | Individual modules tested separately | `P0` | No executable top-level orchestration loop (`PKG-COMPOSITION-018`) |
| **Deployment Readiness** | `NOT_PILOT_READY` | Unit scripts only | `P0` | No production startup or process management entry point |

---

## 2. Multi-Level Idempotency Trace

| Idempotency Level | Status | Evidence & Boundary Authority |
| :--- | :--- | :--- |
| **DOMAIN_IDEMPOTENCY** | `PROVEN` | Normalizer URL canonicalization, deduplication hash, source key uniqueness |
| **REFERENCE_REPLAY** | `PROVEN` | Replaying identical observation streams yields deterministic identical scores & states |
| **DATABASE_RUNTIME_IDEMPOTENCY** | `NOT_PROVEN` | Database unique constraints and upsert idempotency unproven against live PG instance |
| **CONCURRENT_IDEMPOTENCY** | `PROVEN_IN_PROCESS` | In-process concurrent tasks do not create duplicate slots or cross-contaminate secrets |
| **DISTRIBUTED_IDEMPOTENCY** | `NOT_PROVEN` | Cross-node deduplication and lease locking not implemented |

---

## 3. Authoritative Pilot Blocker Hierarchy

### P0_BLOCKERS (Must be resolved before Pilot can safely run)
1. **`P0-1: ACTUAL_DURABLE_POSTGRESQL_PATH_NOT_PROVEN`** (`PKG-DBRUN-012B`):
   - Database schema and adapter must be verified against an active PostgreSQL instance.
2. **`P0-2: COMPLETE_RUNTIME_COMPOSITION_NOT_PROVEN`** (`PKG-COMPOSITION-018`):
   - Scheduler → Worker → SecretResolver → Collector → Persistence → Telemetry must be composed into an executable runtime loop.
3. **`P0-3: NO_AUTHORIZED_LIVE_SOURCE_PATH_PROVEN`** (`PKG-COL-002B`):
   - At least one authorized live source credential and network transport path must be validated.

### P1_REQUIREMENTS (Required for durable operational pilot)
1. **Durable Source Lifecycle Authority**: Migrate primary source lifecycle authority to PostgreSQL (`DB-GOV-STATE-001`).
2. **Durable Scheduler & Queue State**: Persist slot dispatch and task queue state to database.

### P2_PRODUCTION_GAPS (Enterprise Production Requirements)
1. Distributed lease lock manager for multi-node deployments.
2. Production Cloud Secret Manager adapter (AWS Secrets Manager / HashiCorp Vault).
3. OpenTelemetry OTLP Collector metric and trace exporter sinks.

### P3_OPTIMIZATIONS (Performance Tuning)
1. High-throughput query optimization and memory profiling.
