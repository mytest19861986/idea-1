# Production Readiness & Capability Inventory (WEB-PRODUCT-008)

## 1. Capability Maturity Inventory

| Capability | Maturity | Evidence Basis | Known Limitation | Production Relevance |
| :--- | :--- | :--- | :--- | :--- |
| **DISCOVERY_INGESTION** | `PROVEN_PILOT` | `src/discovery/discovery-intake.mjs` unit & live tests | In-memory schema normalization | Essential |
| **SOURCE_REGISTRY** | `PROVEN_PILOT` | PostgreSQL `source_registry` tables | Single active source (HN) | Essential |
| **SOURCE_GOVERNANCE** | `PROVEN_PILOT` | Strict boundary filters | No automated license validator | High |
| **SOURCE_HEALTH** | `PROVEN_PILOT` | `src/discovery/discovery-source-health.mjs` | Periodic polling only | High |
| **COLLECTOR_BOUNDARY** | `PROVEN_PILOT` | `test/collector.test.mjs` (Zero UI imports) | Mocked fallback outside live pilot | Essential |
| **LIVE_SOURCE_HN** | `PROVEN_PILOT` | Live network collection via HackerNews official API | Rate-limited to official endpoints | High |
| **TRUSTMRR_INTEGRATION** | `REFERENCE_ONLY` | `test/trustmrr.test.mjs` synthetic fixture suite | Live API key integration deferred | Medium |
| **POSTGRESQL_PERSISTENCE** | `PROVEN_PILOT` | PostgreSQL 16.15 schema migrations 001..004 | Single-node PostgreSQL | Essential |
| **SCHEMA_MIGRATIONS** | `PROVEN_PILOT` | Additive migrations `001` -> `002` -> `003` -> `004` | No automated downgrade runner | Essential |
| **SCHEDULER** | `PROVEN_PILOT` | `src/scheduling/task-scheduler.mjs` | Single-process dispatcher | High |
| **WORKER_EXECUTION** | `PROVEN_PILOT` | `src/workers/discovery-worker.mjs` | Single worker instance | High |
| **TASK_RETRY** | `PROVEN_PILOT` | Deterministic backoff & attempt limit tests | In-memory retry ledger | High |
| **LEASE_RECOVERY** | `PROVEN_PILOT` | Lease expiration reclaim in DB | Single coordinator model | High |
| **SECRETS** | `PARTIAL` | Environment variable redaction in logs | No HashiCorp Vault / KMS integration | High |
| **OBSERVABILITY** | `PARTIAL` | TAP test logs & browser console metrics | No Prometheus / Grafana exporter | High |
| **RUNTIME_LIFECYCLE** | `PROVEN_PILOT` | WSL2 background services & node test runners | Process-level lifecycle only | Essential |
| **HEALTH_PROBES** | `PARTIAL` | DB ping in read-model-service | No `/healthz` HTTP endpoint | Essential |
| **WEB_DASHBOARD** | `PROVEN_PILOT` | `src/web/index.html` live metrics | Single-page vanilla HTML/CSS/JS | High |
| **DISCOVERY_FEED** | `PROVEN_PILOT` | Live read model querying PostgreSQL | Fixed 3-item pilot feed | Essential |
| **OPPORTUNITY_DETAIL** | `PROVEN_PILOT` | `WHY_IN_QUEUE` panel & Evidence Ledger | UI rendered from state | Essential |
| **COMPARISON_WORKSPACE**| `PROVEN_PILOT` | Sticky compare bar & modal matrix | Max 4 concurrent comparisons | Medium |
| **LIVE_READ_MODEL** | `PROVEN_PILOT` | `PostgresOpportunityReadService` | Read-only projection | Essential |
| **PORTFOLIO_PERSISTENCE**| `PROVEN_PILOT` | `PostgresPortfolioDecisionStore` | PostgreSQL single-tenant | Essential |
| **DECISION_HISTORY** | `PROVEN_PILOT` | `portfolio_decision_events` append-only | Single-operator actor | High |
| **INVESTIGATION_QUEUE** | `PROVEN_PILOT` | `OperationsPolicyEngine` (P0..P3 bands) | Policy `operations-policy-v1` | High |
| **INVESTIGATION_RESOLUTION**| `PROVEN_PILOT` | `PostgresInvestigationResolutionStore` | PostgreSQL single-tenant | High |
| **REVIEW_CADENCE** | `PROVEN_PILOT` | `review-policy-v1` deterministic evaluation | Operator manual trigger | Medium |
| **RECENT_CHANGES** | `PROVEN_PILOT` | `Since Last Review` UI timeline | In-memory/DB hybrid events | Medium |
| **MULTI_USER_AUTH** | `NOT_PROVEN` | None (Single operator model) | No auth tokens / OAuth / Sessions | **P0_BLOCKER** |
| **RBAC** | `NOT_PROVEN` | None | No roles / permissions | **P0_BLOCKER** |
| **BACKUP** | `NOT_PROVEN` | Local pg_dump manual capability | No automated S3 / WAL archiving | **P1_REQUIRED** |
| **RESTORE** | `NOT_PROVEN` | Local psql restore | No automated DR drill | **P1_REQUIRED** |
| **PRODUCTION_MONITORING**| `NOT_PROVEN` | None | No APM / OpenTelemetry | **P1_REQUIRED** |
| **ALERTING** | `NOT_PROVEN` | None | No PagerDuty / Slack alerts | **P2_HARDENING** |
| **PRODUCTION_DEPLOYMENT**| `NOT_PROVEN` | None (Local WSL2 execution) | No Docker / Kubernetes manifests | **P1_REQUIRED** |
| **HA (HIGH_AVAILABILITY)**| `OUT_OF_SCOPE` | None | Single node architecture | **P3_LATER** |
| **DISASTER_RECOVERY** | `OUT_OF_SCOPE` | None | Single node architecture | **P3_LATER** |

