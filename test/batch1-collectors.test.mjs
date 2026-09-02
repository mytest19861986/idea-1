import test from "node:test";
import assert from "node:assert/strict";

import {
  createDevpostCollector,
  parseDevpostSoftwareListHtml,
  normalizeDevpostItem,
  buildDevpostCanonicalUrl
} from "../src/collection/devpost-collector.mjs";

import {
  createLaunchingNextCollector,
  parseLaunchingNextListHtml,
  normalizeLaunchingNextItem,
  buildLaunchingNextCanonicalUrl
} from "../src/collection/launchingnext-collector.mjs";

import {
  createBetaListCollector,
  parseBetaListHtml,
  normalizeBetaListItem,
  buildBetaListCanonicalUrl
} from "../src/collection/betalist-collector.mjs";

test("Batch-1 Collectors Invariant Test Suite", async (t) => {
  await t.test("Devpost Collector Unit & Normalization", async () => {
    const sampleHtml = `
      <div>
        <a href="https://devpost.com/software/super-ai-agent">
          <h3>Super AI Agent</h3>
          <p class="tagline">An autonomous assistant for engineering tasks</p>
        </a>
      </div>
    `;

    const parsed = parseDevpostSoftwareListHtml(sampleHtml);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].slug, "super-ai-agent");
    assert.equal(parsed[0].title, "Super AI Agent");

    const normalized = normalizeDevpostItem(parsed[0]);
    assert.equal(normalized.sourceId, "devpost-software-feed");
    assert.equal(normalized.canonicalUrl, "https://devpost.com/software/super-ai-agent");
    assert.equal(normalized.idempotencyKey, "devpost-software-feed:https://devpost.com/software/super-ai-agent");

    const mockFetch = async () => ({
      status: 200,
      text: async () => sampleHtml
    });

    const collector = createDevpostCollector({ fetchFn: mockFetch });
    const res = await collector.fetchFeed({ limit: 5 });
    assert.equal(res.ok, true);
    assert.equal(res.documents.length, 1);
  });

  await t.test("Launching Next Collector Unit & Normalization", async () => {
    const sampleHtml = `
      <div>
        <a href="https://www.launchingnext.com/s/taskforge-app/">TaskForge App</a>
      </div>
    `;

    const parsed = parseLaunchingNextListHtml(sampleHtml);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].slug, "taskforge-app");

    const normalized = normalizeLaunchingNextItem(parsed[0]);
    assert.equal(normalized.sourceId, "launching-next-feed");
    assert.equal(normalized.canonicalUrl, "https://www.launchingnext.com/s/taskforge-app/");
    assert.equal(normalized.idempotencyKey, "launching-next-feed:https://www.launchingnext.com/s/taskforge-app/");

    const mockFetch = async () => ({
      status: 200,
      text: async () => sampleHtml
    });

    const collector = createLaunchingNextCollector({ fetchFn: mockFetch });
    const res = await collector.fetchFeed({ limit: 5 });
    assert.equal(res.ok, true);
    assert.equal(res.documents.length, 1);
  });

  await t.test("BetaList Collector Unit & Normalization", async () => {
    const sampleHtml = `
      <div>
        <a href="https://betalist.com/startups/flowpilot">FlowPilot Beta</a>
      </div>
    `;

    const parsed = parseBetaListHtml(sampleHtml);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].slug, "flowpilot");

    const normalized = normalizeBetaListItem(parsed[0]);
    assert.equal(normalized.sourceId, "betalist-startup-feed");
    assert.equal(normalized.canonicalUrl, "https://betalist.com/startups/flowpilot");
    assert.equal(normalized.idempotencyKey, "betalist-startup-feed:https://betalist.com/startups/flowpilot");

    const mockFetch = async () => ({
      status: 200,
      text: async () => sampleHtml
    });

    const collector = createBetaListCollector({ fetchFn: mockFetch });
    const res = await collector.fetchFeed({ limit: 5 });
    assert.equal(res.ok, true);
    assert.equal(res.documents.length, 1);
  });

  await t.test("Failure Isolation on 500 error", async () => {
    const mockErrorFetch = async () => ({
      status: 500,
      text: async () => "Internal Server Error"
    });

    const devpost = createDevpostCollector({ fetchFn: mockErrorFetch, retryCount: 1 });
    const res = await devpost.fetchFeed({ limit: 5 });
    assert.equal(res.ok, false);
    assert.equal(res.failure.kind, "RETRYABLE");
  });
});
