# DISCOVERY CORE INVARIANT REGISTER

This register consolidates all verified invariants across `PKG-001` through `PKG-009`.

## 1. Source Registry & Lifecycle Invariants
- `SRC-I001`: Unknown sources cannot become active directly.
- `SRC-I002`: Approved sources enter active state only through explicit transition.
- `SRC-I003`: Store rejects duplicate source identifiers.
- `SRC-I004`: State transitions produce immutable audit events.

## 2. Intake & Provenance Invariants
- `INTAKE-I001`: Candidate normalizes without activating the source.
- `INTAKE-I002`: Fails closed on insecure HTTP URLs, duplicate canonical URLs, or missing required timestamps.
- `INTAKE-I003`: Ineligible source status immediately rejects intake without mutation.
- `INTAKE-I004`: Deep recursive isolation for confidential candidate listings (`TRUSTMRR-G003`).
- `INTAKE-I005`: Preserves raw collector claims (`TRUSTMRR-G001 / SOURCE_CLAIM`) without fabricating provenance.

## 3. Storage & Resolution Invariants
- `STORE-I001`: Candidate ID generation is deterministic and content-addressed.
- `STORE-I002`: Append-only attribution trail preserved across repeated updates.
- `DEDUP-I001`: Order-independent pair identity: `(A, B) === (B, A)`.
- `DEDUP-I002`: Verified domain match yields `CONFIRMED_MATCH`; differing verified domains yield `CONFIRMED_DISTINCT`.
- `DEDUP-I003`: Zero AI hallucination authority in matching; AI hypotheses remain `POSSIBLE_MATCH`.
- `DEDUP-I004`: Cross-confidentiality linkage is strictly `BLOCKED_CONFIDENTIAL`.

## 4. Pipeline & Control Plane Invariants
- `PIPELINE-I001`: Sequential execution: `Intake -> Store -> Resolution`.
- `PIPELINE-I002`: Fail-closed downstream gating (rejection at intake leaves store/resolution `NOT_RUN`).
- `EVAL-I001`: Explicit observation window intervals (`windowStart`, `windowEnd`).
- `EVAL-I002`: Sample sufficiency confidence gating (`NONE`, `LOW`, `MEDIUM`, `HIGH`).
- `EVAL-I003`: Orthogonal operational health vs intelligence contribution metrics.
- `GOV-I001`: Reuses canonical `SourceStatus`.
- `GOV-I003`: Automation restricted strictly to reversible operational transitions (`ACTIVE <-> DEGRADED/LOW_PRIORITY/PAUSED`).
- `GOV-I010 & GOV-I011`: Strict prohibition of automated activation (`APPROVED -> ACTIVE`) or automated rejection/retirement (`* -> REJECTED/RETIRED`).
- `GOV-I013`: Evaluation is pure and read-only; mutations executed via `SourceGovernanceApplier`.
- `GOV-I014`: Optimistic state check rejects stale decisions (`STALE_DECISION`).
- `GOV-I015`: Idempotent decision replay by `decisionId`.

## 5. End-to-End Orchestration Invariants
- `E2E-I001`: Data Plane and Control Plane decoupling.
- `E2E-I002`: Controlled observation generation with deterministic `observationId`.
- `E2E-I003`: Observations never leak sanitized confidential URLs or domains.
- `E2E-I004`: Source state changes immediately gate future intake.
- `E2E-I005`: Historical candidate records remain immutable after source state changes.
- `E2E-I014`: Full system replay idempotency.
- `E2E-I018`: Generic execution with zero source-specific hardcoding.
