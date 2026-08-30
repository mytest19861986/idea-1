import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BoundedTelemetryBuffer, OperatorAuditService } from "../src/security/bounded-telemetry-audit.mjs";

describe("PROD-OPS-002-SUPPLEMENT: Bounded Telemetry Buffer & Operator Auditability", () => {
  it("1. Memory Bounding: Buffer caps at max limit and enforces DROP_OLDEST on overflow", () => {
    const buf = new BoundedTelemetryBuffer({ maxBufferSize: 10 });
    for (let i = 0; i < 25; i++) {
      buf.push({ alert: `Alert #${i}` });
    }

    const stats = buf.getStats();
    assert.equal(stats.currentSize, 10);
    assert.equal(stats.totalDropped, 15);
    assert.equal(stats.memoryBounded, true);
  });

  it("2. Network Partition: Buffer retains entries without throwing during sink failure", () => {
    const buf = new BoundedTelemetryBuffer({ maxBufferSize: 5 });
    buf.push({ alert: "Disk Warning" });

    // Injected sink failure
    const failSink = () => { throw new Error("NETWORK_DOWN_503"); };
    const flushRes = buf.flush(failSink);

    assert.equal(flushRes.ok, false);
    assert.equal(flushRes.retainedCount, 1);
  });

  it("3. Operator Auditability: Captures actor, action, timestamp, and query history", () => {
    const audit = new OperatorAuditService();
    audit.recordAction({
      actor: "admin-ops-01",
      action: "MUTATE_PORTFOLIO",
      resource: "port-rec-001",
      clientIp: "192.168.1.50"
    });

    const trail = audit.queryAuditTrail({ actor: "admin-ops-01" });
    assert.equal(trail.length, 1);
    assert.equal(trail[0].actor, "admin-ops-01");
    assert.equal(trail[0].action, "MUTATE_PORTFOLIO");
    assert.ok(trail[0].auditId.startsWith("aud-"));
  });

  it("4. Incident Response Runbook exists and covers all mandatory operational failure modes", () => {
    const runbook = fs.readFileSync("src/security/incident_response_runbook.md", "utf8");
    assert.ok(runbook.includes("DATABASE UNAVAILABLE"));
    assert.ok(runbook.includes("APPLICATION CRASH LOOP"));
    assert.ok(runbook.includes("BACKUP FAILURE"));
    assert.ok(runbook.includes("ALERT PATH FAILURE"));
    assert.ok(runbook.includes("AUTH / RBAC BYPASS"));
    assert.ok(runbook.includes("DISK CAPACITY CRITICAL"));
  });
});
