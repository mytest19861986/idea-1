Exit code: 0
Wall time: 0.3 seconds
Output:
## test/market-assessment.test.mjs
~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { createMarketAssessment } from "../src/analysis/market-assessment.mjs";

test("market assessment keeps competitor, risk, and MVP claims attributable and deterministic", () => {
  const assessment = createMarketAssessment({ opportunityId: "o-1", competitors: [{ name: "Beta", observation: "Similar workflow", evidenceIds: ["ev-2"] }, { name: "Alpha", observation: "Adjacent offering", evidenceIds: ["ev-1", "ev-1"] }], risks: [{ description: "Regulatory uncertainty", severity: "high", mitigation: "Validate with counsel", evidenceIds: ["ev-3"] }], mvp: { problem: "Slow research", proposition: "Evidence-backed ranking", scope: ["ranking", "evidence", "ranking"] } });
  assert.deepEqual(assessment.competitors.map((item) => item.name), ["Alpha", "Beta"]);
  assert.deepEqual(assessment.risks[0], { description: "Regulatory uncertainty", severity: "HIGH", mitigation: "Validate with counsel", evidenceIds: ["ev-3"] });
  assert.deepEqual(assessment.mvp.scope, ["evidence", "ranking"]);
  assert.equal(Object.isFrozen(assessment), true);
  assert.throws(() => createMarketAssessment({ opportunityId: "o-1", competitors: [], risks: [{ description: "Unsupported", severity: "LOW", mitigation: "Review", evidenceIds: [] }], mvp: { problem: "p", proposition: "q", scope: [] } }), /evidence id/);
});
~~~

