Exit code: 0
Wall time: 0.3 seconds
Output:
## test/collector-batch.test.mjs
~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCollectorBatch } from "../src/collection/collector-batch.mjs";

test("collector batches normalize one source without collecting or deduplicating", () => {
  const batch = normalizeCollectorBatch({ sourceId: "launches", collectedAt: "2026-08-29T00:00:00Z", items: [{ title: "A", url: "https://example.test/a" }, { title: "A again", url: "https://example.test/a" }] });
  assert.equal(batch.items.length, 2);
  assert.deepEqual(batch.items.map((item) => item.sourceId), ["launches", "launches"]);
  assert.equal(Object.isFrozen(batch.items), true);
  assert.throws(() => normalizeCollectorBatch({ sourceId: "launches", collectedAt: "invalid", items: [] }), /valid timestamp/);
  assert.throws(() => normalizeCollectorBatch({ sourceId: "launches", collectedAt: "2026-08-29T00:00:00Z", items: [{ title: "Unsafe", url: "http://example.test" }] }), /HTTPS/);
});
~~~

