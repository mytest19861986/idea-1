import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresDeliverySkeleton } from "../src/delivery/postgres-skeleton.mjs";
test("postgres skeleton exposes atomic claim semantics without a connection", () => {
 const adapter=createPostgresDeliverySkeleton(); const claim=adapter.tryAcquireClaim({ opportunityId:"o", publicationRevision:1, channel:"WEB", idempotencyKey:"k" },"worker", "2026-01-01T00:00:00Z",1000);
 assert.equal(claim.requiresTransaction,true); assert.equal(claim.requiresRowLock,true); assert.throws(()=>adapter.tryAcquireClaim({ opportunityId:"o", publicationRevision:0, channel:"WEB", idempotencyKey:"k" },"w","2026-01-01",1),/positive integer/);
});
