import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";
import { redactSecretText } from "../secrets/secret-redaction.mjs";
import {
  validateAndCreateRuntimeConfig,
  RuntimeMode,
  PersistenceMode
} from "./runtime-config.mjs";

/**
 * ============================================================================
 * RUNTIME LIFECYCLE & PROCESS CONTROLLER (PKG-RUNTIME-HARDEN-020)
 * Invariants: RUNTIME-I001 through RUNTIME-I040
 * Lifecycle states, liveness/readiness gates, overlap protection, graceful stop
 * ============================================================================
 */

export const LifecycleState = Object.freeze({
  CREATED: "CREATED",
  STARTING: "STARTING",
  READY: "READY",
  STOPPING: "STOPPING",
  STOPPED: "STOPPED",
  FAILED: "FAILED"
});

export class SystemClock {
  now() {
    return new Date();
  }
  nowIso() {
    return new Date().toISOString();
  }
}

export class DeterministicClock {
  constructor(initialIso = "2026-08-30T10:00:00.000Z") {
    validateIsoTimestamp(initialIso, "initialIso");
    this.currentMs = Date.parse(initialIso);
  }

  advance(ms) {
    if (!Number.isInteger(ms) || ms < 0) throw new TypeError("ms must be non-negative integer");
    this.currentMs += ms;
  }

  set(iso) {
    validateIsoTimestamp(iso, "iso");
    this.currentMs = Date.parse(iso);
  }

  now() {
    return new Date(this.currentMs);
  }

  nowIso() {
    return new Date(this.currentMs).toISOString();
  }
}

export class HardenedRuntimeController {
  constructor(dependencies = {}) {
    const {
      config = validateAndCreateRuntimeConfig(),
      runtimeHost,
      postgresClient = null,
      clock = new SystemClock(),
      ownedResources = []
    } = dependencies;

    if (!runtimeHost) {
      throw new TypeError("VALIDATION_FAILURE: runtimeHost is required");
    }

    this.config = config;
    this.runtimeHost = runtimeHost;
    this.postgresClient = postgresClient;
    this.clock = clock;
    this.ownedResources = [...ownedResources];

    this.state = LifecycleState.CREATED;
    this.isCycleRunning = false;
    this.activeTaskCount = 0;
    this.lastCycleCompletedAt = null;
    this.startupError = null;
    this.ownedResourcesClosed = false;
  }

  /**
   * STARTUP & READINESS GATE (RUNTIME-I001 - RUNTIME-I008)
   */
  async start() {
    if (this.state === LifecycleState.READY) {
      return { success: true, replayed: true, state: this.state };
    }
    if (this.state === LifecycleState.STARTING) {
      throw new Error("RUNTIME_STATE_CONFLICT: Runtime is already in STARTING state");
    }
    if (this.state === LifecycleState.STOPPING || this.state === LifecycleState.STOPPED) {
      throw new Error(`RUNTIME_STATE_CONFLICT: Cannot start runtime from ${this.state} state`);
    }

    this.state = LifecycleState.STARTING;
    const span = telemetry.startSpan("runtime.lifecycle.start", {
      runtimeMode: this.config.runtimeMode,
      persistenceMode: this.config.persistenceMode
    });

    try {
      // 1. Dependency validation
      if (!this.runtimeHost.sourceStore) {
        throw new Error("STARTUP_VALIDATION_FAILURE: SourceStore dependency missing");
      }

      // 2. PostgreSQL Readiness Gate (RUNTIME-I034: Fail-closed, no silent in-memory fallback)
      if (this.config.runtimeMode === RuntimeMode.POSTGRES_STANDALONE || this.config.persistenceMode === PersistenceMode.POSTGRES_DURABLE) {
        if (!this.postgresClient || typeof this.postgresClient.query !== "function") {
          throw new Error("POSTGRES_CONNECTION_FAILURE: PostgreSQL mode requested but no connected client available");
        }
        // Test probe
        await this.postgresClient.query("SELECT 1;");
      }

      this.state = LifecycleState.READY;
      telemetry.recordCounter("runtime_ready", 1, { runtimeMode: this.config.runtimeMode });
      span.setStatus("OK", "Runtime successfully started and READY");
      span.end();

      return { success: true, replayed: false, state: this.state };
    } catch (err) {
      this.state = LifecycleState.FAILED;
      const redactedMsg = redactSecretText(err.message);
      this.startupError = redactedMsg;
      telemetry.recordCounter("runtime_startup_failed", 1, { runtimeMode: this.config.runtimeMode });
      span.setStatus("ERROR", redactedMsg);
      span.end();
      throw new Error(`STARTUP_FAILED: ${redactedMsg}`);
    }
  }

