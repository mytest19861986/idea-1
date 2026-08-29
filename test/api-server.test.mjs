import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryOpportunityReadProvider } from "../src/api/read-provider.mjs";
import { createReadApiServer } from "../src/api/server.mjs";

const records = [
  { publicationState: "APPROVED", slug: "alpha", title: "Alpha", summary: "A", score: 8, topic: "ai", publishedAt: "2026-01-02T00:00:00Z", citations: [{ sourceId: "one", url: "https://example.test/one" }] },
  { publicationState: "APPROVED", slug: "beta", title: "Beta", summary: "B", score: 4, topic: "other", publishedAt: "2026-01-01T00:00:00Z", citations: [{ sourceId: "two", url: "https://example.test/two" }] },
  { publicationState: "DRAFT", slug: "hidden", title: "Hidden", summary: "H", score: 99, citations: [{ sourceId: "three", url: "https://example.test/three" }] }
];

function app() { return createReadApiServer({ provider: createInMemoryOpportunityReadProvider(records) }); }

test("read API health and immutable security baseline", async (t) => {
  const server = app(); t.after(() => server.close());
  const response = await server.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
});

test("read API lists only public models with pagination/filter parsing", async (t) => {
  const server = app(); t.after(() => server.close());
  const response = await server.inject({ method: "GET", url: "/api/v1/opportunities?topic=ai&limit=1" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].slug, "alpha");
  assert.equal(response.json().nextCursor, null);
  assert.equal(response.json().items.some((item) => item.slug === "hidden"), false);
  const invalid = await server.inject({ method: "GET", url: "/api/v1/opportunities?limit=101" });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, "INVALID_REQUEST");
});

test("read API provides detail and maps missing and write routes", async (t) => {
  const server = app(); t.after(() => server.close());
  const detail = await server.inject({ method: "GET", url: "/api/v1/opportunities/alpha" });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().slug, "alpha");
  const missing = await server.inject({ method: "GET", url: "/api/v1/opportunities/missing" });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "NOT_FOUND");
  const write = await server.inject({ method: "POST", url: "/api/v1/opportunities" });
  assert.equal(write.statusCode, 404);
});

test("read API requires an explicit provider and does not hide a production mock", () => {
  assert.throws(() => createReadApiServer(), /provider/);
});

