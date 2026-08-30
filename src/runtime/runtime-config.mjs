import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * DISCOVERY RUNTIME CONFIGURATION (PKG-RUNTIME-HARDEN-020)
 * Invariants: RUNTIME-I027 through RUNTIME-I030
 * Strict schema validation, environment isolation, zero secret storage
 * ============================================================================
 */

export const RUNTIME_CONFIG_VERSION = "runtime-config-v2";

export const RuntimeMode = Object.freeze({
  REFERENCE: "REFERENCE",
  POSTGRES_STANDALONE: "POSTGRES_STANDALONE"
});

export const PersistenceMode = Object.freeze({
  IN_MEMORY: "IN_MEMORY",
  POSTGRES_REFERENCE: "POSTGRES_REFERENCE",
  POSTGRES_DURABLE: "POSTGRES_DURABLE"
});

export const GovernanceApplicationMode = Object.freeze({
  ASSESSMENT_ONLY: "ASSESSMENT_ONLY",
  DISABLED_FOR_PILOT: "DISABLED_FOR_PILOT",
  ENABLED: "ENABLED"
});

export function validateAndCreateRuntimeConfig(rawConfig = {}) {
  if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
    throw new TypeError("RuntimeConfig must be a non-null object");
  }

  const env = rawConfig.environment || process.env.NODE_ENV || "test";
  const validEnvs = ["test", "development", "staging", "production"];
  if (!validEnvs.includes(env)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid environment "${env}". Must be one of: ${validEnvs.join(", ")}`);
  }

  const runtimeMode = rawConfig.runtimeMode || RuntimeMode.REFERENCE;
  if (!Object.values(RuntimeMode).includes(runtimeMode)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid runtimeMode "${runtimeMode}"`);
  }

  const persistenceMode = rawConfig.persistenceMode || (
    runtimeMode === RuntimeMode.POSTGRES_STANDALONE ? PersistenceMode.POSTGRES_DURABLE : PersistenceMode.IN_MEMORY
  );
  if (!Object.values(PersistenceMode).includes(persistenceMode)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid persistenceMode "${persistenceMode}"`);
  }

  const governanceApplicationMode = rawConfig.governanceApplicationMode || GovernanceApplicationMode.DISABLED_FOR_PILOT;
  if (!Object.values(GovernanceApplicationMode).includes(governanceApplicationMode)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid governanceApplicationMode "${governanceApplicationMode}"`);
  }

  const cycleIntervalMs = typeof rawConfig.cycleIntervalMs === "number" && rawConfig.cycleIntervalMs > 0
    ? rawConfig.cycleIntervalMs
    : (typeof rawConfig.defaultCadenceMs === "number" && rawConfig.defaultCadenceMs > 0 ? rawConfig.defaultCadenceMs : 3600000);

  const shutdownTimeoutMs = typeof rawConfig.shutdownTimeoutMs === "number" && rawConfig.shutdownTimeoutMs > 0
    ? rawConfig.shutdownTimeoutMs
    : 10000; // 10 seconds

  const maxConcurrentTasks = typeof rawConfig.maxConcurrentTasks === "number" && rawConfig.maxConcurrentTasks > 0
    ? rawConfig.maxConcurrentTasks
    : 5;

  const config = {
    version: RUNTIME_CONFIG_VERSION,
    environment: env,
    runtimeMode,
    persistenceMode,
    governanceApplicationMode,
    cycleIntervalMs,
    shutdownTimeoutMs,
    maxConcurrentTasks,
    telemetryEnabled: rawConfig.telemetryEnabled !== false,
    createdAt: new Date().toISOString()
  };

  return deepFreeze(config);
}
