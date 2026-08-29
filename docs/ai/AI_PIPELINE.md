# AI Pipeline

## Current boundary

No provider integration exists. AI-originated analysis must remain explicitly classified and cannot self-verify.

`normalizeAiExtraction` validates provider-labelled, prompt-versioned extracted claims before they can be used downstream. It is a schema boundary only; provider invocation, prompt storage, persistence, and evaluation remain unimplemented.

## Current state

No AI provider adapter, extraction prompt, model call, evaluation dataset, response persistence, or AI-driven publication authority exists in the repository.

The existing evidence and scoring primitives are deterministic and dependency-free. Any future AI extraction adapter must produce attributable structured inputs for those boundaries; it must not directly activate sources, authorize publication, or mutate delivery state.

## Governance

AI outputs require validation, provenance, and evaluation before they may influence a user-visible record. A model is not a final publication authority.
