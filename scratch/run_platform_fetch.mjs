import { createPlatformFetch } from "../src/collection/platform-fetch.mjs";

async function main() {
  const fetchFn = createPlatformFetch();
  const res = await fetchFn("https://hacker-news.firebaseio.com/v0/showstories.json");
  const data = await res.json();
  console.log("FETCH SUCCESS! Total show stories count:", data.length);
  console.log("Top 5 IDs:", data.slice(0, 5));
}

main().catch(console.error);