---

## 2. Production Gap Register

| Gap ID | Category | Title | Current State | Missing Proof / Capability | Blocking Level | Recommended Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GAP-001** | Security | Multi-User Authentication & Session Security | `NOT_IMPLEMENTED` | No JWT, OAuth2, or session cookies | `P0_BLOCKER` | Implement OpenID Connect / OAuth2 proxy before multi-user launch. |
| **GAP-002** | Security | Role-Based Access Control (RBAC) | `NOT_IMPLEMENTED` | All operations execute as generic operator | `P0_BLOCKER` | Define `OPERATOR`, `MANAGER`, `ANALYST`, `ADMIN` roles. |
| **GAP-003** | Operations | Automated PostgreSQL Backup & Recovery | `NOT_PROVEN` | No WAL-G / pgBackRest automated backup | `P1_REQUIRED` | Configure automated daily S3 backups and test point-in-time recovery. |
| **GAP-004** | Observability| Production Telemetry & APM | `NOT_PROVEN` | Console logs only; no metrics pipeline | `P1_REQUIRED` | Instrument Prometheus metrics for DB queries and worker latency. |
| **GAP-005** | Deployment | Containerization & Reverse Proxy / TLS | `NOT_PROVEN` | Direct WSL2 HTTP localhost serving | `P1_REQUIRED` | Package in Docker container behind NGINX / Caddy with Let's Encrypt TLS. |
| **GAP-006** | Reliability | Automated Migration Rollback Validation | `MISSING_PROOF` | Additive up-migrations only | `P2_HARDENING` | Create and test transactional downgrade scripts for migrations 001..004. |

---

## 3. Security Posture Assessment

- **SECRETS_STORAGE**: `PARTIAL` (Environment variables; zero credentials in source tree).
- **SECRET_ROTATION**: `NOT_PROVEN` (Manual restart required on credential change).
- **TLS_BOUNDARY**: `NOT_PROVEN` (Local HTTP localhost; TLS termination needed for production).
- **AUTHENTICATION**: `NOT_PROVEN` (Single operator pilot).
- **AUTHORIZATION**: `NOT_PROVEN` (Single operator pilot).
- **INPUT_VALIDATION**: `PROVEN` (Strict bounds: 4000 char notes, 64 char tags, explicit reason codes).
- **SQL_INJECTION_DEFENSE**: `PROVEN` (100% parameterized queries via `$1..$12`; zero string concatenation).
- **CONFIDENTIALITY_PROJECTION**: `PROVEN` (Confidential listing URLs masked in feeds, queues, and modals).
- **LOG_REDACTION**: `PROVEN` (Secrets automatically redacted in worker error logs).
