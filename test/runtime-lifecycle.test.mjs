import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceRegistryStore } from "../src/source-registry/store.mjs";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import { DiscoveryRuntimeHost, CollectorRegistry } from "../src/runtime/runtime-composition.mjs";
import {
  HardenedRuntimeController,
  LifecycleState,
  DeterministicClock
} from "../src/runtime/runtime-lifecycle.mjs";
import { validateAndCreateRuntimeConfig, RuntimeMode, PersistenceMode } from "../src/runtime/runtime-config.mjs";

async function createTempStore() {
  const dir = await mkdtemp(join(tmpdir(), "rt-store-"));
  return new SourceRegistryStore({ directory: dir });
}

test("LIFECYCLE: Runtime starts from CREATED to READY, providing separate liveness and readiness probes", async () => {
  const sourceStore = await createTempStore();
  const runtimeHost = new DiscoveryRuntimeHost({ sourceStore });
  const controller = new HardenedRuntimeController({ runtimeHost });

  assert.strictEqual(controller.state, LifecycleState.CREATED);

  const startRes = await controller.start();
  assert.strictEqual(startRes.success, true);
  assert.strictEqual(controller.state, LifecycleState.READY);

  const liveness = controller.getLiveness();
  assert.strictEqual(liveness.live, true);
  assert.strictEqual(liveness.state, LifecycleState.READY);

  const readiness = controller.getReadiness();
  assert.strictEqual(readiness.ready, true);
  assert.strictEqual(readiness.durable, false); // Reference mode is non-durable
});

test("LIFECYCLE: Calling start() when already READY is idempotent", async () => {
  const sourceStore = await createTempStore();
  const runtimeHost = new DiscoveryRuntimeHost({ sourceStore });
  const controller = new HardenedRuntimeController({ runtimeHost });

  await controller.start();
  const startAgain = await controller.start();
  assert.strictEqual(startAgain.success, true);
  assert.strictEqual(startAgain.replayed, true);
  assert.strictEqual(controller.state, LifecycleState.READY);
});

test("LIFECYCLE: PostgreSQL mode fails closed when client is unavailable (Zero silent in-memory fallback)", async () => {
  const sourceStore = await createTempStore();
  const runtimeHost = new DiscoveryRuntimeHost({ sourceStore });
  const config = validateAndCreateRuntimeConfig({
    runtimeMode: RuntimeMode.POSTGRES_STANDALONE,
    persistenceMode: PersistenceMode.POSTGRES_DURABLE
  });

  const controller = new HardenedRuntimeController({
    config,
    runtimeHost,
    postgresClient: null // Missing client
  });

  await assert.rejects(
    async () => controller.start(),
    /POSTGRES_CONNECTION_FAILURE/
  );

  assert.strictEqual(controller.state, LifecycleState.FAILED);
  const readiness = controller.getReadiness();
  assert.strictEqual(readiness.ready, false);
});

test("LIFECYCLE: Overlapping discovery cycle is rejected with OVERLAPPING_CYCLE_REJECTED", async () => {
  const sourceStore = await createTempStore();
  const collectorRegistry = new CollectorRegistry();

  await sourceStore.create({
    id: "src-slow",
    name: "Slow Source",
    baseUrl: "https://slow.com/api",
    status: SourceStatus.ACTIVE,
    metadata: { collectorType: "slow_mock" }
  });

  let unlockCycle;
  const cyclePromise = new Promise(r => { unlockCycle = r; });

  collectorRegistry.register("slow_mock", async () => {
    await cyclePromise;
    return [];
  });

  const runtimeHost = new DiscoveryRuntimeHost({ sourceStore, collectorRegistry });
  const controller = new HardenedRuntimeController({ runtimeHost });
  await controller.start();

  // Trigger first cycle (runs in background until unlocked)
  const firstCycle = controller.triggerCycle();

  // Immediate second cycle -> rejected
  await assert.rejects(
    async () => controller.triggerCycle(),
    (err) => err.code === "OVERLAPPING_CYCLE_REJECTED"
  );

  // Unlock and finish
  unlockCycle();
  await firstCycle;
});

test("LIFECYCLE: Graceful shutdown waits for in-flight tasks and closes owned resources", async () => {
  const sourceStore = await createTempStore();
  const runtimeHost = new DiscoveryRuntimeHost({ sourceStore });

  let resourceClosed = false;
  const mockResource = {
    async close() {
      resourceClosed = true;
    }
  };

  const controller = new HardenedRuntimeController({
    runtimeHost,
    ownedResources: [mockResource]
  });

  await controller.start();
  assert.strictEqual(controller.state, LifecycleState.READY);

  const stopRes = await controller.stop({ timeoutMs: 1000 });
  assert.strictEqual(stopRes.success, true);
  assert.strictEqual(controller.state, LifecycleState.STOPPED);
  assert.strictEqual(resourceClosed, true);

  // Calling triggerCycle after stop throws CYCLE_REJECTED
  await assert.rejects(
    async () => controller.triggerCycle(),
    /CYCLE_REJECTED/
  );

  // Stop again is idempotent
  const stopAgain = await controller.stop();
  assert.strictEqual(stopAgain.success, true);
  assert.strictEqual(stopAgain.replayed, true);
});

test("LIFECYCLE: DeterministicClock controls operational timing without wall-clock pollution", async () => {
  const clock = new DeterministicClock("2026-08-30T10:00:00.000Z");
  const sourceStore = await createTempStore();
  const runtimeHost = new DiscoveryRuntimeHost({ sourceStore });
  const controller = new HardenedRuntimeController({ runtimeHost, clock });

  await controller.start();
  assert.strictEqual(controller.getLiveness().timestamp, "2026-08-30T10:00:00.000Z");

  clock.advance(3600000); // +1 hour
  assert.strictEqual(controller.getLiveness().timestamp, "2026-08-30T11:00:00.000Z");
});
