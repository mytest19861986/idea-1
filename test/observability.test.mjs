import test from "node:test";
import assert from "node:assert/strict";
import { createObservableEvent } from "../src/observability/event.mjs";

test("observable events are immutable and reject secret-like or nested metadata", () => {
  const event = createObservableEvent({ type: "delivery_attempted", correlationId: "delivery-o-1", occurredAt: "2026-08-28T00:00:00Z", metadata: { channel: "WEB", attempt: 1 } });
  assert.deepEqual(event, { schemaVersion: 1, type: "DELIVERY_ATTEMPTED", correlationId: "delivery-o-1", occurredAt: "2026-08-28T00:00:00.000Z", metadata: { attempt: 1, channel: "WEB" } });
  assert.equal(Object.isFrozen(event.metadata), true);
  assert.throws(() => createObservableEvent({ type: "x", correlationId: "y", occurredAt: "2026-08-28T00:00:00Z", metadata: { apiKey: "not-allowed" } }), /not allowed/);
  assert.throws(() => createObservableEvent({ type: "x", correlationId: "y", occurredAt: "2026-08-28T00:00:00Z", metadata: { payload: {} } }), /finite scalars/);
});
