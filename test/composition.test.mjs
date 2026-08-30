import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import { SourceRegistryStore } from "../src/source-registry/store.mjs";
import { SecretResolver } from "../src/secrets/secret-resolver.mjs";
import { InMemorySecretProvider } from "../src/secrets/in-memory-secret-provider.mjs";
import {
  CollectorRegistry,
  ReferenceCandidateStore,
  ReferenceObservationLedger,
  DiscoveryRuntimeHost
} from "../src/runtime/runtime-composition.mjs";
import { validateAndCreateRuntimeConfig, GovernanceApplicationMode } from "../src/runtime/runtime-config.mjs";

async function createTempStore() {
  const dir = await mkdtemp(join(tmpdir(), "src-store-"));
  return new SourceRegistryStore({ directory: dir });
}

test("COMPOSITION: Valid composition root initializes with validated config and dependencies", async () => {
  const store = await createTempStore();
  const host = new DiscoveryRuntimeHost({ sourceStore: store });

  assert.ok(host);
  assert.strictEqual(host.config.governanceApplicationMode, GovernanceApplicationMode.DISABLED_FOR_PILOT);
});

test("COMPOSITION: Missing sourceStore fails closed before execution", () => {
  assert.throws(
    () => new DiscoveryRuntimeHost({ sourceStore: null }),
    /VALIDATION_FAILURE.*sourceStore/
  );
});

test("COMPOSITION: Data Plane executes full end-to-end cycle (Scheduler -> Worker -> Collector -> Pipeline -> Persistence)", async () => {
  const sourceStore = await createTempStore();
  const candidateStore = new ReferenceCandidateStore();
  const observationLedger = new ReferenceObservationLedger();
  const collectorRegistry = new CollectorRegistry();

  const secretProvider = new InMemorySecretProvider({
    "cred:source:trustmrr:bearer": "synth-composition-token-123"
  });
  const secretResolver = new SecretResolver(secretProvider);

  await sourceStore.create({
    id: "src-active-1",
    name: "TrustMRR Feed",
    baseUrl: "https://trustmrr.com/api/v1/listings",
    status: SourceStatus.ACTIVE,
    lastFetchedAt: null,
    metadata: {
      collectorType: "trustmrr_mock",
      credentialRef: "cred:source:trustmrr:bearer"
    }
  });

  collectorRegistry.register("trustmrr_mock", async (task, context) => {
    assert.strictEqual(context.secretToken, "synth-composition-token-123");
    return [
      {
        sourceId: task.sourceId,
        externalId: "doc-101",
        url: "https://trustmrr.com/listings/startup-alpha",
        title: "Startup Alpha SaaS",
        summary: "B2B SaaS with $50k MRR",
        metadata: { sourceClaim: "SOURCE_CLAIM", isConfidential: false }
      }
    ];
  });

  const host = new DiscoveryRuntimeHost({
    sourceStore,
    secretResolver,
    collectorRegistry,
    candidateStore,
    observationLedger
  });

  const cycleResult = await host.runScheduledDiscoveryCycle(new Date("2026-08-30T10:00:00Z"));

  assert.strictEqual(cycleResult.evaluatedSourcesCount, 1);
  assert.strictEqual(cycleResult.executedCount, 1);
  assert.strictEqual(cycleResult.results[0].state, "SUCCEEDED");

  const storedCandidates = candidateStore.getAll();
  assert.strictEqual(storedCandidates.length, 1);
  assert.strictEqual(storedCandidates[0].sourceId, "src-active-1");
  assert.strictEqual(storedCandidates[0].sourceClaim, "SOURCE_CLAIM");

  const observations = observationLedger.getForSource("src-active-1");
  assert.strictEqual(observations.length, 1);
  assert.strictEqual(observations[0].status, "SUCCESS");
});

test("COMPOSITION: PAUSED source is not scheduled and collector is never called", async () => {
  const sourceStore = await createTempStore();
  const collectorRegistry = new CollectorRegistry();
  let collectorCalled = false;

  await sourceStore.create({
    id: "src-paused-1",
    name: "Paused Feed",
    baseUrl: "https://example.com/api",
    status: SourceStatus.PAUSED,
    lastFetchedAt: null,
    metadata: { collectorType: "paused_mock" }
  });

  collectorRegistry.register("paused_mock", async () => {
    collectorCalled = true;
    return [];
  });

  const host = new DiscoveryRuntimeHost({ sourceStore, collectorRegistry });
  const cycleResult = await host.runScheduledDiscoveryCycle(new Date());

  assert.strictEqual(cycleResult.executedCount, 0);
  assert.strictEqual(collectorCalled, false);
  assert.strictEqual(cycleResult.results[0].executed, false);
  assert.strictEqual(cycleResult.results[0].outcome, "BLOCKED");
});

