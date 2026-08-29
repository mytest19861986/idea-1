# PKG-API-001 — Public read API contract

Define versioned, read-only contracts for health and publication-eligible opportunity delivery. No HTTP server, database access, authentication implementation, mutation, AI call, scoring, or Telegram integration is in scope.

Required routes: `GET /health`, `GET /api/v1/opportunities`, and `GET /api/v1/opportunities/:slug`.

Only explicit public read models may cross the boundary. Contracts must include pagination, filters, sorting, errors, fact/inference representation, citations, rate-limit policy, and security-header requirements.
