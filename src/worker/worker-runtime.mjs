import { deepFreeze } from "../discovery/discovery-intake.mjs";
import { telemetry, redactSensitiveData } from "../observability/telemetry.mjs";
import {
  TaskState,
  classifyWorkerError,
  isRetryableFailure,
  calculateBackoffMs,
  createWorkerTask
} from "./worker-task.mjs";

/**
 * ============================================================================
 * DISCOVERY WORKER RUNTIME & EXECUTION ENGINE (PKG-WORKER-014 / PKG-SECRETS-016)
 * Invariants: WORK-I001 through WORK-I027, SEC-I008 through SEC-I016
 * ============================================================================
 */

export class HandlerRegistry {
  constructor() {
    this.handlers = new Map();
  }

  register(taskType, handlerFn) {
    if (!taskType || typeof handlerFn !== "function") {
      throw new TypeError("taskType and handler function are required");
    }
    this.handlers.set(taskType, handlerFn);
  }

  get(taskType) {
    return this.handlers.get(taskType) || null;
  }
}

export class WorkerRuntime {
  constructor(handlerRegistry = new HandlerRegistry()) {
    this.registry = handlerRegistry;
    this.attemptHistory = new Map(); // taskId -> [attemptRecord]
  }

  async executeTask(taskInput, attemptNumber = 1) {
    let task;
    try {
      task = createWorkerTask(taskInput);
    } catch (err) {
      telemetry.recordCounter("worker_task_rejected", 1, { reason: "SCHEMA_INVALID" });
      return deepFreeze({
        taskId: taskInput?.taskId || "unknown",
        state: TaskState.REJECTED,
        error: { message: err.message, classification: "DOMAIN_VALIDATION_FAILURE" },
        attempts: []
      });
    }

    const handler = this.registry.get(task.taskType);
    if (!handler) {
      telemetry.recordCounter("worker_task_final_failure", 1, {
        taskType: task.taskType,
        reason: "UNKNOWN_TASK_TYPE"
      });
      return deepFreeze({
        taskId: task.taskId,
        state: TaskState.FINAL_FAILURE,
        error: { message: `No handler registered for taskType: ${task.taskType}`, classification: "DOMAIN_VALIDATION_FAILURE" },
        attempts: []
      });
    }

    // Telemetry trace span (taskId included in trace correlation, excluded from metric labels)
    const span = telemetry.startSpan("worker.task.execute", {
      taskType: task.taskType,
      sourceId: task.sourceId,
      attemptNumber
    });

    telemetry.recordCounter("worker_task_started", 1, {
      taskType: task.taskType,
      sourceId: task.sourceId
    });

    const startTime = Date.now();
    let attemptRecord;

    try {
      const rawResult = await handler(task, { attemptNumber });
      const durationMs = Date.now() - startTime;
      const sanitizedResult = redactSensitiveData(rawResult);

      span.setStatus("OK", "Task completed successfully");
      span.end();

      attemptRecord = deepFreeze({
        attemptNumber,
        status: TaskState.SUCCEEDED,
        durationMs,
        result: sanitizedResult,
        timestamp: new Date().toISOString()
      });

      this._recordAttempt(task.taskId, attemptRecord);
      telemetry.recordCounter("worker_task_succeeded", 1, {
        taskType: task.taskType,
        sourceId: task.sourceId
      });

      return deepFreeze({
        taskId: task.taskId,
        state: TaskState.SUCCEEDED,
        result: sanitizedResult,
        attempts: this.getAttemptsForTask(task.taskId)
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const classification = classifyWorkerError(error);
      const isRetryable = isRetryableFailure(classification);
      const isExhausted = attemptNumber >= task.maxAttempts;

      const sanitizedErrMsg = redactSensitiveData(error.message || String(error));
      span.recordException(error);
      span.setStatus("ERROR", sanitizedErrMsg);
      span.end();

      let finalState;
      let nextBackoffMs = null;

      if (!isRetryable) {
        finalState = TaskState.FINAL_FAILURE;
        telemetry.recordCounter("worker_task_final_failure", 1, {
          taskType: task.taskType,
          sourceId: task.sourceId,
          failureKind: classification
        });
      } else if (isExhausted) {
        finalState = TaskState.EXHAUSTED;
        telemetry.recordCounter("worker_task_exhausted", 1, {
          taskType: task.taskType,
          sourceId: task.sourceId,
          failureKind: classification
        });
      } else {
        finalState = TaskState.RETRYABLE_FAILURE;
        const retryAfterMs = typeof error.retryAfterMs === "number" ? error.retryAfterMs : null;
        nextBackoffMs = calculateBackoffMs(attemptNumber, 1000, 60000, retryAfterMs);
        telemetry.recordCounter("worker_task_retryable_failure", 1, {
          taskType: task.taskType,
          sourceId: task.sourceId,
          failureKind: classification
        });
      }

      attemptRecord = deepFreeze({
        attemptNumber,
        status: finalState,
        durationMs,
        error: {
          message: sanitizedErrMsg,
          classification,
          isRetryable
        },
        nextBackoffMs,
        timestamp: new Date().toISOString()
      });

      this._recordAttempt(task.taskId, attemptRecord);

      return deepFreeze({
        taskId: task.taskId,
        state: finalState,
        error: attemptRecord.error,
        nextBackoffMs,
        attempts: this.getAttemptsForTask(task.taskId)
      });
    }
  }

  _recordAttempt(taskId, attemptRecord) {
    if (!this.attemptHistory.has(taskId)) {
      this.attemptHistory.set(taskId, []);
    }
    this.attemptHistory.get(taskId).push(attemptRecord);
  }

  getAttemptsForTask(taskId) {
    const list = this.attemptHistory.get(taskId) || [];
    return Object.freeze([...list]);
  }
}
