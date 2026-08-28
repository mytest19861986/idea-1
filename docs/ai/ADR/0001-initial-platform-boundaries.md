# ADR 0001: Initial platform boundaries

**Status:** Proposed

## Context

The repository is empty. The V1 objective requires source discovery and lifecycle management, collection, evidence-driven analysis, deterministic scoring, ranking, publication, Telegram delivery, and observability.

## Decision

Start as a modular monolith with explicit boundaries for:

1. source registry and source lifecycle;
2. collection and normalization;
3. evidence and opportunity records;
4. AI extraction behind provider adapters;
5. deterministic scoring and ranking;
6. publication channels (web and Telegram);
7. observability and audit records.

Provider adapters must not contain core domain policy. Unknown sources remain candidates until they pass quality, access, safety, and governance checks.

## Consequences

- This is a proposed baseline, not an accepted production architecture.
- A selected runtime, database, and deployment target are still required before executable implementation.
- The boundaries allow individual collectors and AI providers to be added or disabled without rewriting the core opportunity domain.
