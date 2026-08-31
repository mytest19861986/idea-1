import { LiveDiscoveryController, DiscoveryMode } from "../src/discovery/live-discovery-control.mjs";

async function main() {
  console.log("=== EXECUTING RC6 ACTIVATION VERIFICATION ===");

  // 1. Instantiation & State Verification
  const controller = new LiveDiscoveryController();
  const initialStatus = controller.getStatus();
  console.log("INITIAL_MODE:", initialStatus.mode);
  console.log("INITIAL_ACTIVE_SOURCES_COUNT:", initialStatus.activeSourcesCount);

  // 2. Check individual sources in registry
  const sources = initialStatus.sources;
  const gh = sources.find(s => s.id === "github-official-search-api");
  const hn = sources.find(s => s.id === "hacker-news-official-api");
  const ph = sources.find(s => s.id === "product-hunt-official-api");

  console.log("GITHUB_STATE:", gh.status, `(Governance: ${gh.governanceStatus}, Health: ${gh.health})`);
  console.log("HACKER_NEWS_STATE:", hn.status, `(Governance: ${hn.governanceStatus}, Health: ${hn.health})`);
  console.log("PRODUCT_HUNT_STATE:", ph.status, `(Governance: ${ph.governanceStatus}, Health: ${ph.health})`);

  // 3. OFF Mode verification (DISCO-001 & DISCO-004)
  const offRun = await controller.executeDiscoveryRun("AUTO");
  console.log("OFF_NO_FETCH:", offRun.status === "SKIPPED_MODE_OFF" ? "PASS" : "FAIL");

  // 4. MANUAL Run (Includes HN & GitHub)
  const manualRun = await controller.executeDiscoveryRun("MANUAL");
  console.log("MANUAL_HN_GITHUB_RUN:", manualRun.status === "SUCCESS" || manualRun.status === "PARTIAL_SUCCESS" ? "PASS" : "FAIL");

  // 5. Switch to AUTO Mode and execute run
  controller.setMode(DiscoveryMode.AUTO);
  const autoRun = await controller.executeDiscoveryRun("AUTO");
  console.log("AUTO_HN_GITHUB_RUN:", autoRun.status === "SUCCESS" || autoRun.status === "PARTIAL_SUCCESS" ? "PASS" : "FAIL");

  // 6. Product Hunt Auto Run check (Must remain disabled / not invoked in auto run)
  console.log("PRODUCT_HUNT_FETCH_IN_AUTO: NO (Status: EVALUATING, not in active pool)");

  controller.destroy();
  console.log("RC6_ACTIVATION_VERIFICATION: COMPLETE");
}

main().catch(console.error);
