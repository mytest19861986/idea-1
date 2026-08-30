import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OperationalTelemetryCollector } from "../src/security/operational-telemetry.mjs";

describe("PROD-OPS-002: Operational Soak, Time Provenance & Alert Thresholds", () => {
  const collector = new OperationalTelemetryCollector({ backupDir: "G:\\project\\IDEA" });

  it("1. Collects valid time provenance with NTP/clock sync indicators", () => {
    const time = collector.collectTimeProvenance();
    assert.ok(time.hostTimeUtc.includes("T"));
    assert.ok(time.timeSyncStatus.includes("NTP"));
    assert.ok(time.observationDurationHours === "1.00");
  });

  it("2. Validates database soak & disk threshold limits (P2-001)", () => {
    const db = collector.collectDatabaseTelemetry();
    assert.equal(db.lockTimeoutEvents, 0);
    assert.equal(db.migrationLockContention, 0);
    assert.equal(db.diskWarningThreshold, "80%");
    assert.equal(db.diskCriticalThreshold, "90%");
  });

  it("3. Validates process stability and zero 5xx rate", () => {
    const proc = collector.collectProcessMetrics();
    assert.equal(proc.processRestartCount, 0);
    assert.equal(proc.crashLoopEvents, 0);
    assert.equal(proc.status5xxCount, 0);
    assert.equal(proc.status5xxRate, "0.00%");
    assert.equal(proc.healthcheckSuccessRate, "100.00%");
  });
});
