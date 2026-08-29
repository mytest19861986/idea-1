# REV-API-002 — Exact review packet

## Review target

Implementation commit: 2dfc4619621d01740bcb747e44a2a1bcae34ca64

This packet reviews the local Fastify read-only adapter introduced by PKG-API-002. It is not a substitute for the implementation: each target below is the exact SHA-pinned source artifact.

## Exact artifacts

- src/api/server.mjs
- src/api/read-provider.mjs
- src/api/read-contract.mjs
- test/api-server.test.mjs
- docs/ai/TASK_CONTRACTS/PKG-API-002.md

## Required review questions

1. Does the HTTP adapter consume, rather than duplicate, the PKG-API-001 list and public-model contracts?
2. Are only GET health/list/detail routes available, with no write, database, authentication, AI, Telegram, scoring, or external-network side effect?
3. Is the in-memory provider explicit and impossible to select as a hidden production fallback?
4. Are malformed input, unavailable record, and unexpected error mappings appropriate?
5. Do the baseline response headers reduce browser exposure without changing public semantics?

## Evidence at implementation time

- 37 Node tests PASS.
- lint PASS.
- typecheck PASS.
- build PASS.
- git diff --check PASS.

## Transport rule

After this file is committed and pushed, the reviewer must receive SHA-pinned GitHub Raw URLs only. The URLs must be verified before sending. External review remains unsent while the approved exact Qwen tab is unavailable.
