# TASK CONTRACT: PKG-PERSIST-011R

## 1. Overview
- **Package ID**: `PKG-PERSIST-011R`
- **Title**: Discovery Core Production Persistence Contract (Remediated)
- **Role**: Backend Systems Architect & Persistence Lead (GLM-5.3 & Antigravity)
- **Status**: Remediated & Verified

---

## 2. Invariants & Remediation Specifications
1. **CANDIDATE_IDENTITY_MODEL**: Authoritative identity is `discovery_id` (`id` PRIMARY KEY). Global `UNIQUE(canonical_url)` removed.
2. **IDEMPOTENCY_SCOPE**: Matches domain contract `(candidate_id, source_id, idempotency_key)` on `discovery_candidate_attributions`.
3. **OBSERVATION_LEDGER_MODEL**: Append-only with deterministic uniqueness on `observation_id`.
4. **HEALTH_SNAPSHOT_REPLAY_SEMANTICS**: Deterministic replay of same window + versions yields `REPLAYED`, while different windows produce append-only history (`STORED`).
5. **GOVERNANCE_APPLICATION_MODEL**: Decoupled from decisions; append-only audit trail capturing all application attempts (`APPLIED`, `REPLAYED`, `STALE_DECISION`, `BLOCKED`).
6. **EVIDENCE_CLASSIFICATION**:
   - `SQL_STATIC_VALIDATION=PASS`
   - `MIGRATION_EXECUTED=NO` (`MIGRATION_EXECUTION_STATUS=ENVIRONMENT_BLOCKED`)
   - `PERSISTENCE_CONTRACT_TESTS=PASS`
   - `POSTGRES_INTEGRATION_TESTS=NOT_RUN` (`POSTGRES_INTEGRATION_STATUS=ENVIRONMENT_BLOCKED`)
   - `CONCURRENCY_DESIGN=DEFINED`
   - `CONCURRENCY_PROOF=NOT_RUN` (`CONCURRENCY_PROOF_STATUS=ENVIRONMENT_BLOCKED`)
   - `RUNTIME_PROOF_BLOCKER=DISPOSABLE_POSTGRESQL_UNAVAILABLE`
