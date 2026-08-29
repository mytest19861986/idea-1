# DISCOVERY CORE PRODUCTION GAP MATRIX

This document outlines the gaps between the in-memory/contract-proven Discovery Core baseline and the requirements for a full production deployment.

| Area | Current In-Memory State | Target Production Requirement | Target Package |
| :--- | :--- | :--- | :--- |
| **Discovery Persistence** | `InMemoryDiscoveryCandidateStore` with Map backend | PostgreSQL relational schema with JSONB candidate payload, unique canonical constraints, and ACID transactions | `PKG-PERSIST-011` |
| **Observation Storage** | In-memory Javascript array | TimescaleDB / PostgreSQL time-series partitioned observation tables with fast window aggregation | `PKG-PERSIST-011` |
| **Governance Persistence** | In-memory `SourceGovernanceApplier` set | PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) with optimistic locking column | `PKG-PERSIST-011` |
| **Concurrency & Workers** | Synchronous in-memory pipeline execution | Distributed job queue (BullMQ / Redis / Temporal) with concurrency throttles per source | `PKG-WORKER-012` |
| **Scheduling** | Manual invocation via CLI / test harnesses | Cron & event-driven trigger engine with cooldown awareness | `PKG-WORKER-012` |
| **Secrets & Credentials** | Environment mock / unauthenticated collector fallback | AWS Secrets Manager / HashiCorp Vault integration with dynamic token rotation | `PKG-PROD-SEC-013` |
| **Live TrustMRR Collector** | Parked unauthenticated fail-closed mode (`PKG-COL-002B`) | Live authenticated API client with rate-limit backoff and pagination retry | `PKG-COL-002B` |
| **Telemetry & Observability** | In-memory audit event arrays | OpenTelemetry tracing, Prometheus metric exports, and structured ELK/Datadog logging | `PKG-OBSERV-014` |
| **Deployment & Recovery** | Local test suites | Docker containerization, Kubernetes manifest, graceful shutdown, and crash recovery | `PKG-DEPLOY-015` |
