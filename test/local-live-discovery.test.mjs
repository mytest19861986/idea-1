import test from "node:test";
import assert from "node:assert/strict";
import {
  LiveDiscoveryController,
  DiscoveryMode,
  DiscoveryHealthStatus
} from "../src/discovery/live-discovery-control.mjs";
import { createReadApiServer } from "../src/api/server.mjs";

test("LOCAL-LIVE-DISCOVERY-001: Mode default is OFF and stops scheduling", () => {
  const controller = new LiveDiscoveryController({
    fetchFn: async () => ({ ok: true, status: 200, json: async () => [] })
  });
  const status = controller.getStatus();
  assert.equal(status.mode, DiscoveryMode.OFF);
  assert.equal(status.isRunning, false);
  assert.equal(controller.timer, null);
  controller.destroy();
});

test("LOCAL-LIVE-DISCOVERY-001: Mode transitions between OFF, AUTO, and MANUAL", () => {
  const controller = new LiveDiscoveryController({
    fetchFn: async () => ({ ok: true, status: 200, json: async () => [] })
  });
  
  controller.setMode(DiscoveryMode.AUTO);
  assert.equal(controller.mode, DiscoveryMode.AUTO);
  assert.notEqual(controller.timer, null);

  controller.setMode(DiscoveryMode.MANUAL);
  assert.equal(controller.mode, DiscoveryMode.MANUAL);
  assert.equal(controller.timer, null);

  controller.setMode(DiscoveryMode.OFF);
  assert.equal(controller.mode, DiscoveryMode.OFF);
  assert.equal(controller.timer, null);

  assert.throws(() => controller.setMode("INVALID_MODE"), /Invalid discovery mode/);
  controller.destroy();
});

test("LOCAL-LIVE-DISCOVERY-001: Single-Flight Mutex prevents overlapping runs", async () => {
  const controller = new LiveDiscoveryController({
    fetchFn: async (url) => {
      await new Promise(r => setTimeout(r, 50));
      if (url.includes("showstories.json")) {
        return { ok: true, status: 200, json: async () => [101] };
      }
      if (url.includes("item/101.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 101,
            by: "tester",
            title: "Test HN Item",
            url: "https://example.com",
            time: 1700000000,
            score: 10
          })
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    }
  });

  const p1 = controller.runCycle("TRIGGER_1");
  const p2 = controller.runCycle("TRIGGER_2");

  const [res1, res2] = await Promise.all([p1, p2]);
  
  // One should succeed or complete, the other must be blocked by single-flight
  assert.equal(res2.status, "BLOCKED_ALREADY_RUNNING");
  controller.destroy();
});

test("LOCAL-LIVE-DISCOVERY-001: Daily budget enforcement caps discoveries", async () => {
  const controller = new LiveDiscoveryController({
    dailyBudget: 2,
    fetchFn: async () => ({ ok: true, status: 200, json: async () => [] })
  });

  controller.todayDiscoveredCount = 2;
  const res = await controller.runNow();
  assert.equal(res.status, "BLOCKED_DAILY_BUDGET_EXCEEDED");
  controller.destroy();
});

test("LOCAL-LIVE-DISCOVERY-001: Fastify API endpoints expose status, control, and run-now", async () => {
  const mockProvider = {
    list: async () => ({ items: [], nextCursor: null }),
    getBySlug: async () => null
  };
  const controller = new LiveDiscoveryController({
    fetchFn: async (url) => {
      if (url.includes("showstories.json")) {
        return { ok: true, status: 200, json: async () => [12345] };
      }
      if (url.includes("item/12345.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 12345,
            by: "testauthor",
            title: "Show HN: Opportunity Engine",
            url: "https://example.com/demo",
            time: 1700000000,
            score: 42
          })
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    }
  });

  const app = createReadApiServer({ provider: mockProvider, discoveryController: controller });

  // 1. GET status
  const statusRes = await app.inject({ method: "GET", url: "/api/v1/discovery/status" });
  assert.equal(statusRes.statusCode, 200);
  const statusJson = JSON.parse(statusRes.body);
  assert.equal(statusJson.mode, "OFF");
  assert.equal(statusJson.activeSourcesCount, 1);

  // 2. POST control (switch to AUTO)
  const controlRes = await app.inject({
    method: "POST",
    url: "/api/v1/discovery/control",
    payload: { mode: "AUTO" }
  });
  assert.equal(controlRes.statusCode, 200);
  const controlJson = JSON.parse(controlRes.body);
  assert.equal(controlJson.mode, "AUTO");

  // 3. POST run-now
  const runRes = await app.inject({ method: "POST", url: "/api/v1/discovery/run-now" });
  assert.equal(runRes.statusCode, 200);
  const runJson = JSON.parse(runRes.body);
  assert.equal(runJson.status, "SUCCESS");

  controller.destroy();
  await app.close();
});
