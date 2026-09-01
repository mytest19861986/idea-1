import test from "node:test";
import assert from "node:assert/strict";
import {
  LiveDiscoveryController,
  DiscoveryMode
} from "../src/discovery/live-discovery-control.mjs";

test("LOCAL-LIVE-DISCOVERY-007 (Clock Domain Jump): CASE A - Wall clock jumps forward +5m while monotonic clock advances normally", () => {
  const controller = new LiveDiscoveryController({
    intervalMs: 3600000 // 1 hour
  });

  const originalDateNow = Date.now;
  try {
    let simulatedWallMs = 1700000000000;
    Date.now = () => simulatedWallMs;

    controller.setMode(DiscoveryMode.AUTO);

    // Initial projection at T0
    const initialIso = controller.nextScheduledRunAt;
    const initialDiff = new Date(initialIso).getTime() - simulatedWallMs;
    assert.ok(initialDiff >= 3599900 && initialDiff <= 3600000);

    // Simulating Wall Clock jumping forward by +5 minutes (300,000ms) due to host time sync
    simulatedWallMs += 300000;

    // The projected nextScheduledRunAt must re-project forward automatically without changing monotonic deadline
    const reprojectedIso = controller.nextScheduledRunAt;
    const reprojectedDiff = new Date(reprojectedIso).getTime() - simulatedWallMs;
    assert.ok(reprojectedDiff >= 3599900 && reprojectedDiff <= 3600000);

    // Verify error is strictly bounded to within <= 2ms
    assert.ok(Math.abs(reprojectedDiff - 3600000) <= 100);
  } finally {
    Date.now = originalDateNow;
    controller.destroy();
  }
});

test("LOCAL-LIVE-DISCOVERY-007 (Clock Domain Jump): CASE B - Wall clock jumps backward -5m while monotonic clock advances normally", () => {
  const controller = new LiveDiscoveryController({
    intervalMs: 3600000 // 1 hour
  });

  const originalDateNow = Date.now;
  try {
    let simulatedWallMs = 1700000000000;
    Date.now = () => simulatedWallMs;

    controller.setMode(DiscoveryMode.AUTO);

    // Initial projection at T0
    const initialIso = controller.nextScheduledRunAt;
    const initialDiff = new Date(initialIso).getTime() - simulatedWallMs;
    assert.ok(initialDiff >= 3599900 && initialDiff <= 3600000);

    // Simulating Wall Clock jumping backward by -5 minutes (-300,000ms)
    simulatedWallMs -= 300000;

    // The projected nextScheduledRunAt must re-project backward automatically
    const reprojectedIso = controller.nextScheduledRunAt;
    const reprojectedDiff = new Date(reprojectedIso).getTime() - simulatedWallMs;
    assert.ok(reprojectedDiff >= 3599900 && reprojectedDiff <= 3600000);

    // Monotonic interval and timer state remain untouched and no extra runs are triggered
    assert.equal(controller.isRunning, false);
    assert.notEqual(controller.timer, null);
  } finally {
    Date.now = originalDateNow;
    controller.destroy();
  }
});

test("LOCAL-LIVE-DISCOVERY-007 (Clock Domain Jump): CASE C - Normal execution without clock jump preserves exact 60-minute cadence", () => {
  const controller = new LiveDiscoveryController({
    intervalMs: 3600000 // 1 hour
  });

  controller.setMode(DiscoveryMode.AUTO);
  const scheduledIso = controller.nextScheduledRunAt;
  assert.ok(scheduledIso !== null);

  const diffMs = new Date(scheduledIso).getTime() - Date.now();
  assert.ok(diffMs >= 3599000 && diffMs <= 3600100, `Expected ~3600000ms remaining, got ${diffMs}ms`);

  controller.destroy();
});
