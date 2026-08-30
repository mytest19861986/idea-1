# LIVE READINESS GAP MATRIX (PKG-LIVE-READINESS-017)

## 1. Component Readiness Matrix

| Component | Current Implementation | Evidence Level | Pilot Requirement | Gap Description | Severity | Blocking | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Source Registry** | In-memory `SourceStore` + schema validator | `REFERENCE_RUNTIME_PROVEN` | Postgres-backed source lifecycle persistence | In-memory store does not survive process restarts | `P1` | YES | Wire `PostgresSourceStore` adapter to runtime |
| **Collector Contract** | Unified Collector Interface & normalizer | `CONTRACT_PROVEN` | Strict contract validation | None (Contract complete) | `P3` | NO | Maintain contract stability |
| **TrustMRR Collector** | Deterministic normalizer & mock transport | `REFERENCE_RUNTIME_PROVEN` | Live API credential & transport execution | Parked on `PKG-COL-002B` (Missing real API token) | `P0` | YES | Obtain pilot API key & execute `PKG-COL-002B` |
| **Discovery Intake** | URL sanitizer, deduplicator, deep freeze | `REFERENCE_RUNTIME_PROVEN` | Gated candidate intake | None | `P3` | NO | Ingestion pipeline ready |
| **Candidate Store** | In-memory state & entity resolution | `REFERENCE_RUNTIME_PROVEN` | Durable candidate deduplication | Requires Postgres persistence in live runs | `P1` | YES | Connect to `candidates` table |
| **PostgreSQL Schema** | Production DDL (`migrations/001_initial_schema.sql`) | `CONTRACT_PROVEN` | Applied to disposable PostgreSQL instance | Parked on `PKG-DBRUN-012B` (Schema written, live migration pending) | `P0` | YES | Spin up disposable Postgres & apply migration |
| **PostgreSQL Adapter** | `src/persistence/postgres-adapter.mjs` | `REFERENCE_RUNTIME_PROVEN` | Executed against live PG client | Integration test against running database instance pending | `P1` | YES | Execute integration tests in `PKG-DBRUN-012B` |
| **Worker Runtime** | Execution engine, backoff, ephemeral secrets | `REFERENCE_RUNTIME_PROVEN` | Resilient task execution | Queue is in-memory; needs durable leasing for distributed pilot | `P2` | NO (Pilot single-instance) | Implement DB-backed task leasing |
| **Scheduler** | Deterministic scheduling engine, cadence | `REFERENCE_RUNTIME_PROVEN` | Slot calculation & deduplication | Scheduler state is in-memory | `P1` | YES | Persist slot dispatch records to PG |
| **Secret Resolver** | Ephemeral scoped resolver & redaction | `REFERENCE_RUNTIME_PROVEN` | Secure secret injection | Production Secret Manager provider (AWS Secrets / Vault) | `P2` | NO (Env provider pilot-ready) | Add AWS/Vault secret provider |
| **Observability** | Telemetry facade & redaction | `REFERENCE_RUNTIME_PROVEN` | Structured metrics/logs/spans | OpenTelemetry exporter sink | `P2` | NO (Console/Noop pilot-ready) | Wire OTel Collector exporter |

---

## 2. Blocker Classification Summary
- **P0_BLOCKERS** (Hard blockers preventing Pilot execution):
  1. `PKG-DBRUN-012B`: Disposable PostgreSQL instance execution and migration verification.
  2. `PKG-COL-002B`: Authorized live TrustMRR API credential availability.
- **P1_REQUIRED_BEFORE_PILOT** (Required before production pilot deployment):
  1. Runtime composition wiring `WorkerRuntime` + `SchedulingEngine` + `PostgresAdapter`.
  2. Durable source lifecycle and schedule state persistence in PostgreSQL.
- **P2_REQUIRED_FOR_PRODUCTION** (Production enterprise readiness):
  1. Distributed lease lock / distributed queue broker.
  2. Production Cloud Secret Manager adapter (AWS/GCP/Vault).
  3. OpenTelemetry OTLP Collector metrics/trace exporter sink.
- **P3_OPTIMIZATION** (Non-blocking improvements):
  1. Fine-grained performance profiling and telemetry histogram optimization.
