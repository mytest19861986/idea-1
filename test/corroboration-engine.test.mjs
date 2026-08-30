import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateCorroboration, CorroborationStatus, EvidenceClass } from "../src/analysis/corroboration.mjs";

describe("PRODUCT-EXPANSION-001: Corroboration, Contradiction & UNKNOWN Invariant Tests", () => {
  it("1. Zero evidence results in strict UNKNOWN status without assuming false metrics", () => {
    const res = evaluateCorroboration({
      claimText: "Market size is $50B",
      evidenceItems: []
    });
    assert.equal(res.status, CorroborationStatus.UNKNOWN);
    assert.equal(res.independentSourcesCount, 0);
    assert.equal(res.isCorroborated, false);
  });

  it("2. Two mirrored articles from the SAME domain do NOT equal independent corroboration", () => {
    const res = evaluateCorroboration({
      claimText: "Acme Corp raised $10M Series A",
      evidenceItems: [
        { url: "https://news.techblog.com/post/100", sourceId: "feed-1" },
        { url: "https://news.techblog.com/mirror/100", sourceId: "feed-2" }
      ]
    });
    assert.equal(res.independentSourcesCount, 1);
    assert.equal(res.status, CorroborationStatus.UNCONFIRMED, "Single domain cannot self-corroborate");
    assert.equal(res.isCorroborated, false);
  });

  it("3. Independent distinct domains establish true CORROBORATED status", () => {
    const res = evaluateCorroboration({
      claimText: "Company reports 400% YoY growth",
      evidenceItems: [
        { url: "https://sec.gov/filings/123", sourceId: "sec-official" },
        { url: "https://techcrunch.com/article/456", sourceId: "tc-news" }
      ]
    });
    assert.equal(res.independentSourcesCount, 2);
    assert.equal(res.status, CorroborationStatus.CORROBORATED);
    assert.equal(res.isCorroborated, true);
  });

  it("4. Conflicting values across independent sources trigger CONTRADICTION status explicitly", () => {
    const res = evaluateCorroboration({
      claimText: "Annual recurring revenue",
      evidenceItems: [
        { url: "https://bloomberg.com/news/1", sourceId: "bbg", revenue: 5000000 },
        { url: "https://reuters.com/news/2", sourceId: "reuters", revenue: 12000000 }
      ],
      metricExtractor: (item) => item.revenue
    });
    assert.equal(res.status, CorroborationStatus.CONTRADICTION);
    assert.equal(res.hasContradiction, true);
    assert.equal(res.contradictions.length, 1);
    assert.ok(res.contradictions[0].details.includes("Conflicting values observed"));
  });
});
