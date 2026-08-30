# TASK CONTRACT: PKG-SECRETS-016

## 1. Overview
- **Package ID**: `PKG-SECRETS-016`
- **Title**: Credential Resolution, Secret Injection Boundary & Environment Isolation
- **Role**: Security & Secrets Architect (GLM-5.3 & Antigravity)
- **Status**: Implemented & Verified

---

## 2. Invariants & Secret Injection Specifications
1. **SEC-I001 & SEC-I002 (SecretResolver Port)**: Versioned facade (`secrets-contract-v1`) decoupling domain logic from credential storage backends.
2. **SEC-I003 & SEC-I004 (Purpose Binding & Environment Isolation)**: Explicit allowlist policies gating access strictly by `credentialRef`, `purpose`, and `environment` (fail-closed on unknown or unauthorized requests).
3. **SEC-I005 & SEC-I007 (Allowlisted Environment Provider)**: `EnvironmentSecretProvider` strictly maps known logical refs to env vars and rejects arbitrary env var lookups.
4. **SEC-I008 through SEC-I016 (Secret-Free Boundaries)**: `WorkerTask`, `SchedulerState`, `SourceRecord`, `Persistence`, and `Telemetry` payloads never contain raw secret material.
5. **SEC-I017 through SEC-I020 (Value-Aware Dynamic Redaction)**: Dynamically registers resolved secrets with `registerSecretForRedaction` to ensure runtime errors and log messages mask raw values.
6. **SEC-I021 & SEC-I022 (No Long-Lived Cache & Rotation)**: `SECRET_VALUE_CACHE=NO`, enabling zero-downtime credential rotation.
7. **SEC-I031 (Presence Check API)**: Exposes `checkSecretPresence` (`AVAILABLE`, `MISSING`, `DENIED`) without exposing secret values.
8. **SEC-I034 (Source Agnostic)**: Zero source-specific conditionals (`no if sourceId === "trustmrr"`).
