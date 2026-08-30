import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { OSProcessSupervisor, HttpAlertSinkAdapter } from "../src/security/os-supervisor-adapter.mjs";
import { ProductionReleaseManager } from "../src/security/release-manager.mjs";

/**
 * ============================================================================
 * PROD-READINESS-002R FINAL EVIDENCE SUITE
 * Validates:
 * 1. Parent OSProcessSupervisor survives child crash and restarts child process
 * 2. HttpAlertSinkAdapter delivers alert over real TCP HTTP socket to separate server
 * 3. Deployable Release Manifest & Exact Payload Rollback
 * ============================================================================
 */

describe("PROD-READINESS-002R: Final OS-Level Runtime Evidence", () => {
  it("1. PARENT_SUPERVISES_CHILD: Parent survives child crash and restarts child process", async () => {
    const supervisor = new OSProcessSupervisor({
      command: "node",
      args: ["-e", "setInterval(() => {}, 1000)"],
      maxRestarts: 3
    });

    const child1 = supervisor.startChild();
    const pid1 = child1.pid;
    assert.ok(pid1 > 0);

    // Wait for crash event and restart
    const restartPromise = new Promise(resolve => {
      supervisor.once("child_restarting", (data) => {
        resolve(data);
      });
    });

    // Injected crash
    supervisor.killChild("SIGKILL");
    const restartData = await restartPromise;

    assert.equal(restartData.attempt, 1);
    assert.ok(supervisor.child.pid > 0);
    assert.notEqual(supervisor.child.pid, pid1);

    supervisor.shutdown();
  });

  it("2. OUT_OF_PROCESS_ALERT_DELIVERY: Delivers alert payload over real TCP socket to external receiver server", async () => {
    const receivedAlerts = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        receivedAlerts.push(JSON.parse(body));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "RECEIVED" }));
      });
    });

    await new Promise(r => server.listen(9876, r));

    const sinkAdapter = new HttpAlertSinkAdapter({ endpointUrl: "http://127.0.0.1:9876/api/v1/alerts" });
    const sendRes = await sinkAdapter.sendAlert({
      eventId: "evt-critical-db-001",
      severity: "CRITICAL",
      event: "DATABASE_UNAVAILABLE",
      details: { host: "127.0.0.1", port: 5432 }
    });

    assert.equal(sendRes.ok, true);
    assert.equal(sendRes.statusCode, 200);
    assert.equal(receivedAlerts.length, 1);
    assert.equal(receivedAlerts[0].eventId, "evt-critical-db-001");

    server.close();
  });

  it("3. DEPLOYABLE_RELEASE_ARTIFACT: Generates versioned manifest and executes rollback to exact previous good artifact", () => {
    const releaseMgr = new ProductionReleaseManager({ currentReleaseId: "release-v1.0.0.tar.gz" });
    
    const manifestGood = releaseMgr.generateManifest("v1.0.0", [
      { path: "src/server.mjs", content: "export default { v: '1.0.0' }" }
    ]);
    assert.ok(manifestGood.files[0].sha256);

    // Deploy bad release N+1
    const deployBad = releaseMgr.deployNewRelease("release-v1.0.1-bad.tar.gz", { healthcheckPass: false });
    assert.equal(deployBad.ok, false);
    assert.equal(deployBad.rollback.rolledBack, true);
    assert.equal(deployBad.rollback.restoredReleaseId, "release-v1.0.0.tar.gz");
  });
});