test("COMPOSITION: Single source failure isolation (Source A fails, Source B succeeds)", async () => {
  const sourceStore = await createTempStore();
  const collectorRegistry = new CollectorRegistry();
  const candidateStore = new ReferenceCandidateStore();

  await sourceStore.create({
    id: "src-failing-a",
    name: "Failing Feed",
    baseUrl: "https://fail.com/api",
    status: SourceStatus.ACTIVE,
    metadata: { collectorType: "fail_collector" }
  });
  await sourceStore.create({
    id: "src-healthy-b",
    name: "Healthy Feed",
    baseUrl: "https://success.com/api",
    status: SourceStatus.ACTIVE,
    metadata: { collectorType: "success_collector" }
  });

  collectorRegistry.register("fail_collector", async () => {
    throw new Error("500 Internal Server Error from upstream");
  });
  collectorRegistry.register("success_collector", async (task) => {
    return [{
      sourceId: task.sourceId,
      externalId: "doc-b",
      url: "https://success.com/listings/app-b",
      title: "App B"
    }];
  });

  const host = new DiscoveryRuntimeHost({ sourceStore, collectorRegistry, candidateStore });
  const cycleResult = await host.runScheduledDiscoveryCycle(new Date());

  assert.strictEqual(cycleResult.evaluatedSourcesCount, 2);
  assert.strictEqual(cycleResult.executedCount, 2);

  const resA = cycleResult.results.find(r => r.sourceId === "src-failing-a");
  const resB = cycleResult.results.find(r => r.sourceId === "src-healthy-b");

  assert.strictEqual(resA.state, "RETRYABLE_FAILURE");
  assert.strictEqual(resB.state, "SUCCEEDED");
  assert.strictEqual(candidateStore.getAll().length, 1);
});

test("COMPOSITION: Replay of same schedule slot prevents duplicate task execution (Idempotency)", async () => {
  const sourceStore = await createTempStore();
  const collectorRegistry = new CollectorRegistry();
  let executionCount = 0;

  await sourceStore.create({
    id: "src-idempotent",
    name: "Idempotent Feed",
    baseUrl: "https://idempotent.com/api",
    status: SourceStatus.ACTIVE,
    metadata: { collectorType: "idemp_mock" }
  });

  collectorRegistry.register("idemp_mock", async () => {
    executionCount++;
    return [];
  });

  const host = new DiscoveryRuntimeHost({ sourceStore, collectorRegistry });
  const asOf = new Date("2026-08-30T12:00:00Z");

  // First run
  const res1 = await host.runScheduledDiscoveryCycle(asOf);
  assert.strictEqual(res1.executedCount, 1);
  assert.strictEqual(executionCount, 1);

  // Second run with same asOf timestamp and same slotId
  const res2 = await host.runScheduledDiscoveryCycle(asOf);
  assert.strictEqual(res2.executedCount, 0);
  assert.strictEqual(executionCount, 1);
  assert.strictEqual(res2.results[0].reason, "SLOT_ALREADY_DISPATCHED");
});

test("COMPOSITION: Control Plane evaluates health and respects DISABLED_FOR_PILOT (No automatic source mutation)", async () => {
  const sourceStore = await createTempStore();
  const observationLedger = new ReferenceObservationLedger();

  await sourceStore.create({
    id: "src-eval-1",
    name: "Source for Governance",
    baseUrl: "https://eval.com/api",
    status: SourceStatus.ACTIVE
  });

  for (let i = 1; i <= 10; i++) {
    observationLedger.record({
      id: `obs-gov-${i}`,
      sourceId: "src-eval-1",
      occurredAt: "2026-08-30T09:30:00Z",
      success: true,
      documentsExtracted: 1,
      durationMs: 40,
      httpStatus: 200
    });
  }

  const host = new DiscoveryRuntimeHost({
    sourceStore,
    observationLedger,
    config: validateAndCreateRuntimeConfig({
      governanceApplicationMode: GovernanceApplicationMode.DISABLED_FOR_PILOT
    })
  });

  const wStart = new Date("2026-08-30T09:00:00Z");
  const wEnd = new Date("2026-08-30T10:00:00Z");

  const controlPlaneResult = await host.runControlPlaneGovernanceCycle(wStart, wEnd);

  assert.strictEqual(controlPlaneResult.evaluations.length, 1);
  assert.strictEqual(controlPlaneResult.evaluations[0].decision.decision, "NO_CHANGE");
  assert.strictEqual(controlPlaneResult.evaluations[0].applicationResult.applied, false);
  assert.strictEqual(controlPlaneResult.evaluations[0].applicationResult.reason, "GOVERNANCE_AUTO_MUTATION_DISABLED_FOR_PILOT");

  const currentSource = await sourceStore.get("src-eval-1");
  assert.strictEqual(currentSource.status, SourceStatus.ACTIVE);
});
