# PKG-API-002 — Local read-only HTTP adapter

## Scope

Provide Fastify bootstrap plus GET /health, GET /api/v1/opportunities, and GET /api/v1/opportunities/:slug. The adapter consumes PKG-API-001 contracts, maps malformed requests to a stable error shape, and sets a baseline of browser security headers.

OpportunityReadProvider is injected. createInMemoryOpportunityReadProvider is explicit development/test-only data; no default provider exists, so production cannot silently use mock records.

## Exclusions

No database connection/query, authentication, write route, AI call, Telegram integration, score recalculation, external network side effect, or production fallback data is included.

## Validation

Use Fastify injection tests for health, list/detail serialization, pagination/filter validation, missing-resource mapping, no write endpoint, provider requirement, and headers. Runtime listening is intentionally left to a future composition package.

