import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAiExtraction } from "../src/ai/extraction.mjs";

test("AI extraction is versioned and preserves explicit claim trust boundaries", () => {
  const extraction = normalizeAiExtraction({ provider: "gemini", promptVersion: "extract-v1", sourceDocumentId: "doc-1", extractedAt: "2026-08-29T00:00:00Z", claims: [{ text: "Reported funding", type: "FACT", evidenceIds: ["ev-1"] }, { text: "May suit the market", type: "AI_HYPOTHESIS" }] });
  assert.deepEqual(extraction, { schemaVersion: 1, provider: "gemini", promptVersion: "extract-v1", sourceDocumentId: "doc-1", extractedAt: "2026-08-29T00:00:00.000Z", claims: [{ text: "Reported funding", type: "FACT", evidenceIds: ["ev-1"], verified: true }, { text: "May suit the market", type: "AI_HYPOTHESIS", evidenceIds: [], verified: false }] });
  assert.equal(Object.isFrozen(extraction.claims), true);
  assert.throws(() => normalizeAiExtraction({ provider: "gemini", promptVersion: "v1", sourceDocumentId: "doc-1", extractedAt: "invalid", claims: [] }), /valid timestamp/);
  assert.throws(() => normalizeAiExtraction({ provider: "gemini", promptVersion: "v1", sourceDocumentId: "doc-1", extractedAt: "2026-08-29T00:00:00Z", claims: [{ text: "Unsupported fact", type: "FACT" }] }), /require evidence/);
});
