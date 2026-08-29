# PKG-CORE-022 — AI extraction validation boundary

## Objective

Validate a provider-produced extraction as explicit, versioned, non-authoritative structured data before any persistence or downstream decision.

## Invariants

- Provider, prompt version, and extraction timestamp are explicit and validated.
- Each extracted claim is classified through the existing claim boundary.
- Facts require evidence IDs; AI claims cannot self-declare verification.
- Extraction validation has no provider call, persistence write, scoring effect, publication action, or delivery side effect.
