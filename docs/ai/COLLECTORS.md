# Collectors

## Current state

No network collector is implemented. The repository currently accepts manual HTTPS source hints and normalizes already-collected items into a versioned internal shape.

## Constraints for future collectors

Collectors must respect source access policy, normalize only attributable payloads, prevent unsafe URL admission, emit observable failures, and remain separate from source activation governance. No collector may silently promote a source to active production use.
