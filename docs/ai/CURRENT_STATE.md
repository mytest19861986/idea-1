# Current State

## Active package

`PKG-CORE-017` — deterministic opportunity ranking.

## Evidence

- `git ls-remote https://github.com/mytest19861986/idea-1.git` returned successfully with no refs.
- `git clone https://github.com/mytest19861986/idea-1.git .` completed with Git's empty-repository warning.
- The worktree is on an unborn `main` branch with no commits.
- Node and npm are unavailable on the current PATH, but the workspace supplies a bundled Node.js runtime and pnpm executable.
- A dependency-free source-registry core implements candidate evaluation, constrained lifecycle changes, persistent JSON state, and append-only audit events.
- Collector normalization converts safe source payloads into versioned internal records.
- Deduplication separates repeated `(sourceId, externalId)` records deterministically before analysis.
- Evidence records validate attributable observations: opportunity, source, collected item, HTTPS URL, timestamp, type, strength, and confidence.
- Traction is an explainable confidence-weighted aggregate, retaining evidence count, source count, and latest observation timestamp.
- Scoring accepts caller-owned factors and exactly-totaling weights, and returns every weighted contribution for auditability; it defines no default product policy.
- Localization templates require an explicit locale and complete scalar placeholders, without AI translation or silent locale fallback.
- Publication-ready records retain localized content, bounded score, timestamp, and sorted attributable citations, but always remain `DRAFT`.
- An explicit attributable approval can change only a `DRAFT` publication record to `APPROVED`; it emits an audit event but does not dispatch externally.
- Delivery requests accept only approved records, explicitly target `WEB` or `TELEGRAM`, and require an idempotency key; they still cause no delivery side effect.
- Delivery results distinguish `DELIVERED` references from explicit `FAILED` codes; result creation performs no retry or channel call.
- Local delivery idempotency claims are persisted atomically and duplicate `(channel, idempotencyKey)` requests are refused in one process; the documented implementation is not safe for distributed production concurrency.
- Local quality commands passed: tests (21), lint, typecheck, build, and `git diff --check`.
- Qwen independent review for `PKG-CORE-014` returned `BLOCKED`: the reviewer had no repository artifact access and could not verify the supplied summary. This is not an approval or a test failure.
- Source health assessment derives a caller-thresholded descriptive status from collection outcomes without changing source lifecycle state.
- Opportunity ranking sorts bounded scores deterministically with an explicit stable tie-break and rank.
- Latest local quality run: tests (23), lint, typecheck, build, and `git diff --check` passed.

## Constraints

- No production deployment, merge, push, destructive Git operation, or secret modification has been performed.
- No application feature, database, external collector, AI integration, web surface, or Telegram delivery exists yet.

## Next action

Commit and push the prepared review evidence when Git author identity is supplied; PostgreSQL integration remains environment-blocked. No external delivery adapter may be added yet.
