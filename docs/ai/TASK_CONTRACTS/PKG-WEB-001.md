# PKG-WEB-001 — Web Intelligence Terminal

Create a Next.js read-only presentation shell over API/read-model contracts.

## In scope

- global layout, navigation, dashboard shell;
- list and detail route shells;
- loading, empty, and error states;
- responsive and RTL-ready structure;
- fact/inference, score/confidence, and evidence presentation primitives;
- explicit read-only API client abstraction.

## Out of scope

Authentication, writes, database access, AI/Gemini calls, Telegram, subscriptions, admin, bookmarks, saved searches, and deployment.

## Invariants

The web layer renders API/read models. It is not a scoring engine, publication authority, evidence verifier, or direct database client.
