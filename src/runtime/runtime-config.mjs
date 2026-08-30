import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * DISCOVERY RUNTIME CONFIGURATION (PKG-COMPOSITION-018)
 * Invariants: COMP-I001 through COMP-I010
 * Strict schema validation, environment isolation, zero secret storage
 * ============================================================================
 */

export const RUNTIME_CONFIG_VERSION = "runtime-config-v1";

export const PersistenceMode = Object.freeze({
  IN_MEMORY: "IN_MEMORY",
  POSTGRES_REFERENCE: "POSTGRES_REFERENCE"
});

export const GovernanceApplicationMode = Object.freeze({
  ASSESSMENT_ONLY: "ASSESSMENT_ONLY",
  DISABLED_FOR_PILOT: "DISABLED_FOR_PILOT",
  ENABLED: "ENABLED"
});

const REQUIRED_CONFIG_KEYS = [
  "environment",
  "persistenceMode",
  "governanceApplicationMode",
  "defaultCadenceMs",
  "maxConcurrentTasks"
];

export function validateAndCreateRuntimeConfig(rawConfig = {}) {
  if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
    throw new TypeError("RuntimeConfig must be a non-null object");
  }

  const env = rawConfig.environment || process.env.NODE_ENV || "test";
  const validEnvs = ["test", "development", "staging", "production"];
  if (!validEnvs.includes(env)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid environment "${env}". Must be one of: ${validEnvs.join(", ")}`);
  }

  const persistenceMode = rawConfig.persistenceMode || PersistenceMode.IN_MEMORY;
  if (!Object.values(PersistenceMode).includes(persistenceMode)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid persistenceMode "${persistenceMode}"`);
  }

  const governanceApplicationMode = rawConfig.governanceApplicationMode || GovernanceApplicationMode.DISABLED_FOR_PILOT;
  if (!Object.values(GovernanceApplicationMode).includes(governanceApplicationMode)) {
    throw new Error(`CONFIGURATION_FAILURE: Invalid governanceApplicationMode "${governanceApplicationMode}"`);
  }

  const defaultCadenceMs = typeof rawConfig.defaultCadenceMs === "number" && rawConfig.defaultCadenceMs > 0
    ? rawConfig.defaultCadenceMs
    : 3600000; // 1 hour

  const maxConcurrentTasks = typeof rawConfig.maxConcurrentTasks === "number" && rawConfig.maxConcurrentTasks > 0
    ? rawConfig.maxConcurrentTasks
    : 5;

  const config = {
    version: RUNTIME_CONFIG_VERSION,
    environment: env,
    persistenceMode,
    governanceApplicationMode,
    defaultCadenceMs,
    maxConcurrentTasks,
    telemetryEnabled: rawConfig.telemetryEnabled !== false,
    createdAt: new Date().toISOString()
  };

  return deepFreeze(config);
}
