# Known issues

## Local persistence is single-process only

The source registry and delivery idempotency guard use atomic local JSON snapshots plus JSONL audit trails. They are appropriate for development and deterministic tests, but do not provide multi-process or distributed concurrency guarantees. A production database transaction boundary is required before deploying adapters or workers.

## PostgreSQL integration environment is unavailable

`PKG-DB-DEL-001` has `SCHEMA_DESIGNED` and a pure identity harness, but `DB_INTEGRATION_NOT_EXECUTED`. Docker is unavailable and neither `psql` nor `pg_isready` is installed. Future database tests must remain `NOT_RUN_ENVIRONMENT_BLOCKER` until a disposable PostgreSQL environment is provided.
