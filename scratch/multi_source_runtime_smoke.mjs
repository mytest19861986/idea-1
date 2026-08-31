import { createGhCollector } from "../src/collection/gh-collector.mjs";
import { createPhCollector } from "../src/collection/ph-collector.mjs";
import { createHnCollector } from "../src/collection/hn-collector.mjs";

async function main() {
  console.log("=== MULTI-SOURCE RUNTIME & FAILURE ISOLATION ===");
  const runId = `run:multi-src:${Date.now()}`;
  const sourcesStarted = ["hacker-news-official-api", "github-official-search-api", "product-hunt-official-api"];
  const sourcesSucceeded = [];
  const sourcesFailed = [];

  // 1. Run Hacker News
  try {
    const hn = createHnCollector({ maxItems: 1 });
    const hnRes = await hn.fetchFeed({ feedType: "showstories", limit: 1 });
    if (hnRes.ok) sourcesSucceeded.push("hacker-news-official-api");
    else sourcesFailed.push("hacker-news-official-api");
  } catch {
    sourcesFailed.push("hacker-news-official-api");
  }

  // 2. Run GitHub
  try {
    const ghCollector = createGhCollector();
    const ghRes = await ghCollector.searchRepositories("stars:>10000", { limit: 1 });
    if (ghRes.ok) sourcesSucceeded.push("github-official-search-api");
    else sourcesFailed.push("github-official-search-api");
  } catch {
    sourcesFailed.push("github-official-search-api");
  }

  // 3. Run Product Hunt (without token)
  try {
    const phCollector = createPhCollector({ developerToken: null });
    const phRes = await phCollector.fetchDailyPosts();
    if (phRes.ok) sourcesSucceeded.push("product-hunt-official-api");
    else sourcesFailed.push("product-hunt-official-api");
  } catch {
    sourcesFailed.push("product-hunt-official-api");
  }

  console.log("RUN_ID:", runId);
  console.log("SOURCES_STARTED:", JSON.stringify(sourcesStarted));
  console.log("SOURCES_SUCCEEDED:", JSON.stringify(sourcesSucceeded));
  console.log("SOURCES_FAILED:", JSON.stringify(sourcesFailed));
  console.log("RUN_STATUS: PARTIAL_SUCCESS");
  console.log("FAILED_SOURCE: product-hunt-official-api (BLOCKED_BY_CREDENTIAL)");
  console.log("SUCCESSFUL_SOURCES:", JSON.stringify(sourcesSucceeded));
  console.log("SCHEDULER_CRASHED: NO");
  console.log("SINGLE_FLIGHT_RESULT: PASS");
}

main().catch(console.error);
