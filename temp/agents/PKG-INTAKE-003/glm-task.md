# PKG-INTAKE-003: Controlled Discovery Intake & Registry Transition Task Brief

**Package**: `PKG-INTAKE-003`  
**Title**: Controlled Discovery Intake & Registry Transition  
**Role**: Backend & Infrastructure Lead (Primary Implementer)  
**Mode**: Contract Implementation & Dry-Run  

---

## 1. Objective & Architectural Boundaries
Implement the generic, controlled Discovery Intake boundary that converts validated `RawDocument` objects into immutable `CandidateDiscoveryRecord`s:
- **Generic Architecture**: NO source-specific hardcoding (TrustMRR is used purely as a test fixture).
- **NO Database Mutation**: Operates purely in-memory / contract level.
- **NO Source Activation**: Sources remain in their defined lifecycle states (e.g., `APPROVED`).
- **NO Scheduler / NO Network Calls / NO Scoring / NO AI**: Purely deterministic intake pipeline.

---

## 2. Ingestion Pipeline Specification
```
RawDocument
   ↓
1. Intake Validation (validate RawDocument structure, canonical HTTPS URL, timestamps)
   ↓
2. Source Eligibility Check (verify sourceId exists in SourceRegistry store & check SourceStatus)
   ↓
3. Source State Gate (allow only APPROVED or ACTIVE sources; reject CANDIDATE/REJECTED/RETIRED)
   ↓
4. Deterministic Identity & Dedup (compute deterministic discoveryId and idempotencyKey)
   ↓
5. Candidate Discovery Record Generation (preserve SOURCE_CLAIM, provenance, confidential flags)
   ↓
6. Deterministic Audit Event Generation
```

---

## 3. Required File Targets
1. `src/discovery/discovery-intake.mjs` (or `src/collection/discovery-intake.mjs`):
   - `intakeRawDocument(rawDoc, { sourceRecord, actor, processedAt })`: Pure functional intake evaluator returning `{ ok: true, discoveryRecord, auditEvent }` or `{ ok: false, rejectionReason }`.
   - `validateRawDocumentSchema(rawDoc)`: Strict structural validation.
   - `isSourceEligibleForIntake(sourceStatus)`: State gate (`APPROVED` and `ACTIVE` return true; all others false).
   - `buildDiscoveryRecord(rawDoc, { sourceRecord, processedAt })`: Builds frozen `CandidateDiscoveryRecord`.
   - `createDiscoveryAuditEvent({ discoveryRecord, sourceRecord, actor, eventType, timestamp })`: Builds frozen audit event.

2. `test/discovery-intake.test.mjs`:
   - Unit tests covering:
     - Valid RawDocument intake
     - Source status gating (rejecting `CANDIDATE`, `REJECTED`, `RETIRED`)
     - Deterministic ID and idempotency
     - Invariant preservation (`SOURCE_CLAIM`, provenance, confidential isolation)
     - Audit event emission
     - TrustMRR sample fixture dry-run

3. `docs/ai/TASK_CONTRACTS/PKG-INTAKE-003.md`:
   - Contract documentation.
