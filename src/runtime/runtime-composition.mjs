import { deepFreeze } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";
import { evaluateSchedule, DEFAULT_SCHEDULING_POLICY, SchedulingOutcome } from "../scheduler/scheduling-engine.mjs";
import { TaskType, createWorkerTask } from "../worker/worker-task.mjs";
import { HandlerRegistry, WorkerRuntime } from "../worker/worker-runtime.mjs";
import { SecretPurpose } from "../secrets/secret-resolver.mjs";
import { normalizeCollectedItem } from "../collection/normalize.mjs";
import { evaluateGovernance } from "../source-registry/source-governance.mjs";
import { SourceGovernanceApplier } from "../source-registry/source-governance.mjs";
import { evaluateSourceHealth } from "../source-registry/source-health-evaluator.mjs";
import { validateAndCreateRuntimeConfig, GovernanceApplicationMode } from "./runtime-config.mjs";

/**
 * ============================================================================
 * DISCOVERY RUNTIME COMPOSITION ROOT (PKG-COMPOSITION-018)
 * Invariants: COMP-I001 through COMP-I040
 * Composition of Scheduler, Worker, Secrets, Collectors, Pipeline, Governance
 * ============================================================================
 */

export class CollectorRegistry {
  constructor() {
    this.collectors = new Map();
  }

  register(collectorType, collectorFn) {
    if (!collectorType || typeof collectorFn !== "function") {
      throw new TypeError("collectorType and collectorFn function are required");
    }
    this.collectors.set(collectorType, collectorFn);
  }

  get(collectorType) {
    return this.collectors.get(collectorType) || null;
  }
}

export class ReferenceCandidateStore {
  constructor() {
    this.candidates = new Map();
  }

  save(candidate) {
    if (!candidate || !candidate.url) {
      throw new TypeError("Candidate with url is required");
    }
    if (!this.candidates.has(candidate.url)) {
      this.candidates.set(candidate.url, deepFreeze({ ...candidate, savedAt: new Date().toISOString() }));
      return { saved: true, created: true, candidate: this.candidates.get(candidate.url) };
    }
    return { saved: true, created: false, candidate: this.candidates.get(candidate.url) };
  }

  getByUrl(url) {
    return this.candidates.get(url) || null;
  }

  getAll() {
    return Array.from(this.candidates.values());
  }
}

export class ReferenceObservationLedger {
  constructor() {
    this.observations = [];
  }

  record(observation) {
    if (!observation || !observation.id) {
      throw new TypeError("Observation with id is required");
    }
    const exists = this.observations.some(o => o.id === observation.id);
    if (!exists) {
      this.observations.push(deepFreeze({ ...observation, recordedAt: new Date().toISOString() }));
      return { recorded: true, created: true };
    }
    return { recorded: true, created: false };
  }

  getForSource(sourceId) {
    return this.observations.filter(o => o.sourceId === sourceId);
  }

  getAll() {
    return [...this.observations];
  }
}

export class DiscoveryRuntimeHost {
  constructor(dependencies = {}) {
    const {
      config = validateAndCreateRuntimeConfig(),
      sourceStore,
      secretResolver,
      collectorRegistry = new CollectorRegistry(),
      candidateStore = new ReferenceCandidateStore(),
      observationLedger = new ReferenceObservationLedger(),
      schedulingPolicy = DEFAULT_SCHEDULING_POLICY
    } = dependencies;

    if (!sourceStore || (typeof sourceStore.list !== "function" && typeof sourceStore.getAll !== "function")) {
      throw new TypeError("VALIDATION_FAILURE: Valid sourceStore dependency is required");
    }

    this.config = config;
    this.sourceStore = sourceStore;
    this.secretResolver = secretResolver;
    this.collectorRegistry = collectorRegistry;
    this.candidateStore = candidateStore;
    this.observationLedger = observationLedger;
    this.schedulingPolicy = schedulingPolicy;

    this.handlerRegistry = new HandlerRegistry();
    this._wireDefaultHandlers();

    this.workerRuntime = new WorkerRuntime(this.handlerRegistry, this.secretResolver);
    this.dispatchedSlotHistory = new Set();
    this.sourceSchedulingStates = new Map();
  }

  async _getSources() {
    if (typeof this.sourceStore.list === "function") {
      const res = this.sourceStore.list();
      return Array.isArray(res) ? res : await res;
    }
    if (typeof this.sourceStore.getAll === "function") {
      const res = this.sourceStore.getAll();
      return Array.isArray(res) ? res : await res;
    }
    return [];
  }

