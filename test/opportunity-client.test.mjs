import test from "node:test";
import assert from "node:assert/strict";
import { createOpportunityReadClient } from "../src/web/opportunity-client.mjs";
test("web client permits only explicit GET reads", async () => {
  const calls = [];
  const client = createOpportunityReadClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ ok: true }) }; } });
  await client.detail("a b");
  assert.equal(calls[0].url, "/api/v1/opportunities/a%20b");
  assert.equal(calls[0].init.method, "GET");
  assert.throws(() => createOpportunityReadClient(), /fetchImpl/);
});
