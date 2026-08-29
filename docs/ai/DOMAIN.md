# Domain

## Market assessment

A market assessment is an attributable planning record for an opportunity. It retains observed competitors, explicit risks and mitigations, and caller-proposed MVP scope. It is not a score, a publication approval, or an automatic product decision.

## Source states

Sources progress through constrained lifecycle transitions. Discovery and candidate intake never directly activate a source.

## Opportunity evidence

Evidence is an attributable observation linked to an opportunity, source, collected item, HTTPS URL, timestamp, type, strength, and confidence. Traction is a descriptive aggregate of such records.

## Publication states

The implemented publication state flow is `DRAFT → APPROVED`. Approval has actor, reason, timestamp, and an audit event. Delivery is a separate concern and does not infer publication state.

## Delivery states

The implemented contract distinguishes a request from its `DELIVERED` or `FAILED` result. Commander requires the durable persistence package to model `NEW`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL`, and `RETRY_EXHAUSTED` before external adapters are introduced.
