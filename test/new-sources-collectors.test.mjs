import test from "node:test";
import assert from "node:assert/strict";
import { createGhCollector, parseGhRepository } from "../src/collection/gh-collector.mjs";
import { createPhCollector, parsePhPost } from "../src/collection/ph-collector.mjs";

test("GH-COL-001: GitHub collector parses repository metadata into normalized RawDocument", () => {
  const rawRepo = {
    full_name: "example/agent-framework",
    description: "Next-gen autonomous agent framework",
    html_url: "https://github.com/example/agent-framework",
    homepage: "https://agent-framework.io",
    created_at: "2026-08-01T10:00:00Z",
    pushed_at: "2026-08-31T12:00:00Z",
    stargazers_count: 1250,
    forks_count: 85,
    open_issues_count: 12,
    language: "JavaScript",
    license: { spdx_id: "MIT" },
    topics: ["ai", "agents", "automation"],
    owner: { login: "example-org" }
  };

  const doc = parseGhRepository(rawRepo);
  assert.equal(doc.sourceId, "github-official-search-api");
  assert.equal(doc.canonicalUrl, "https://github.com/example/agent-framework");
  assert.equal(doc.title, "example/agent-framework: Next-gen autonomous agent framework");
  assert.equal(doc.contentReference, "https://agent-framework.io/");
  assert.equal(doc.metadata.stars, 1250);
  assert.equal(doc.metadata.primaryLanguage, "JavaScript");
  assert.equal(doc.idempotencyKey, "github-official-search-api:https://github.com/example/agent-framework");
});

test("GH-COL-002: GitHub collector executes mock search and handles 429 rate limits", async () => {
  const collector = createGhCollector({
    fetchFn: async () => ({
      ok: false,
      status: 429,
      headers: { get: (name) => name === "retry-after" ? "30" : null }
    })
  });

  const res = await collector.searchRepositories();
  assert.equal(res.ok, false);
  assert.equal(res.failure.kind, "RATE_LIMITED");
  assert.equal(res.failure.retryAfterMs, 30000);
});

test("PH-COL-001: Product Hunt collector parses GraphQL post into normalized RawDocument", () => {
  const rawNode = {
    name: "AgentFlow",
    tagline: "Visual workflows for AI agents",
    description: "Design and execute resilient AI agent workflows in seconds",
    url: "https://www.producthunt.com/posts/agentflow",
    website: "https://agentflow.dev",
    createdAt: "2026-08-31T08:00:00Z",
    featuredAt: "2026-08-31T09:00:00Z",
    votesCount: 412,
    commentsCount: 56,
    user: { username: "workflow_dev" },
    topics: { edges: [{ node: { name: "Artificial Intelligence" } }, { node: { name: "Developer Tools" } }] }
  };

  const doc = parsePhPost(rawNode);
  assert.equal(doc.sourceId, "product-hunt-official-api");
  assert.equal(doc.canonicalUrl, "https://www.producthunt.com/posts/agentflow");
  assert.equal(doc.title, "AgentFlow: Visual workflows for AI agents");
  assert.equal(doc.contentReference, "https://agentflow.dev/");
  assert.equal(doc.metadata.votesCount, 412);
  assert.deepEqual(doc.metadata.topics, ["Artificial Intelligence", "Developer Tools"]);
});

test("PH-COL-002: Product Hunt collector requires developerToken before outbound execution", async () => {
  const collector = createPhCollector({ developerToken: null });
  const res = await collector.fetchDailyPosts();
  assert.equal(res.ok, false);
  assert.equal(res.failure.kind, "FINAL");
  assert.ok(res.failure.message.includes("MISSING_CREDENTIAL"));
});
