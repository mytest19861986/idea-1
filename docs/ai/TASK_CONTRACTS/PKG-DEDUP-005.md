# TASK CONTRACT: PKG-DEDUP-005

## 1. Overview
- **Package ID**: `PKG-DEDUP-005`
- **Title**: Cross-Source Discovery Deduplication & Entity Resolution
- **Role**: Backend & Infrastructure Lead (GLM-5.3 & Antigravity), Signal Research (Gemini 3.7 Flash), Semantics Review (Qwen 3.8 Max)
- **Status**: Implemented & Verified

---

## 2. Entity Resolution Invariants & Hard Rules
1. **DEDUP-I001 (Candidate Immutability & Preservation)**: Original `CandidateDiscoveryRecord` objects are never mutated or deleted. Entity resolution purely references immutable discovery IDs.
2. **DEDUP-I002 (Deterministic Strong Matching)**: Matching operates on deterministic rule evaluation:
   - `CONFIRMED_MATCH`: Only when exact strong stable identifier matches OR exact canonical domain matches with zero material contradictions.
   - `POSSIBLE_MATCH` / `PROBABLE_MATCH`: Cannot automatically merge candidates into a cluster.
   - Same name alone or description similarity: `FORBIDDEN` from auto-confirming.
3. **DEDUP-I003 (Evidence Trail & Provenance)**: Every resolution decision captures full signals, contradictions, rule version (`entity-resolution-v1`), confidence, and explicit timestamp.
4. **DEDUP-I004 (Contradiction Handling)**: Material contradictions (conflicting domains, mismatched external IDs) prevent auto-merge and yield `CONFIRMED_DISTINCT` or `PROBABLE_MATCH`.
5. **DEDUP-I005 (Confidentiality Protection)**: Pairing a confidential candidate with a public candidate results in `BLOCKED_CONFIDENTIAL` to protect stealth entities from deanonymization.
6. **DEDUP-I006 (Source Independence & Multi-Source Clusters)**: No single source owns entity truth; clusters aggregate distinct multi-source member IDs and source identities.
7. **DEDUP-I007 (Deterministic Authority)**: Rule-based deterministic policies make all auto-link decisions without reliance on runtime LLM calls (`AI_CALLS=0`).
8. **DEDUP-I008 (Rule Versioning)**: Explicitly tagged with `ruleVersion="entity-resolution-v1"`.
9. **Pair Order Independence**: `(A, B) == (B, A)` via lexicographic pair key computation (`computePairIdentity`).
10. **Cluster Identity Impartiality**: Cluster ID generated from domain seed/pair key (`computeClusterIdentity`), never tied to the first source (`FIRST_SOURCE_MUST_NOT_OWN_CLUSTER_IDENTITY`).
