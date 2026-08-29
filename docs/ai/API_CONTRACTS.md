# API Contracts

## Delivery persistence boundary

The current in-process delivery request is not an HTTP API, but it carries a required positive-integer `publicationRevision`. The revision is stable across retry attempts and participates in delivery idempotency. A future public adapter must preserve that identity rather than infer it.

## Current state

A local, read-only Fastify adapter exists in src/api/server.mjs. It exposes GET /health, GET /api/v1/opportunities, and GET /api/v1/opportunities/:slug.

It consumes parseOpportunityListQuery and toPublicOpportunity from the contract layer; it does not calculate scores or issue database queries. The adapter requires an injected OpportunityReadProvider. The only included implementation is explicit in-memory development/test data; production has no hidden fallback provider.

The adapter has no authentication, mutation route, AI call, Telegram coupling, or network side effect. Its baseline response headers are CSP, nosniff, frame denial, and no-referrer.

Current executable contracts are internal ESM functions only:

- source lifecycle, intake, evaluation, and local source persistence;
- collector normalization and deterministic deduplication;
- evidence, traction, scoring, and localization primitives;
- publication record and authorization primitives;
- side-effect-free delivery request/result contracts.

## Remaining HTTP boundary

Before production exposure, add explicit authentication/authorization policy, request-size and rate limits, audit fields, observability, durable provider integration, process lifecycle, and deployment configuration. The HTTP adapter must continue to invoke core contracts rather than redefine their rules.
