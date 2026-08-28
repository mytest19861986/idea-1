# Known issues

## Local persistence is single-process only

The source registry and delivery idempotency guard use atomic local JSON snapshots plus JSONL audit trails. They are appropriate for development and deterministic tests, but do not provide multi-process or distributed concurrency guarantees. A production database transaction boundary is required before deploying adapters or workers.
