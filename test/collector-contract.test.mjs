import test from "node:test"; import assert from "node:assert/strict";
import { collectorIdentity, normalizeRawDocument, retrievalFailure } from "../src/collection/collector-contract.mjs";
test("collector contract normalizes raw documents without network access", () => {
 const doc=normalizeRawDocument({sourceId:"trustmrr",sourceType:"WEB",canonicalUrl:"https://example.test/a#x",title:"A",rawText:"body",discoveredAt:"2026-01-01",retrievedAt:"2026-01-01",language:"en"});
 assert.equal(doc.canonicalUrl,"https://example.test/a"); assert.equal(doc.idempotencyKey,"trustmrr:https://example.test/a");
 assert.equal(retrievalFailure({kind:"RATE_LIMITED",retryAfterMs:10,message:"later"}).retryEligible,true);
 assert.throws(()=>normalizeRawDocument({...doc,canonicalUrl:"http://x.test"}),/HTTPS/); assert.equal(collectorIdentity({sourceId:"a",collectorId:"b",version:"1"}).version,"1");
});
