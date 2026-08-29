# API Contracts

## Delivery persistence gap

The current in-process delivery request has no public HTTP representation and carries no `publicationRevision`. Before production delivery persistence is implemented, the delivery request contract must explicitly provide a revision identity that is stable across retry attempts.

## Current state

No HTTP server, route, authentication middleware, public API schema, or browser-facing API exists.

Current executable contracts are internal ESM functions only:

- source lifecycle, intake, evaluation, and local source persistence;
- collector normalization and deterministic deduplication;
- evidence, traction, scoring, and localization primitives;
- publication record and authorization primitives;
- side-effect-free delivery request/result contracts.

## Future HTTP boundary

Before introducing an HTTP adapter, define versioned request/response schemas, authentication and authorization policy, request-size limits, rate limits, error representation, idempotency behavior, audit fields, and observability requirements. The HTTP adapter must invoke core contracts rather than redefine their rules.
