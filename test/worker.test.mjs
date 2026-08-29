import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TaskType,
  TaskState,
  calculateBackoffMs,
  createWorkerTask,
  classifyWorkerError
} from "../src/worker/worker-task.mjs";
import { HandlerRegistry, WorkerRuntime } from "../src/worker/worker-runtime.mjs";
import { TelemetryFacade } from "../src/observability/telemetry.mjs";
import { InMemoryTelemetryAdapter } from "../src/observability/otel-adapter.mjs";

test("WORKER: valid DISCOVERY_EXECUTION task executes successfully to SUCCEEDED", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task) => {
    return { yieldCount: 5, status: "PROCESSED" };
  });

  const runtime = new WorkerRuntime(registry);
  const task = {
    taskId: "task-1",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1"
  };

  const res = await runtime.executeTask(task);
  assert.strictEqual(res.state, TaskState.SUCCEEDED);
  assert.strictEqual(res.result.yieldCount, 5);
  assert.strictEqual(res.attempts.length, 1);
  assert.strictEqual(res.attempts[0].status, TaskState.SUCCEEDED);
});

test("WORKER: unknown task type returns FINAL_FAILURE without crashing", async () => {
  const registry = new HandlerRegistry();
  const runtime = new WorkerRuntime(registry);
  const task = {
    taskId: "task-unknown",
    taskType: "UNKNOWN_TYPE",
    sourceId: "src-1"
  };

  const res = await runtime.executeTask(task);
  assert.strictEqual(res.state, TaskState.REJECTED);
});

test("WORKER: transient network failure produces RETRYABLE_FAILURE with backoff", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async () => {
    const err = new Error("ECONNRESET: connection dropped");
    throw err;
  });

  const runtime = new WorkerRuntime(registry);
  const task = {
    taskId: "task-transient",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1",
    maxAttempts: 3
  };

  const res = await runtime.executeTask(task, 1);
  assert.strictEqual(res.state, TaskState.RETRYABLE_FAILURE);
  assert.strictEqual(res.error.isRetryable, true);
  assert.strictEqual(typeof res.nextBackoffMs, "number");
  assert.ok(res.nextBackoffMs > 0);
});

test("WORKER: 429 rate-limit failure extracts retryAfterMs and applies bounded backoff", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async () => {
    const err = new Error("429 Too Many Requests");
    err.statusCode = 429;
    err.retryAfterMs = 5000;
    throw err;
  });

  const runtime = new WorkerRuntime(registry);
  const task = {
    taskId: "task-429",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1"
  };

  const res = await runtime.executeTask(task, 1);
  assert.strictEqual(res.state, TaskState.RETRYABLE_FAILURE);
  assert.strictEqual(res.error.classification, "RATE_LIMIT_PRESSURE");
  assert.strictEqual(res.nextBackoffMs, 5000);
});

test("WORKER: 401 unauthorized failure fails permanently without infinite retries (FINAL_FAILURE)", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async () => {
    const err = new Error("401 Unauthorized: invalid API key");
    err.statusCode = 401;
    throw err;
  });

  const runtime = new WorkerRuntime(registry);
  const task = {
    taskId: "task-401",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1"
  };

  const res = await runtime.executeTask(task, 1);
  assert.strictEqual(res.state, TaskState.FINAL_FAILURE);
  assert.strictEqual(res.error.isRetryable, false);
  assert.strictEqual(res.nextBackoffMs, null);
});

test("WORKER: final attempt reaching maxAttempts produces EXHAUSTED", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async () => {
    throw new Error("Temporary 503 unavailable");
  });

  const runtime = new WorkerRuntime(registry);
  const task = {
    taskId: "task-exhausted",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1",
    maxAttempts: 3
  };

  const res = await runtime.executeTask(task, 3); // 3rd attempt == maxAttempts
  assert.strictEqual(res.state, TaskState.EXHAUSTED);
});

test("WORKER: Task A throws, Task B succeeds (Failure Isolation WORK-I015)", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task) => {
    if (task.taskId === "task-fail") throw new Error("Catastrophic error in Task A");
    return { ok: true, taskId: task.taskId };
  });

  const runtime = new WorkerRuntime(registry);

  const resA = await runtime.executeTask({ taskId: "task-fail", taskType: TaskType.DISCOVERY_EXECUTION, sourceId: "src-1" });
  const resB = await runtime.executeTask({ taskId: "task-success", taskType: TaskType.DISCOVERY_EXECUTION, sourceId: "src-2" });

  assert.strictEqual(resA.state, TaskState.RETRYABLE_FAILURE);
  assert.strictEqual(resB.state, TaskState.SUCCEEDED);
  assert.strictEqual(resB.result.ok, true);
});

test("WORKER: Secret-bearing error message is redacted in attempt error (WORK-I020)", async () => {
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async () => {
    throw new Error("Failed connecting to postgresql://user:superSecretPass@localhost:5432/db");
  });

  const runtime = new WorkerRuntime(registry);
  const res = await runtime.executeTask({ taskId: "task-sec", taskType: TaskType.DISCOVERY_EXECUTION, sourceId: "src-1" });

  assert.ok(!res.error.message.includes("superSecretPass"));
  assert.ok(res.error.message.includes("***"));
});

test("WORKER: Backoff calculation is deterministic and capped by maxBackoffMs", () => {
  const delay1 = calculateBackoffMs(1, 1000, 60000);
  const delay2 = calculateBackoffMs(2, 1000, 60000);
  const delay3 = calculateBackoffMs(3, 1000, 60000);
  const delay10 = calculateBackoffMs(10, 1000, 60000);

  assert.strictEqual(delay1, 1000);
  assert.strictEqual(delay2, 2000);
  assert.strictEqual(delay3, 4000);
  assert.strictEqual(delay10, 60000); // capped at maxMs
});

test("WORKER: Attempt history is append-only and retains immutable record trail", async () => {
  const registry = new HandlerRegistry();
  let attemptCount = 0;
  registry.register(TaskType.DISCOVERY_EXECUTION, async () => {
    attemptCount++;
    if (attemptCount === 1) throw new Error("503 timeout");
    return { completed: true };
  });

  const runtime = new WorkerRuntime(registry);
  const task = { taskId: "task-hist", taskType: TaskType.DISCOVERY_EXECUTION, sourceId: "src-1" };

  await runtime.executeTask(task, 1);
  const res2 = await runtime.executeTask(task, 2);

  assert.strictEqual(res2.state, TaskState.SUCCEEDED);
  const attempts = runtime.getAttemptsForTask("task-hist");
  assert.strictEqual(attempts.length, 2);
  assert.strictEqual(attempts[0].status, TaskState.RETRYABLE_FAILURE);
  assert.strictEqual(attempts[1].status, TaskState.SUCCEEDED);
});
