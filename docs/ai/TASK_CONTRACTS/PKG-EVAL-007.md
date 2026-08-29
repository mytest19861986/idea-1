# TASK CONTRACT: PKG-EVAL-007

## 1. Overview
- **Package ID**: `PKG-EVAL-007`
- **Title**: Source Health Assessment & Performance Feedback Loop
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Health Assessment Boundaries
1. **EVAL-I001 (Source Health != Source Quality)**: Evaluates technical availability, transport reliability, and observation yields separately from inherent content quality.
2. **EVAL-I002 (Read-Only Evaluation)**: Does NOT directly mutate SourceRegistry lifecycle state or database records. Emits a deterministic `SourceHealthSnapshot` and explicit governance recommendation.
3. **EVAL-I003 (Deterministic & Versioned)**: Versioned under `evaluatorVersion="source-health-v1"`; replay on identical observations yields 100% identical snapshots.
4. **EVAL-I004 (Explicit Timing Context)**: Requires mandatory ISO timestamp `evaluatedAt`; zero hidden wall-clock reads.
5. **EVAL-I005 (Explicit Findings & Recommendations)**: Generates structured findings (`RATE_LIMIT_ENCOUNTERED`, `CRITICAL_FAILURE_RATE`, `HIGH_FAILURE_RATE`, `ZERO_DISCOVERY_YIELD`, `OPERATIONAL_NORMAL`) and governance recommendations (`MAINTAIN_ACTIVE`, `DEGRADE_RECOMMENDED`, `PAUSE_RECOMMENDED`, `RETIRE_RECOMMENDED`, `MONITOR_CONTINUED`).
6. **EVAL-I006 (Deep Immutability)**: All returned snapshots and metric objects are deep-frozen.
