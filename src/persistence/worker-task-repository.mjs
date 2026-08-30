import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";

/**
 * ============================================================================
 * WORKER TASK REPOSITORY (PKG-STATE-019)
 * Invariants: STATE-I018 through STATE-I028
 * Durable task ledger, lease claim, stale token protection, attempt ledger
 * ============================================================================
 */

export const TaskExecutionState = Object.freeze({
  PENDING: "PENDING",
  CLAIMED: "CLAIMED",
  SUCCEEDED: "SUCCEEDED",
  RETRYABLE_FAILURE: "RETRYABLE_FAILURE",
  FINAL_FAILURE: "FINAL_FAILURE",
  EXHAUSTED: "EXHAUSTED"
});

export class WorkerTaskRepository {
  constructor() {
    this.tasks = new Map(); // taskId -> taskRecord
    this.attempts = []; // Array of attempt records
  }

  createTask(task) {
    if (!task || !task.taskId || !task.taskType || !task.sourceId) {
      throw new TypeError("VALIDATION_FAILURE: taskId, taskType, and sourceId are required");
    }

    // Secret-free payload validation (STATE-I026)
    if (task.payload && JSON.stringify(task.payload).includes("secretToken")) {
      throw new Error("SECRET_LEAKAGE_PREVENTION: Raw secret found in task payload");
    }

    const existing = this.tasks.get(task.taskId);
    if (existing) {
      // Check if exact same payload (Idempotent replay)
      if (existing.taskType === task.taskType && existing.sourceId === task.sourceId) {
        return deepFreeze({ created: false, replayed: true, task: deepFreeze({ ...existing }) });
      }
      throw new Error(`TASK_CONFLICT: Task ${task.taskId} already exists with conflicting attributes`);
    }

    const taskRecord = {
      taskId: task.taskId,
      taskType: task.taskType,
      sourceId: task.sourceId,
      state: TaskExecutionState.PENDING,
      maxAttempts: task.maxAttempts || 3,
      currentAttempt: 0,
      payload: task.payload ? { ...task.payload } : {},
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      claimRevision: 0,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(task.taskId, taskRecord);
    return deepFreeze({ created: true, replayed: false, task: deepFreeze({ ...taskRecord }) });
  }

  getTask(taskId) {
    const task = this.tasks.get(taskId);
    return task ? deepFreeze({ ...task }) : null;
  }

  /**
   * Lease claim & reclaim with optimistic claim revision (STATE-I024 - STATE-I025)
   */
  claimTask(workerId, { leaseDurationMs = 60000, asOfDate = new Date() } = {}) {
    if (!workerId) throw new TypeError("workerId is required");
    const nowMs = asOfDate.getTime();

    for (const task of this.tasks.values()) {
      const isPending = task.state === TaskExecutionState.PENDING;
      const isClaimedExpired = task.state === TaskExecutionState.CLAIMED &&
        task.leaseExpiresAt &&
        Date.parse(task.leaseExpiresAt) < nowMs;
      const isRetryable = task.state === TaskExecutionState.RETRYABLE_FAILURE;

      if ((isPending || isClaimedExpired || isRetryable) && task.currentAttempt < task.maxAttempts) {
        const isReclaim = isClaimedExpired;
        const newClaimRevision = task.claimRevision + 1;
        const leaseToken = `tok:${task.taskId}:${newClaimRevision}:${nowMs}`;
        const leaseExpiresAt = new Date(nowMs + leaseDurationMs).toISOString();

        task.state = TaskExecutionState.CLAIMED;
        task.leaseOwner = workerId;
        task.leaseToken = leaseToken;
        task.leaseExpiresAt = leaseExpiresAt;
        task.claimRevision = newClaimRevision;
        task.currentAttempt += 1;
        task.updatedAt = asOfDate.toISOString();

        telemetry.recordCounter(isReclaim ? "worker_task_reclaimed" : "worker_task_claimed", 1, {
          taskType: task.taskType
        });

        return deepFreeze({
          claimed: true,
          isReclaim,
          leaseToken,
          task: deepFreeze({ ...task })
        });
      }
    }

    return deepFreeze({ claimed: false, task: null });
  }

  /**
   * Complete task with stale token protection (STATE-I025)
   */
  completeTask(taskId, leaseToken, { result = {}, completedAt = new Date().toISOString() } = {}) {
    validateIsoTimestamp(completedAt, "completedAt");
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`TASK_NOT_FOUND: Task ${taskId} does not exist`);

    if (task.leaseToken !== leaseToken) {
      telemetry.recordCounter("worker_stale_claim_rejected", 1, { taskId });
      const err = new Error(`STALE_CLAIM_PROTECTION: Provided lease token is stale or expired for task ${taskId}`);
      err.code = "STALE_LEASE_TOKEN";
      throw err;
    }

    task.state = TaskExecutionState.SUCCEEDED;
    task.leaseOwner = null;
    task.leaseToken = null;
    task.leaseExpiresAt = null;
    task.completedAt = completedAt;
    task.result = result;
    task.updatedAt = completedAt;

    telemetry.recordCounter("worker_task_completed", 1, { taskType: task.taskType });

    return deepFreeze({ success: true, task: deepFreeze({ ...task }) });
  }

  /**
   * Record immutable attempt (STATE-I019 - STATE-I021)
   */
  recordAttempt(taskId, attempt) {
    if (!taskId || !attempt || !attempt.attemptNumber || !attempt.workerId || !attempt.status) {
      throw new TypeError("VALIDATION_FAILURE: taskId, attemptNumber, workerId, and status are required");
    }

    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`TASK_NOT_FOUND: Task ${taskId} does not exist`);

    const attemptId = `att:${taskId}:${attempt.attemptNumber}`;
    const duplicate = this.attempts.find(a => a.attemptId === attemptId);
    if (duplicate) {
      return deepFreeze({ recorded: false, replayed: true, attempt: duplicate });
    }

    const startedAt = attempt.startedAt || new Date().toISOString();
    const finishedAt = attempt.finishedAt || new Date().toISOString();
    validateIsoTimestamp(startedAt, "attempt.startedAt");
    validateIsoTimestamp(finishedAt, "attempt.finishedAt");

    const attemptRecord = deepFreeze({
      attemptId,
      taskId,
      attemptNumber: attempt.attemptNumber,
      workerId: attempt.workerId,
      status: attempt.status,
      errorMessage: attempt.errorMessage || null,
      errorClassification: attempt.errorClassification || null,
      durationMs: attempt.durationMs || 0,
      startedAt,
      finishedAt
    });

    this.attempts.push(attemptRecord);

    // Update task state on failure if not succeeded
    if (attempt.status !== "SUCCESS") {
      if (attempt.errorClassification === "FINAL_FAILURE") {
        task.state = TaskExecutionState.FINAL_FAILURE;
      } else if (task.currentAttempt >= task.maxAttempts) {
        task.state = TaskExecutionState.EXHAUSTED;
      } else {
        task.state = TaskExecutionState.RETRYABLE_FAILURE;
      }
      task.updatedAt = finishedAt;
    }

    return deepFreeze({ recorded: true, replayed: false, attempt: attemptRecord });
  }

  getAttemptsForTask(taskId) {
    return this.attempts.filter(a => a.taskId === taskId).map(a => deepFreeze({ ...a }));
  }
}
