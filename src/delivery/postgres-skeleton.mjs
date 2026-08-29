import { deliveryIdentity } from "./identity.mjs";

export const PostgresDeliverySql = Object.freeze({
  ensureRequest: "INSERT INTO delivery_requests (opportunity_id, publication_revision, channel, idempotency_key, requested_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (opportunity_id, publication_revision, channel, idempotency_key) DO NOTHING",
  lockClaim: "SELECT * FROM delivery_claims WHERE delivery_request_id = $1 FOR UPDATE",
  attempts: "INSERT INTO delivery_attempts (delivery_request_id, attempt_number) VALUES ($1,$2)",
  result: "INSERT INTO delivery_results (delivery_attempt_id, status, occurred_at, channel_reference, failure_code) VALUES ($1,$2,$3,$4,$5)"
});

export function createPostgresDeliverySkeleton() {
  return Object.freeze({
    ensureRequestIdentity(input) { return deliveryIdentity(input); },
    tryAcquireClaim(identity, worker, now, leaseDurationMs) {
      const normalized = deliveryIdentity(identity);
      if (typeof worker !== "string" || !worker.trim()) throw new TypeError("worker is required");
      if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) throw new TypeError("leaseDurationMs must be positive");
      const at = new Date(now); if (Number.isNaN(at.valueOf())) throw new TypeError("now must be a valid timestamp");
      return Object.freeze({ operation: "ATOMIC_POSTGRES_CLAIM", identity: normalized, worker: worker.trim(), claimedAt: at.toISOString(), leaseExpiresAt: new Date(at.valueOf() + leaseDurationMs).toISOString(), requiresTransaction: true, requiresRowLock: true });
    }
  });
}
