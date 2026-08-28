# Relevant test source: test/source-registry.test.mjs

```js
test("delivery results distinguish delivered references from retryable failures", () => {
  const approved = approvePublication(createPublicationRecord({ opportunityId: "o-1", locale: "en", title: "T", summary: "S", score: 50, generatedAt: "2026-08-28T00:00:00Z", citations: [{ sourceId: "a", collectedItemId: "1", url: "https://a.test/1" }] }), { actor: "editor", reason: "REVIEW", approvedAt: "2026-08-28T01:00:00Z" }).record;
  const request = createDeliveryRequest(approved, { channel: "WEB", idempotencyKey: "web-o-1", requestedAt: "2026-08-28T02:00:00Z" });
  assert.deepEqual(createDeliveryResult(request, { status: "delivered", occurredAt: "2026-08-28T02:01:00Z", channelReference: "page-o-1" }), { schemaVersion: 1, opportunityId: "o-1", channel: "WEB", idempotencyKey: "web-o-1", status: "DELIVERED", occurredAt: "2026-08-28T02:01:00.000Z", channelReference: "page-o-1" });
  assert.deepEqual(createDeliveryResult(request, { status: "FAILED", occurredAt: "2026-08-28T02:01:00Z", failureCode: "NETWORK_TIMEOUT" }).failureCode, "NETWORK_TIMEOUT");
  assert.throws(() => createDeliveryResult(request, { status: "DELIVERED", occurredAt: "2026-08-28T02:01:00Z" }), /channelReference/);
});
```

Known coverage gap: missing failureCode, invalid occurredAt, and malformed request fields lack direct tests; reviewer should treat them as unverified, not passed.
