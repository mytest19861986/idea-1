# Architecture

The repository is a modular Node.js ESM monolith. Core modules currently have no third-party runtime dependencies.

```text
Source registry / collection
          ↓
Normalization / deduplication
          ↓
Evidence / traction / scoring / localization
          ↓
Publication record / authorization
          ↓
Delivery request / result contracts
          ↓
Future persistence adapter / Web adapter / Telegram adapter
```

Delivery persistence has a Commander-directed production boundary: core contracts depend on an abstraction, while a PostgreSQL adapter owns database mechanics. No production persistence adapter or external delivery adapter exists yet.