  /**
   * LIVENESS PROBE (RUNTIME-I009)
   */
  getLiveness() {
    const isLive = this.state !== LifecycleState.FAILED && this.state !== LifecycleState.STOPPED;
    return deepFreeze({
      live: isLive,
      state: this.state,
      timestamp: this.clock.nowIso()
    });
  }

  /**
   * READINESS PROBE (RUNTIME-I010 - RUNTIME-I012, RUNTIME-I037)
   */
  getReadiness() {
    const isReady = this.state === LifecycleState.READY;
    const isDurable = this.config.persistenceMode === PersistenceMode.POSTGRES_DURABLE;

    const components = {
      sourceStore: !!this.runtimeHost.sourceStore,
      workerRuntime: !!this.runtimeHost.workerRuntime,
      secretResolver: !!this.runtimeHost.secretResolver,
      database: isDurable ? !!this.postgresClient : "REFERENCE_IN_MEMORY"
    };

    return deepFreeze({
      ready: isReady,
      durable: isDurable,
      state: this.state,
      components,
      activeTasks: this.activeTaskCount,
      isCycleRunning: this.isCycleRunning,
      lastCycleCompletedAt: this.lastCycleCompletedAt,
      timestamp: this.clock.nowIso()
    });
  }

  /**
   * BOUNDED CYCLE EXECUTION WITH OVERLAP PROTECTION (RUNTIME-I013 - RUNTIME-I017)
   */
  async triggerCycle(explicitDate = null) {
    if (this.state !== LifecycleState.READY) {
      throw new Error(`CYCLE_REJECTED: Runtime is not READY (Current state: ${this.state})`);
    }

    if (this.isCycleRunning) {
      telemetry.recordCounter("runtime_cycle_overlap_rejected", 1);
      const err = new Error("OVERLAPPING_CYCLE_REJECTED: An active discovery cycle is already in progress");
      err.code = "OVERLAPPING_CYCLE_REJECTED";
      throw err;
    }

    this.isCycleRunning = true;
    const cycleDate = explicitDate || this.clock.now();

    try {
      const cycleResult = await this.runtimeHost.runScheduledDiscoveryCycle(cycleDate);
      this.lastCycleCompletedAt = this.clock.nowIso();
      return cycleResult;
    } finally {
      this.isCycleRunning = false;
    }
  }

  /**
   * GRACEFUL SHUTDOWN & RESOURCE CLEANUP (RUNTIME-I021 - RUNTIME-I026)
   */
  async stop({ timeoutMs = this.config.shutdownTimeoutMs } = {}) {
    if (this.state === LifecycleState.STOPPED) {
      return { success: true, replayed: true, state: this.state };
    }
    if (this.state === LifecycleState.STOPPING) {
      return { success: true, replayed: true, state: this.state };
    }

    this.state = LifecycleState.STOPPING;
    const span = telemetry.startSpan("runtime.lifecycle.stop", {
      shutdownTimeoutMs: timeoutMs
    });

    const startMs = Date.now();
    let timedOut = false;

    // Wait for in-flight cycle / tasks to complete up to timeoutMs
    while ((this.isCycleRunning || this.activeTaskCount > 0) && (Date.now() - startMs < timeoutMs)) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (this.isCycleRunning || this.activeTaskCount > 0) {
      timedOut = true;
      telemetry.recordCounter("runtime_shutdown_timeout", 1);
    }

    // Close only owned resources exactly once (RUNTIME-I026)
    if (!this.ownedResourcesClosed) {
      for (const res of this.ownedResources) {
        if (res && typeof res.close === "function") {
          try { await res.close(); } catch (_) {}
        }
      }
      this.ownedResourcesClosed = true;
    }

    this.state = LifecycleState.STOPPED;
    telemetry.recordCounter("runtime_stopped", 1);
    span.setStatus("OK", timedOut ? "Shutdown timed out with incomplete tasks" : "Graceful shutdown complete");
    span.end();

    return {
      success: true,
      timedOut,
      state: this.state,
      stoppedAt: this.clock.nowIso()
    };
  }

  /**
   * PROCESS SIGNAL ADAPTERS (RUNTIME-I024)
   */
  attachSignalHandlers(processObj = process) {
    const handleSignal = async (sig) => {
      telemetry.recordCounter("runtime_signal_received", 1, { signal: sig });
      await this.stop();
    };

    if (processObj && typeof processObj.on === "function") {
      processObj.on("SIGTERM", () => handleSignal("SIGTERM"));
      processObj.on("SIGINT", () => handleSignal("SIGINT"));
    }
  }
}
