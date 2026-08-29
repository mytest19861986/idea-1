# Roadmap

1. Complete independent review and remediation for the published CORE-016 and CORE-020 through CORE-024 evidence bundles. External review transport is currently parked.
2. Provide a disposable PostgreSQL environment, then implement PostgreSQL-backed delivery persistence, migrations, and integration tests (`PKG-DB-DEL-001`).
3. Implement a minimal authenticated Web vertical slice over the approved delivery/persistence boundary.
4. Add Telegram delivery only after durable delivery state and auditability are proven.
5. Add AI provider adapters with evaluations and provenance; the existing AI module is validation-only.
6. Enable and verify remote CI, then add deployment configuration, security hardening, and rollback readiness before V1 release.

This is an execution roadmap, not evidence that the listed work is complete.