  _wireDefaultHandlers() {
    this.handlerRegistry.register(TaskType.DISCOVERY_EXECUTION, async (task, context) => {
      const { sourceId, metadata = {} } = task;
      const collectorType = metadata.collectorType || "mock";
      const collector = this.collectorRegistry.get(collectorType);

      if (!collector) {
        throw new Error(`HANDLER_FAILURE: Unknown collectorType "${collectorType}" for source ${sourceId}`);
      }

      let secretToken = null;
      if (metadata.credentialRef) {
        secretToken = await context.resolveSecret(metadata.credentialRef, SecretPurpose.COLLECTOR_EXECUTION);
      }

      const rawDocuments = await collector(task, { secretToken, ...context });

      const normalizedResults = [];
      for (const doc of (Array.isArray(rawDocuments) ? rawDocuments : [rawDocuments])) {
        if (!doc) continue;
        const normalizedDoc = normalizeCollectedItem(doc, { sourceId });

        const candidateRecord = {
          url: normalizedDoc.url,
          sourceId: normalizedDoc.sourceId,
          sourceClaim: doc.metadata?.sourceClaim || "SOURCE_CLAIM",
          title: normalizedDoc.title,
          summary: normalizedDoc.summary,
          isConfidential: doc.metadata?.isConfidential === true
        };
        const saveRes = this.candidateStore.save(candidateRecord);

        const observation = {
          id: `obs:${sourceId}:${normalizedDoc.externalId}`,
          sourceId,
          occurredAt: new Date().toISOString(),
          success: true,
          status: "SUCCESS",
          documentsExtracted: 1,
          durationMs: 50,
          httpStatus: 200
        };
        this.observationLedger.record(observation);

        normalizedResults.push({
          externalId: normalizedDoc.externalId,
          url: normalizedDoc.url,
          isNewCandidate: saveRes.created
        });
      }

      return {
        sourceId,
        processedCount: normalizedResults.length,
        documents: normalizedResults
      };
    });
  }

  async runScheduledDiscoveryCycle(asOfDate = new Date()) {
    const asOfIso = asOfDate.toISOString();
    const span = telemetry.startSpan("runtime.data_plane.cycle", {
      asOfDate: asOfIso
    });

    const sources = await this._getSources();
    const cycleResults = [];

    for (const source of sources) {
      try {
        const currentState = this.sourceSchedulingStates.get(source.id) || {};
        const scheduleDecision = evaluateSchedule(source, currentState, this.schedulingPolicy, asOfIso);

        if (scheduleDecision.outcome !== SchedulingOutcome.DUE) {
          cycleResults.push({
            sourceId: source.id,
            executed: false,
            outcome: scheduleDecision.outcome,
            reason: scheduleDecision.reason
          });
          continue;
        }

        // Slot replay protection
        if (this.dispatchedSlotHistory.has(scheduleDecision.slotId)) {
          cycleResults.push({
            sourceId: source.id,
            executed: false,
            outcome: "REPLAYED",
            reason: "SLOT_ALREADY_DISPATCHED"
          });
          continue;
        }

        const task = createWorkerTask({
          taskId: scheduleDecision.taskId,
          taskType: TaskType.DISCOVERY_EXECUTION,
          sourceId: source.id,
          maxAttempts: 3,
          metadata: {
            slotId: scheduleDecision.slotId,
            collectorType: source.metadata?.collectorType || "mock",
            credentialRef: source.metadata?.credentialRef || null
          }
        });

        this.dispatchedSlotHistory.add(scheduleDecision.slotId);
        this.sourceSchedulingStates.set(source.id, {
          lastDispatchedSlotId: scheduleDecision.slotId,
          lastDispatchedAt: asOfIso
        });

        const execResult = await this.workerRuntime.executeTask(task);

        cycleResults.push({
          sourceId: source.id,
          executed: true,
          taskId: task.taskId,
          state: execResult.state,
          result: execResult.result || null,
          error: execResult.error || null
        });
      } catch (sourceErr) {
        telemetry.recordCounter("runtime_source_cycle_error", 1, { sourceId: source.id });
        cycleResults.push({
          sourceId: source.id,
          executed: false,
          error: { message: sourceErr.message, classification: "SOURCE_EXECUTION_FAILURE" }
        });
      }
    }

    span.setStatus("OK", "Data plane cycle completed");
    span.end();

    return deepFreeze({
      cycleTimestamp: asOfIso,
      evaluatedSourcesCount: sources.length,
      executedCount: cycleResults.filter(r => r.executed).length,
      results: cycleResults
    });
  }

  async runControlPlaneGovernanceCycle(windowStart, windowEnd) {
    const windowStartIso = windowStart.toISOString();
    const windowEndIso = windowEnd.toISOString();

    const span = telemetry.startSpan("runtime.control_plane.cycle", {
      windowStart: windowStartIso,
      windowEnd: windowEndIso
    });

    const sources = await this._getSources();
    const governanceEvaluations = [];

    for (const source of sources) {
      const sourceObservations = this.observationLedger.getForSource(source.id);
      const windowEvaluation = evaluateSourceHealth(source.id, sourceObservations, {
        windowStart: windowStartIso,
        windowEnd: windowEndIso,
        evaluatedAt: windowEndIso
      });

      const decision = evaluateGovernance(source, [windowEvaluation], { decisionAt: windowEndIso });

      let applicationResult = { applied: false, reason: "GOVERNANCE_AUTO_MUTATION_DISABLED_FOR_PILOT" };

      if (this.config.governanceApplicationMode === GovernanceApplicationMode.ENABLED) {
        const applier = new SourceGovernanceApplier();
        applicationResult = applier.applyDecision(source, decision);
      }

      governanceEvaluations.push({
        sourceId: source.id,
        currentState: source.status,
        windowEvaluation,
        decision,
        applicationResult
      });
    }

    span.setStatus("OK", "Control plane cycle completed");
    span.end();

    return deepFreeze({
      cycleTimestamp: new Date().toISOString(),
      governanceApplicationMode: this.config.governanceApplicationMode,
      evaluations: governanceEvaluations
    });
  }
}
