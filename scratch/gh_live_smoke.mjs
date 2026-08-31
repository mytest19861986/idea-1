import { createGhCollector } from "../src/collection/gh-collector.mjs";

async function main() {
  const gh = createGhCollector({ maxItems: 3 });
  console.log("TESTING LIVE GITHUB API SEARCH SMOKE...");
  const res = await gh.searchRepositories("topic:ai-agents stars:>1000", { limit: 3 });
  console.log("OK:", res.ok);
  if (res.ok) {
    console.log("FETCHED DOCS:", res.documents.length);
    for (const doc of res.documents) {
      console.log(`- ${doc.title} (${doc.canonicalUrl}) [Stars: ${doc.metadata?.stars}]`);
    }
  } else {
    console.log("FAILURE:", res.failure);
  }
}

main().catch(console.error);
