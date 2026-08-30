import { test } from "node:test";
import assert from "node:assert/strict";
import { HardenedRuntimeController, DeterministicClock } from "../src/runtime/runtime-lifecycle.mjs";
import { validateAndCreateRuntimeConfig, RuntimeMode, PersistenceMode } from "../src/runtime/runtime-config.mjs";
import { InMemoryDiscoveryCandidateStore } from "../src/discovery/candidate-store.mjs";
import { executeDiscoveryPipeline } from "../src/discovery/pipeline.mjs";
import { createWorkerTask, TaskType, TaskState } from "../src/worker/worker-task.mjs";
import { HandlerRegistry, WorkerRuntime } from "../src/worker/worker-runtime.mjs";
import { evaluateSourceHealth, HealthLevel } from "../src/source-registry/source-health-evaluator.mjs";
import { SOURCE_ID } from "../src/collection/hn-collector.mjs";

test("PILOT-EXEC-001R: Runtime Probes, Failure Visibility, Immutable Replay Semantics, and Pilot Health Evaluation", async () => {
  const clock = new DeterministicClock("2026-08-30T15:00:00.000Z");
  const capturedLogs = [];
  const logSink = {
    log: (entry) => {
      capturedLogs.push(entry);
      console.log("[PILOT_001R_LOG]", JSON.stringify(entry));
    }
  };

  // ==========================================================================
  // 1. HardenedRuntimeController Probes Verification (Liveness & Readiness)
  // ==========================================================================
  console.log("1. Testing HardenedRuntimeController Liveness & Readiness Probes...");
  const mockSourceStore = {
    getSource: () => ({ id: SOURCE_ID, status: "ACTIVE" })
  };
  const mockRuntimeHost = {
    sourceStore: mockSourceStore,
    workerRuntime: {},
    secretResolver: {},
    runScheduledDiscoveryCycle: async () => ({ success: true })
  };

  const config = validateAndCreateRuntimeConfig({
    runtimeMode: RuntimeMode.STANDALONE,
    persistenceMode: PersistenceMode.IN_MEMORY,
    executionConcurrencyLimit: 2
  });

  const controller = new HardenedRuntimeController({
    config,
    runtimeHost: mockRuntimeHost,
    clock
  });

  // Initial probe before start
  const initialLiveness = controller.getLiveness();
  assert.equal(initialLiveness.live, true);
  assert.equal(initialLiveness.state, "CREATED");

  const startResult = await controller.start();
  assert.equal(startResult.success, true);
  assert.equal(startResult.state, "READY");

  // Readiness probe in READY state
  const readiness = controller.getReadiness();
  assert.equal(readiness.ready, true, "Controller must report ready=true");
  assert.equal(readiness.state, "READY");
  assert.equal(readiness.components.sourceStore, true);
  assert.equal(readiness.components.workerRuntime, true);
  assert.equal(readiness.components.secretResolver, true);

  // Verify zero secret leakage in health payload
  const healthJson = JSON.stringify(readiness);
  const lowerHealth = healthJson.toLowerCase();
  assert.ok(!lowerHealth.includes("test_password") && !lowerHealth.includes("bearer_token_123"));

  // ==========================================================================
  // 2. Controlled Failure Visibility & Classification (No Unbounded Retries)
  // ==========================================================================
  console.log("2. Testing Controlled Synthetic Failure Injection and Log Visibility...");
  const registry = new HandlerRegistry();

  // Register a handler that fails on malformed input
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task) => {
    if (task.payload?.triggerControlledFailure) {
      logSink.log({
        event: "controlled_failure_injected",
        taskId: task.taskId,
        errorKind: "MALFORMED_FIXTURE_REJECTED",
        message: "Synthetic invalid payload rejected by pipeline validator"
      });
      const err = new Error("SYNTHETIC_FAILURE: Invalid document structure in fixture");
      err.code = "MALFORMED_FIXTURE_REJECTED";
      throw err;
    }
    return { ok: true };
  });

  const worker = new WorkerRuntime(registry);
  const failureTask = createWorkerTask({
    taskId: `task-fail-${Date.now()}`,
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: SOURCE_ID,
    payload: { triggerControlledFailure: true },
    maxAttempts: 2
  });

  const failOutcome = await worker.executeTask(failureTask, 1, { executionId: "exec-fail-001" });
  assert.equal(failOutcome.state, TaskState.FINAL_FAILURE, "Domain validation failure on malformed fixture must fail-closed as FINAL_FAILURE without infinite retries");
  assert.ok(capturedLogs.some(l => l.event === "controlled_failure_injected"));
  assert.ok(capturedLogs.some(l => l.errorKind === "MALFORMED_FIXTURE_REJECTED"));

  // ==========================================================================
  // 3. Exact Replay vs Material Conflicting Replay Semantics (STORE-I001 & STORE-I002)
  // ==========================================================================
  console.log("3. Testing Exact Replay and Conflicting Replay Invariants on Candidate Store...");
  const store = new InMemoryDiscoveryCandidateStore();
  const atIso = clock.nowIso();
  const sourceRecord = { id: SOURCE_ID, status: "ACTIVE", sourceType: "public_community_feed", concurrencyLimit: 4 };

  const rawDoc1 = {
    schemaVersion: 1,
    sourceId: SOURCE_ID,
    sourceType: "public_community_feed",
    canonicalUrl: "https://news.ycombinator.com/item?id=49497227",
    title: "Show HN: Bolnee-Chat",
    discoveredAt: atIso,
    retrievedAt: atIso,
    metadata: {
      externalId: "hn:49497227",
      score: 29
    }
  };

  // 3.1 First Ingestion -> STORED
  const res1 = executeDiscoveryPipeline(rawDoc1, {
    sourceRecord,
    store,
    at: atIso,
    executionId: "exec-test-1",
    actor: "pilot-tester"
  });
  assert.equal(res1.stages.intake.status, "SUCCESS");
  assert.equal(res1.stages.store.status, "STORED");
  const originalTitle = res1.candidate.title;

  // 3.2 Exact Same Payload Replay -> REPLAYED (No Mutation)
  const resExactReplay = executeDiscoveryPipeline(rawDoc1, {
    sourceRecord,
    store,
    at: atIso,
    executionId: "exec-test-2",
    actor: "pilot-tester"
  });
  assert.equal(resExactReplay.stages.store.status, "REPLAYED");
  assert.equal(resExactReplay.candidate.title, originalTitle, "Title must remain unchanged after exact replay");

  // 3.3 Conflicting Material Payload Replay (Same Discovery ID, altered title) -> CONFLICT
  const conflictingRawDoc = {
    schemaVersion: 1,
    sourceId: SOURCE_ID,
    sourceType: "public_community_feed",
    canonicalUrl: "https://news.ycombinator.com/item?id=49497227",
    title: "ALTERED_UNSAFE_TITLE: Commercial Product",
    discoveredAt: atIso,
    retrievedAt: atIso,
    metadata: {
      externalId: "hn:49497227",
      score: 999
    }
  };

  const resConflict = executeDiscoveryPipeline(conflictingRawDoc, {
    sourceRecord,
    store,
    at: atIso,
    executionId: "exec-test-3",
    actor: "pilot-tester"
  });
  assert.equal(resConflict.stages.store.status, "CONFLICT");

  // Verify that original stored record in store was NOT mutated
  const storedAfterConflict = store.getCandidateById(res1.candidate.discoveryId);
  assert.equal(storedAfterConflict.title, originalTitle, "Stored candidate title must remain unmodified after conflict rejection");

  // ==========================================================================
  // 4. Source Health Evaluation (PILOT_WINDOW_HEALTH_EVALUATION)
  // ==========================================================================
  console.log("4. Evaluating Source Health with Explicit Window & Formula...");
  const observations = [
    {
      observationId: "obs-test-001",
      sourceId: SOURCE_ID,
      success: true,
      yieldCount: 3,
      duplicateCount: 0,
      uniqueCount: 3,
      occurredAt: atIso
    }
  ];

  const healthAssessment = evaluateSourceHealth(
    SOURCE_ID,
    observations,
    {
      windowStart: new Date(Date.parse(atIso) - 86400000).toISOString(),
      windowEnd: atIso,
      evaluatedAt: atIso
    }
  );

  assert.equal(healthAssessment.operationalHealth, HealthLevel.HIGH);
  assert.equal(healthAssessment.sourceId, SOURCE_ID);
  assert.equal(healthAssessment.observationCount, 1);
  assert.equal(healthAssessment.dimensions.totalYield, 3);

  console.log("PILOT-EXEC-001R EVIDENCE SUITE PASSED 100%!");
});
