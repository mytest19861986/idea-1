import test from "node:test";
import assert from "node:assert/strict";
import { deliveryIdentity } from "../src/delivery/identity.mjs";

test("delivery identity separates revision and channel while rejecting malformed values", () => {
  const base = { opportunityId: "o-1", publicationRevision: 1, channel: "web", idempotencyKey: "k" };
  assert.equal(deliveryIdentity(base).channel, "WEB");
  assert.notEqual(deliveryIdentity(base).key, deliveryIdentity({ ...base, publicationRevision: 2 }).key);
  assert.notEqual(deliveryIdentity(base).key, deliveryIdentity({ ...base, channel: "TELEGRAM" }).key);
  assert.throws(() => deliveryIdentity({ ...base, publicationRevision: 0 }), /positive integer/);
});
