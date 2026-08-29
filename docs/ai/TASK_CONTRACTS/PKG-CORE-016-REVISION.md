# PKG-CORE-016 — Publication revision reconciliation

`publicationRevision` is a required positive integer. Approval and delivery bind to the exact revision, and idempotency identity is `(opportunityId, publicationRevision, channel, idempotencyKey)`. A changed revision cannot inherit an earlier approval.
