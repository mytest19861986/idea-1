# PKG-CORE-014 external review bundle

## Artifact identity

- Package: `PKG-CORE-014`
- Review task: `REV-CORE-014`
- Git state at evidence capture: all project files are untracked on unborn `main`; remote has no baseline ref. Therefore a meaningful `git diff` does not yet exist.
- Intended transport after commit and push: exact GitHub raw URL of this file.

## Scope

- `DELIVERED` must require `channelReference`.
- `FAILED` must require `failureCode`.
- Result must retain request provenance and validate timestamp/status.
- Result creation must not persist, retry, call a network service, or mutate publication state.

## Exact source: `src/delivery/result.mjs`

```js
const DeliveryStatus = Object.freeze({ DELIVERED: "DELIVERED", FAILED: "FAILED" });

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

export { DeliveryStatus };

export function createDeliveryResult(request, input) {
  if (!request || typeof request !== "object") throw new TypeError("delivery request is required");
  requiredString(request.opportunityId, "request.opportunityId");
  requiredString(request.channel, "request.channel");
  requiredString(request.idempotencyKey, "request.idempotencyKey");
  if (!input || typeof input !== "object") throw new TypeError("delivery result is required");
  const status = requiredString(input.status, "status").toUpperCase();
  if (!Object.values(DeliveryStatus).includes(status)) throw new TypeError("delivery status is not supported");
  const result = {
    schemaVersion: 1,
    opportunityId: request.opportunityId,
    channel: request.channel,
    idempotencyKey: request.idempotencyKey,
    status,
    occurredAt: isoTimestamp(input.occurredAt, "occurredAt")
  };
  if (status === DeliveryStatus.DELIVERED) result.channelReference = requiredString(input.channelReference, "channelReference");
  if (status === DeliveryStatus.FAILED) result.failureCode = requiredString(input.failureCode, "failureCode");
  return Object.freeze(result);
}
```

## Relevant test source: `test/source-registry.test.mjs`

```js
test("delivery results distinguish delivered references from retryable failures", () => {
  const approved = approvePublication(createPublicationRecord({ opportunityId: "o-1", locale: "en", title: "T", summary: "S", score: 50, generatedAt: "2026-08-28T00:00:00Z", citations: [{ sourceId: "a", collectedItemId: "1", url: "https://a.test/1" }] }), { actor: "editor", reason: "REVIEW", approvedAt: "2026-08-28T01:00:00Z" }).record;
  const request = createDeliveryRequest(approved, { channel: "WEB", idempotencyKey: "web-o-1", requestedAt: "2026-08-28T02:00:00Z" });
  assert.deepEqual(createDeliveryResult(request, { status: "delivered", occurredAt: "2026-08-28T02:01:00Z", channelReference: "page-o-1" }), { schemaVersion: 1, opportunityId: "o-1", channel: "WEB", idempotencyKey: "web-o-1", status: "DELIVERED", occurredAt: "2026-08-28T02:01:00.000Z", channelReference: "page-o-1" });
  assert.deepEqual(createDeliveryResult(request, { status: "FAILED", occurredAt: "2026-08-28T02:01:00Z", failureCode: "NETWORK_TIMEOUT" }).failureCode, "NETWORK_TIMEOUT");
  assert.throws(() => createDeliveryResult(request, { status: "DELIVERED", occurredAt: "2026-08-28T02:01:00Z" }), /channelReference/);
});
```

## Actual command evidence captured 2026-08-28

```text
pnpm test: 21 passed, 0 failed
pnpm lint: passed (14 source files)
pnpm typecheck: passed (runtime module loading)
pnpm build: passed (source copied to dist)
git diff --check: exit code 0
```

## Reviewer limitations to assess

- The current test does not directly assert missing `failureCode`, invalid `occurredAt`, malformed request fields, or object immutability.
- Because there is no committed baseline, this bundle records full source instead of a Git diff.
- No external side effect can be proven solely by a unit test; inspection of the source above is the available evidence.
