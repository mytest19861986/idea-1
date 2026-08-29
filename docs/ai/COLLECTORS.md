# Collectors

## Current state

No network collector is implemented. The repository currently accepts manual HTTPS source hints and normalizes already-collected items into a versioned internal shape.

Coverage gaps can be assessed from the declared segments of `ACTIVE` sources. The assessment is planning-only: it does not discover, activate, or collect from a source.

Collector implementations must return a source-isolated batch through `normalizeCollectorBatch`. That boundary validates the collection time and delegates each item to HTTPS-only normalization; it does not fetch, retry, deduplicate, persist, or activate sources.

## Constraints for future collectors

Collectors must respect source access policy, normalize only attributable payloads, prevent unsafe URL admission, emit observable failures, and remain separate from source activation governance. No collector may silently promote a source to active production use.
