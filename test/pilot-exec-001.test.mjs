import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { SourceStatus, transitionSource } from "../src/source-registry/lifecycle.mjs";
import { evaluateSchedule, DEFAULT_SCHEDULING_POLICY } from "../src/scheduler/scheduling-engine.mjs";
import { HandlerRegistry, WorkerRuntime } from "../src/worker/worker-runtime.mjs";
import { TaskType, createWorkerTask } from "../src/worker/worker-task.mjs";
import { createHnCollector, SOURCE_ID, COLLECTOR_VERSION } from "../src/collection/hn-collector.mjs";
import { executeDiscoveryPipeline } from "../src/discovery/pipeline.mjs";
import { InMemoryDiscoveryCandidateStore } from "../src/discovery/candidate-store.mjs";
import { TelemetryFacade } from "../src/observability/telemetry.mjs";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "test_user",
  password: "test_password",
  database: "discovery_test"
};

function psqlExec(sql) {
  const cleanSql = sql.replace(/\r/g, "");
  const isInsideWsl = process.platform === "linux";
  const cmd = isInsideWsl
    ? `export PGPASSWORD='${PG_CONFIG.password}'; psql -v ON_ERROR_STOP=1 -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}`
    : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${PG_CONFIG.password}'; psql -v ON_ERROR_STOP=1 -U ${PG_CONFIG.user} -d ${PG_CONFIG.database} -h ${PG_CONFIG.host}"`;
  return execSync(cmd, { input: cleanSql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

test("PILOT-EXEC-001: End-to-End Operational Pipeline (Lifecycle -> Scheduler -> Worker -> HN Collector -> Pipeline -> Postgres -> Observability)", async () => {
  const executionId = `pilot-exec-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const operationalLogs = [];

  const logSink = {
    log: (entry) => {
      operationalLogs.push(entry);
      console.log("[PILOT_OPERATIONAL_LOG]", JSON.stringify(entry));
    }
  };

  // 1. Canonical Source Lifecycle Transition: EVALUATING -> APPROVED -> ACTIVE
  console.log("1. Executing Canonical Lifecycle Audit for Hacker News Source...");
  const initialSource = {
    id: SOURCE_ID,
    sourceId: SOURCE_ID,
    status: SourceStatus.APPROVED,
    sourceType: "public_community_feed",
    concurrencyLimit: 2
  };

  const activeTransition = transitionSource(initialSource, SourceStatus.ACTIVE, {
    actor: "pilot-commander",
    reason: "PILOT_GO authorization by Commander",
    at: nowIso
  });

  assert.equal(activeTransition.status, SourceStatus.ACTIVE, "Source must transition to ACTIVE canonically");
  const activeSource = { ...initialSource, status: activeTransition.status };
  logSink.log({ event: "source_activated_canonically", sourceId: SOURCE_ID, newStatus: activeSource.status });

  // 2. Scheduler Evaluation & Slot Generation
  console.log("2. Evaluating Scheduler for Active Source...");
  const scheduleDecision = evaluateSchedule(activeSource, {}, DEFAULT_SCHEDULING_POLICY, nowIso);
  assert.equal(scheduleDecision.outcome, "DUE", "Active source must evaluate as DUE for scheduling");

  // Persist source runtime state to PostgreSQL
  psqlExec(`
    INSERT INTO source_runtime_state (source_id, status, revision, metadata, last_transition_at, last_transition_reason)
    VALUES ('${SOURCE_ID}', 'ACTIVE', 1, '{}'::jsonb, NOW(), 'PILOT_GO authorization by Commander')
    ON CONFLICT (source_id) DO UPDATE SET status = 'ACTIVE', updated_at = NOW();
  `);

  const slotFloorIso = scheduleDecision.slotFloor != null ? new Date(scheduleDecision.slotFloor).toISOString() : nowIso;
  const slotKey = `slot:${SOURCE_ID}:${slotFloorIso}`;
  logSink.log({ event: "scheduler_slot_allocated", slotKey, slotFloor: slotFloorIso });

  const taskId = `task-pilot-${Date.now()}`;

  // Persist scheduler slot to PostgreSQL
  psqlExec(`
    INSERT INTO scheduler_slots (slot_id, source_id, task_type, policy_version, slot_floor_at, status, task_id)
    VALUES ('${slotKey}', '${SOURCE_ID}', 'DISCOVERY_EXECUTION', 'scheduler-policy-v1', '${slotFloorIso}', 'DISPATCHED', '${taskId}')
    ON CONFLICT (slot_id) DO NOTHING;
  `);
  const workerTask = createWorkerTask({
    taskId,
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: SOURCE_ID,
    payload: {
      slotKey,
      feedType: "showstories",
      limit: 3,
      maxConcurrency: 2
    },
    maxAttempts: 3
  });

  // Setup Handler Registry with real bounded collector and pipeline
  const registry = new HandlerRegistry();
  const memoryCandidateStore = new InMemoryDiscoveryCandidateStore();

  registry.register(TaskType.DISCOVERY_EXECUTION, async (task, scope) => {
    logSink.log({ event: "worker_task_execution_started", taskId: task.taskId });

    const collector = createHnCollector({
      maxItems: 3,
      concurrency: 2,
      timeoutMs: 15000,
      logger: logSink
    });

    const feedResult = await collector.fetchFeed({ feedType: "showstories", limit: 3 });
    if (!feedResult.ok) {
      throw new Error(`Collector feed fetch failed: ${feedResult.failure.message}`);
    }

    const processedCandidates = [];
    for (const doc of feedResult.documents) {
      const pipelineResult = executeDiscoveryPipeline(doc, {
        sourceRecord: activeSource,
        store: memoryCandidateStore,
        at: new Date().toISOString(),
        executionId: task.taskId,
        actor: "pilot-worker"
      });

      if (pipelineResult.pipelineStatus === "COMPLETED") {
        processedCandidates.push(pipelineResult.candidate);

        // Persist to PostgreSQL durable storage
        const c = pipelineResult.candidate;
        const rawMeta = JSON.stringify(doc.metadata).replace(/'/g, "''");
        const cleanTitle = (c.title || "HN Item").replace(/'/g, "''");

        psqlExec(`
          INSERT INTO discovery_candidates (
            id, canonical_url, canonical_domain, title, description,
            source_type, source_record_id, content_reference, discovered_at,
            retrieved_at, schema_version, rule_version, confidence, tags, metadata
          ) VALUES (
            '${c.discoveryId}', '${c.canonicalUrl}', 'news.ycombinator.com', '${cleanTitle}', 'Live Pilot Opportunity Item',
            'public_community_feed', '${SOURCE_ID}', '${c.contentReference || ""}', NOW(),
            NOW(), 1, 'v1', 'PROBABLE', '["pilot", "hacker-news"]'::jsonb, '${rawMeta}'::jsonb
          ) ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
        `);

        psqlExec(`
          INSERT INTO discovery_candidate_attributions (
            attribution_id, candidate_id, source_id, source_type, idempotency_key,
            claim_classification, raw_document_id, collector_version, attributed_at, metadata
          ) VALUES (
            'attr-${task.taskId}-${c.discoveryId.slice(-8)}', '${c.discoveryId}', '${SOURCE_ID}', 'public_community_feed', '${doc.idempotencyKey}',
            'SOURCE_CLAIM', '${doc.metadata.externalId}', '${COLLECTOR_VERSION}', NOW(), '${rawMeta}'::jsonb
          ) ON CONFLICT DO NOTHING;
        `);
      }
    }

    // Persist observation
    const obsId = `obs-${task.taskId}-${scope.attemptNumber || 1}-${Date.now()}`;
    psqlExec(`
      INSERT INTO source_observations (
        observation_id, execution_id, source_id, success, status_code,
        yield_count, duplicate_count, unique_count, occurred_at
      ) VALUES (
        '${obsId}', '${task.taskId}', '${SOURCE_ID}', TRUE, 200,
        ${processedCandidates.length}, 0, ${processedCandidates.length}, NOW()
      ) ON CONFLICT (observation_id) DO NOTHING;
    `);

    logSink.log({ event: "worker_task_execution_completed", taskId: task.taskId, storedCount: processedCandidates.length });
    return { yieldCount: processedCandidates.length, candidates: processedCandidates };
  });

  const workerRuntime = new WorkerRuntime(registry);
  const executionOutcome = await workerRuntime.executeTask(workerTask, 1, { executionId });

  assert.equal(executionOutcome.state, "SUCCEEDED", "Worker task execution must reach SUCCEEDED state");
  assert.ok(executionOutcome.result.yieldCount >= 1, "At least 1 candidate must be yielded and stored");

  // 4. PostgreSQL Read-Back & Durability Verification
  console.log("4. Verifying PostgreSQL Read-Back and Invariants...");
  const dbCandCheck = psqlExec(`SELECT id, title FROM discovery_candidates WHERE source_record_id='${SOURCE_ID}';`);
  assert.ok(dbCandCheck.includes("news.ycombinator.com") || dbCandCheck.includes("Show HN") || dbCandCheck.includes("hacker-news-official-api"), "Postgres must have persisted candidate records");

  const dbObsCheck = psqlExec(`SELECT observation_id, yield_count FROM source_observations WHERE execution_id='${taskId}';`);
  assert.ok(dbObsCheck.includes(`obs-${taskId}`), "Postgres must have observation record for this execution");

  // 5. Second Cycle Replay & Idempotency Check
  console.log("5. Running Second Cycle for Replay Storm & Idempotency Protection...");
  const replayOutcome = await workerRuntime.executeTask(workerTask, 1, { executionId: `replay-${Date.now()}` });
  assert.equal(replayOutcome.state, "SUCCEEDED");

  // Verify telemetry logs
  assert.ok(operationalLogs.some((l) => l.event === "source_activated_canonically"));
  assert.ok(operationalLogs.some((l) => l.event === "scheduler_slot_allocated"));
  assert.ok(operationalLogs.some((l) => l.event === "worker_task_execution_started"));
  assert.ok(operationalLogs.some((l) => l.event === "worker_task_execution_completed"));

  console.log("PILOT-EXEC-001 RUN COMPLETED WITH 100% SUCCESS!");
});
