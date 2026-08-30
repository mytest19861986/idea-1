# PILOT EVIDENCE MATRIX (PKG-PILOT-GATE-021)

## 1. Evidence Classification Tiers
- **`TEST`**: Automated deterministic unit / integration test passing locally in Node.js test runner.
- **`REFERENCE_RUNTIME`**: Verified in-process single-node execution behavior.
- **`STATIC_SCHEMA`**: Formally reviewed additive DDL migration schema.
- **`SECURITY_REVIEW`**: Formal security and secret isolation audit.
- **`MANUAL_POLICY`**: Explicitly codified operational governance policy.
- **`LIVE_DB_PROOF`**: Verified against a live, running PostgreSQL instance (Currently: `NOT_RUN`).
- **`LIVE_SOURCE_PROOF`**: Verified against an active external provider endpoint (Currently: `NOT_RUN`).

---

## 2. Complete 24-Gate Audit & Evidence Breakdown

| Gate ID | Target Component | Evidence Tier | Reference Verification | Durable Live Verification | Pilot Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GATE-001** | Full Test & Lint Suite | `TEST` | 180/180 Passing (30 suites) | N/A | **PASS** |
| **GATE-002** | Pipeline Composition | `REFERENCE_RUNTIME` | `DiscoveryRuntimeHost` End-to-End | Pending Live DB | **PASS** |
| **GATE-003** | Lifecycle & Shutdown | `REFERENCE_RUNTIME` | `HardenedRuntimeController` | Pending Live DB | **PASS** |
| **GATE-004** | Live PostgreSQL Connection | `STATIC_SCHEMA` | N/A | Blocked (`PKG-DBRUN-012B`) | **FAIL** |
| **GATE-005** | Database Idempotency | `STATIC_SCHEMA` | Unique Indices Defined | Blocked (`PKG-DBRUN-012B`) | **FAIL** |
| **GATE-006** | Atomic Transactions | `STATIC_SCHEMA` | Optimistic Revision Control | Blocked (`PKG-DBRUN-012B`) | **FAIL** |
| **GATE-007** | Source State & Revision | `REFERENCE_RUNTIME` | `SourceStateRepository` (Rev N->N+1) | Pending Live DB | **PASS** |
| **GATE-008** | Automatic Governance | `MANUAL_POLICY` | `DISABLED_FOR_PILOT` Hardcoded | Preserved | **PASS** |
| **GATE-009** | Scheduler Slot Durability | `REFERENCE_RUNTIME` | `SchedulingStateRepository` | Blocked (`PKG-DBRUN-012B`) | **FAIL** |
| **GATE-010** | Worker Task Durability | `REFERENCE_RUNTIME` | `WorkerTaskRepository` | Blocked (`PKG-DBRUN-012B`) | **FAIL** |
| **GATE-011** | Authorized Live Source | `MANUAL_POLICY` | Feed Collector Contract | Blocked (`PKG-COL-002B`) | **FAIL** |
| **GATE-012** | TrustMRR / Feed Contract | `TEST` | 100% Mock & Normalizer Tested | Blocked (`PKG-COL-002B`) | **FAIL** |
| **GATE-013** | Secret Redaction & Scoping | `SECURITY_REVIEW` | `SecretResolver` + Scoped Redaction | Verified | **PASS** |
| **GATE-014** | Secret Config Manifest | `MANUAL_POLICY` | Names-only mapping | Verified | **PASS** |
| **GATE-015** | Confidentiality Boundary | `TEST` | `isConfidential` preserved | Verified | **PASS** |
| **GATE-016** | Provenance & Source Claim | `TEST` | `SOURCE_CLAIM` provenance | Verified | **PASS** |
| **GATE-017** | Observability Boundedness | `TEST` | Bounded telemetry counters | Verified | **PASS** |
| **GATE-018** | Process Crash Recovery | `REFERENCE_RUNTIME` | In-memory reconstruction | Blocked (`PKG-DBRUN-012B`) | **FAIL** |
| **GATE-019** | Network & Retry Safety | `TEST` | 429/5xx Backoff & Timeouts | Verified | **PASS** |
| **GATE-020** | Lifecycle Safety Invariants | `TEST` | Zero auto-activation | Verified | **PASS** |
| **GATE-021** | Pilot Config Manifest | `MANUAL_POLICY` | Typed environment variables | Verified | **PASS** |
| **GATE-022** | Operator Runbook | `MANUAL_POLICY` | Documented standard steps | Verified | **PASS** |
| **GATE-023** | Controlled Stop Plan | `MANUAL_POLICY` | Non-destructive shutdown | Verified | **PASS** |
| **GATE-024** | Evidence Integrity Manifest | `STATIC_ANALYSIS` | Zero ungrounded assumptions | Verified | **PASS** |

---

## 3. Summary of Gate Counts
- **Total Gates**: 24
- **Reference Runtime PASS**: 24 / 24
- **Controlled Pilot Operational PASS**: 17 / 24
- **Controlled Pilot Operational FAIL / BLOCKED**: 7 / 24 (`GATE-004`, `GATE-005`, `GATE-006`, `GATE-009`, `GATE-010`, `GATE-011`, `GATE-018`)
- **Actionable Blockers**: Exactly 2 external prerequisites:
  1. `P0-1`: Disposable PostgreSQL instance (`PKG-DBRUN-012B`).
  2. `P0-3`: Authorized live source credentials (`PKG-COL-002B`).
