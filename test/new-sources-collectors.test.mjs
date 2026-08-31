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

test("CROSS-SOURCE-DEDUP: Cross-source entity resolution links HN, GitHub, and Product Hunt items by canonical domain into unified cluster", async () => {
  const { EntityResolutionEngine, ResolutionDecision } = await import("../src/discovery/entity-resolution.mjs");
  const resolutionEngine = new EntityResolutionEngine();

  // Candidate 1: Hacker News Show submission
  const candHn = {
    discoveryId: "disc:hacker-news-official-api:https://news.ycombinator.com/item?id=1001",
    sourceId: "hacker-news-official-api",
    title: "Show HN: AgentFlow - Autonomous AI Agents",
    contentReference: "https://agentflow.dev",
    is_confidential: false
  };

  // Candidate 2: Product Hunt launch
  const candPh = {
    discoveryId: "disc:product-hunt-official-api:https://www.producthunt.com/posts/agentflow",
    sourceId: "product-hunt-official-api",
    title: "AgentFlow: Visual workflows for AI agents",
    contentReference: "https://agentflow.dev",
    is_confidential: false
  };

  // Candidate 3: GitHub repository
  const candGh = {
    discoveryId: "disc:github-official-search-api:https://github.com/agentflow-ai/agentflow",
    sourceId: "github-official-search-api",
    title: "agentflow-ai/agentflow: Visual workflows for AI agents",
    contentReference: "https://agentflow.dev",
    is_confidential: false
  };

  // Resolve HN vs PH
  const res1 = resolutionEngine.resolvePair(candHn, candPh, { at: new Date().toISOString() });
  assert.equal(res1.decision, ResolutionDecision.CONFIRMED_MATCH);
  assert.equal(res1.confidence, 1.0);

  // Resolve PH vs GH
  const res2 = resolutionEngine.resolvePair(candPh, candGh, { at: new Date().toISOString() });
  assert.equal(res2.decision, ResolutionDecision.CONFIRMED_MATCH);
  assert.equal(res2.confidence, 1.0);

  // Multi-source cluster attachment (cross-source cluster consolidation)
  const clusterHn = resolutionEngine.getClusterByCandidateId(candHn.discoveryId);
  const clusterGh = resolutionEngine.getClusterByCandidateId(candGh.discoveryId);

  assert.ok(clusterHn !== null);
  assert.equal(clusterHn.clusterId, clusterGh.clusterId);
  assert.equal(clusterHn.memberIds.length, 3);
  assert.deepEqual([...clusterHn.sources].sort(), ["github-official-search-api", "hacker-news-official-api", "product-hunt-official-api"].sort());
});

test("CROSS-SOURCE-DEDUP-SAFETY: Negative Controls & Invariants", async () => {
  const { EntityResolutionEngine, ResolutionDecision, extractNormalizedDomain } = await import("../src/discovery/entity-resolution.mjs");

  // 1. SHARED_DOMAIN_GUARD: Shared hosting / platform roots (e.g. github.com, vercel.app) must NOT merge
  assert.equal(extractNormalizedDomain("https://github.com"), null);
  assert.equal(extractNormalizedDomain("https://vercel.app"), null);
  assert.equal(extractNormalizedDomain("https://medium.com"), null);

  const engine = new EntityResolutionEngine();
  const candA = {
    discoveryId: "disc:gh:userA/repo1",
    sourceId: "github-official-search-api",
    title: "userA/repo1: Cool Lib",
    contentReference: "https://github.com/userA/repo1",
    is_confidential: false
  };
  const candB = {
    discoveryId: "disc:gh:userB/repo2",
    sourceId: "github-official-search-api",
    title: "userB/repo2: Other Tool",
    contentReference: "https://github.com/userB/repo2",
    is_confidential: false
  };

  const decShared = engine.resolvePair(candA, candB, { at: new Date().toISOString() });
  assert.notEqual(decShared.decision, ResolutionDecision.CONFIRMED_MATCH, "Shared platform URLs must not falsely trigger CONFIRMED_MATCH");

  // 2. NAME_ONLY_FALSE_MERGE: Common product name on completely different domains must NOT merge
  const candName1 = {
    discoveryId: "disc:hn:item1",
    sourceId: "hacker-news-official-api",
    title: "Pulse",
    contentReference: "https://pulse-health.com",
    is_confidential: false
  };
  const candName2 = {
    discoveryId: "disc:ph:item2",
    sourceId: "product-hunt-official-api",
    title: "Pulse",
    contentReference: "https://pulse-monitoring.io",
    is_confidential: false
  };

  const decName = engine.resolvePair(candName1, candName2, { at: new Date().toISOString() });
  assert.equal(decName.decision, ResolutionDecision.CONFIRMED_DISTINCT, "Contradicting domains must trigger CONFIRMED_DISTINCT");

  // 3. ORDER_INDEPENDENCE: Entity resolution outcome must not depend on ingestion order
  const item1 = {
    discoveryId: "disc:1",
    sourceId: "hacker-news-official-api",
    title: "CloudSync",
    contentReference: "https://cloudsync.io",
    is_confidential: false
  };
  const item2 = {
    discoveryId: "disc:2",
    sourceId: "product-hunt-official-api",
    title: "CloudSync",
    contentReference: "https://cloudsync.io",
    is_confidential: false
  };
  const item3 = {
    discoveryId: "disc:3",
    sourceId: "github-official-search-api",
    title: "CloudSync Core",
    contentReference: "https://cloudsync.io",
    is_confidential: false
  };

  const engineForward = new EntityResolutionEngine();
  engineForward.resolvePair(item1, item2, { at: new Date().toISOString() });
  engineForward.resolvePair(item2, item3, { at: new Date().toISOString() });
  const clusterForward = engineForward.getClusterByCandidateId("disc:1");

  const engineReverse = new EntityResolutionEngine();
  engineReverse.resolvePair(item3, item2, { at: new Date().toISOString() });
  engineReverse.resolvePair(item2, item1, { at: new Date().toISOString() });
  const clusterReverse = engineReverse.getClusterByCandidateId("disc:1");

  assert.equal(clusterForward.memberIds.length, 3);
  assert.equal(clusterReverse.memberIds.length, 3);
  assert.deepEqual([...clusterForward.memberIds].sort(), [...clusterReverse.memberIds].sort());

  // 4. REPLAY_IDEMPOTENCY: Replaying identical candidates produces identical cluster without duplicate members
  engineForward.resolvePair(item1, item2, { at: new Date().toISOString() });
  engineForward.resolvePair(item2, item3, { at: new Date().toISOString() });
  const clusterReplayed = engineForward.getClusterByCandidateId("disc:1");
  assert.equal(clusterReplayed.memberIds.length, 3, "Replay must preserve idempotent member count");
});
