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
  assert.equal(statusJson.activeSourcesCount, 2);

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
  assert.ok(["SUCCESS", "PARTIAL_SUCCESS"].includes(runJson.status));

  controller.destroy();
  await app.close();
});

test("LOCAL-LIVE-DISCOVERY-001: Fastify returns 503 when discoveryController is null (C2)", async () => {
  const mockProvider = {
    list: async () => ({ items: [], nextCursor: null }),
    getBySlug: async () => null
  };
  const app = createReadApiServer({ provider: mockProvider, discoveryController: null });

  const res = await app.inject({ method: "GET", url: "/api/v1/discovery/status" });
  assert.equal(res.statusCode, 503);
  const json = JSON.parse(res.body);
  assert.equal(json.error.code, "SERVICE_UNAVAILABLE");

  await app.close();
});

test("LOCAL-LIVE-DISCOVERY-001: Non-destructive OFF preservation preserves all existing candidates (M1 / DISCO-004)", async () => {
  const savedCandidates = new Map();
  const mockCandidateStore = {
    save: (item) => {
      savedCandidates.set(item.externalId, item);
      return { created: true };
    }
  };

  const controller = new LiveDiscoveryController({
    candidateStore: mockCandidateStore,
    fetchFn: async (url) => {
      if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [555] };
      if (url.includes("item/555.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 555, by: "dev", title: "Existing Idea", url: "https://example.com/app", time: 1700000000 })
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    }
  });

  // Discover in MANUAL
  await controller.runNow();
  assert.equal(savedCandidates.size, 1);
  assert.ok(savedCandidates.has("https://news.ycombinator.com/item?id=555"));

  // Switch to AUTO then back to OFF
  controller.setMode(DiscoveryMode.AUTO);
  controller.setMode(DiscoveryMode.OFF);

  // Invariant: Existing saved records remain intact and unchanged
  assert.equal(savedCandidates.size, 1);
  assert.equal(savedCandidates.get("https://news.ycombinator.com/item?id=555").title, "Existing Idea");
  controller.destroy();
});

test("LOCAL-LIVE-DISCOVERY-001: Per-item daily budget cap breaks loop immediately (C1)", async () => {
  const controller = new LiveDiscoveryController({
    dailyBudget: 2,
    fetchFn: async (url) => {
      if (url.includes("showstories.json")) return { ok: true, status: 200, json: async () => [1, 2, 3, 4, 5] };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, by: "dev", title: "Item", url: "https://example.com/app", time: 1700000000 })
      };
    }
  });

  // Cycle should discover exactly 2 items due to per-item cap
  const res = await controller.runNow();
  assert.equal(res.newItemsDiscovered, 2);
  assert.equal(controller.todayDiscoveredCount, 2);
  controller.destroy();
});

test("LOCAL-LIVE-DISCOVERY-001: RBAC enforcement on POST /discovery/control and POST /discovery/run-now", async () => {
  const { CryptographicAuthService, UserRole } = await import("../src/security/auth-boundary-service.mjs");
  const authService = new CryptographicAuthService({
    secretKey: "01234567890123456789012345678901"
  });

  const adminToken = authService.signToken({ userId: "u-admin", role: UserRole.ADMIN });
  const operatorToken = authService.signToken({ userId: "u-op", role: UserRole.OPERATOR });
  const viewerToken = authService.signToken({ userId: "u-view", role: UserRole.VIEWER });

  const mockProvider = { list: async () => ({ items: [] }), getBySlug: async () => null };
  const controller = new LiveDiscoveryController();
  const app = createReadApiServer({ provider: mockProvider, discoveryController: controller, authService });

  // 1. Unauthenticated -> 401
  const unauthRes = await app.inject({ method: "POST", url: "/api/v1/discovery/control", payload: { mode: "AUTO" } });
  assert.equal(unauthRes.statusCode, 401);

  // 2. Unauthorized Role (VIEWER) -> 403
  const viewerRes = await app.inject({
    method: "POST",
    url: "/api/v1/discovery/control",
    headers: { authorization: `Bearer ${viewerToken}` },
    payload: { mode: "AUTO" }
  });
  assert.equal(viewerRes.statusCode, 403);

  // 3. Authorized Role (OPERATOR / ADMIN) -> 200
  const opRes = await app.inject({
    method: "POST",
    url: "/api/v1/discovery/control",
    headers: { authorization: `Bearer ${operatorToken}` },
    payload: { mode: "AUTO" }
  });
  assert.equal(opRes.statusCode, 200);
  assert.equal(JSON.parse(opRes.body).mode, "AUTO");

  // 4. Run-Now with VIEWER -> 403
  const runViewer = await app.inject({
    method: "POST",
    url: "/api/v1/discovery/run-now",
    headers: { authorization: `Bearer ${viewerToken}` }
  });
  assert.equal(runViewer.statusCode, 403);

  // 5. Run-Now with ADMIN -> 200
  const runAdmin = await app.inject({
    method: "POST",
    url: "/api/v1/discovery/run-now",
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(runAdmin.statusCode, 200);

  controller.destroy();
  await app.close();
});

test("LOCAL-LIVE-DISCOVERY-001: Restart behavior enforces safe default OFF mode and disarmed timer", async () => {
  // Before restart: instance configured in AUTO
  const beforeInstance = new LiveDiscoveryController({ mode: DiscoveryMode.AUTO });
  assert.equal(beforeInstance.mode, "AUTO");
  assert.ok(beforeInstance.timer !== null);
  beforeInstance.destroy();

  // After restart (fresh instantiation): Must start in OFF mode with null timer
  const restartedInstance = new LiveDiscoveryController();
  assert.equal(restartedInstance.mode, "OFF");
  assert.equal(restartedInstance.timer, null);
  assert.equal(restartedInstance.isRunning, false);
  assert.equal(restartedInstance.getStatus().mode, "OFF");
  restartedInstance.destroy();
});
