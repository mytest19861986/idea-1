Exit code: 0
Wall time: 0.3 seconds
Output:
## test/api-read-contract.test.mjs
~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { parseOpportunityListQuery, toPublicOpportunity } from "../src/api/read-contract.mjs";
test("public API contracts cap pagination and expose only approved attributable models", () => {
  assert.deepEqual(parseOpportunityListQuery({ limit: "2", sort: "score_desc" }), { limit: 2, cursor: null, sort: "SCORE_DESC", topic: null });
  assert.throws(() => parseOpportunityListQuery({ limit: 101 }), /100/);
  const record = { publicationState: "APPROVED", slug: "a", title: "A", summary: "S", score: 1, citations: [{ sourceId: "x", url: "https://x.test" }], facts: ["f"], inferences: ["i"] };
  assert.equal(toPublicOpportunity(record).slug, "a");
  assert.throws(() => toPublicOpportunity({ ...record, publicationState: "DRAFT" }), /approved/);
});
~~~

