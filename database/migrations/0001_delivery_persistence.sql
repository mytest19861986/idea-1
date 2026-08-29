-- PKG-DB-DEL-001 design artifact. Do not run against production.
-- Apply only through an approved, disposable PostgreSQL integration environment.

CREATE TABLE delivery_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id TEXT NOT NULL CHECK (btrim(opportunity_id) <> ''),
  publication_revision INTEGER NOT NULL CHECK (publication_revision > 0),
  channel TEXT NOT NULL CHECK (channel IN ('WEB', 'TELEGRAM')),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  requested_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT delivery_requests_idempotency_key UNIQUE (opportunity_id, publication_revision, channel, idempotency_key)
);

CREATE TABLE delivery_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_request_id BIGINT NOT NULL REFERENCES delivery_requests(id) ON DELETE RESTRICT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  CONSTRAINT delivery_attempts_request_number UNIQUE (delivery_request_id, attempt_number)
);

CREATE TABLE delivery_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_attempt_id BIGINT NOT NULL UNIQUE REFERENCES delivery_attempts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('DELIVERED', 'FAILED')),
  occurred_at TIMESTAMPTZ NOT NULL,
  channel_reference TEXT,
  failure_code TEXT,
  CONSTRAINT delivery_results_shape CHECK (
    (status = 'DELIVERED' AND channel_reference IS NOT NULL AND failure_code IS NULL) OR
    (status = 'FAILED' AND failure_code IS NOT NULL AND channel_reference IS NULL)
  )
);
