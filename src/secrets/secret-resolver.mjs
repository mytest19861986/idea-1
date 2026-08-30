import { deepFreeze } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";
import { registerSecretForRedaction } from "./secret-redaction.mjs";

/**
 * ============================================================================
 * SECRET RESOLVER PORT & PURPOSE BINDING (PKG-SECRETS-016)
 * Invariants: SEC-I001 through SEC-I035
 * Secrets Contract Version: secrets-contract-v1
 * ============================================================================
 */

export const SECRETS_CONTRACT_VERSION = "secrets-contract-v1";

export const SecretPurpose = Object.freeze({
  COLLECTOR_EXECUTION: "COLLECTOR_EXECUTION",
  SOURCE_AUTHENTICATION: "SOURCE_AUTHENTICATION",
  DATABASE_CONNECTION: "DATABASE_CONNECTION",
  PERSISTENCE_ACCESS: "PERSISTENCE_ACCESS"
});

export const SecretPresence = Object.freeze({
  AVAILABLE: "AVAILABLE",
  MISSING: "MISSING",
  DENIED: "DENIED"
});

export const CREDENTIAL_PURPOSE_POLICIES = Object.freeze({
  "cred:source:trustmrr:api_key": {
    allowedPurposes: [SecretPurpose.COLLECTOR_EXECUTION, SecretPurpose.SOURCE_AUTHENTICATION],
    allowedEnvironments: ["test", "development", "staging", "production"]
  },
  "cred:source:trustmrr:bearer": {
    allowedPurposes: [SecretPurpose.COLLECTOR_EXECUTION, SecretPurpose.SOURCE_AUTHENTICATION],
    allowedEnvironments: ["test", "development", "staging", "production"]
  },
  "cred:system:database:rw": {
    allowedPurposes: [SecretPurpose.DATABASE_CONNECTION, SecretPurpose.PERSISTENCE_ACCESS],
    allowedEnvironments: ["test", "development", "staging", "production"]
  },
  "cred:system:database:ro": {
    allowedPurposes: [SecretPurpose.DATABASE_CONNECTION, SecretPurpose.PERSISTENCE_ACCESS],
    allowedEnvironments: ["test", "development", "staging", "production"]
  }
});

export class SecretResolver {
  constructor(provider, purposePolicies = CREDENTIAL_PURPOSE_POLICIES, currentEnvironment = process.env.NODE_ENV || "test") {
    if (!provider || typeof provider.getSecret !== "function") {
      throw new TypeError("valid SecretProvider with getSecret method is required");
    }
    this.provider = provider;
    this.policies = purposePolicies;
    this.environment = currentEnvironment;
  }

  _evaluateAccess(credentialRef, purpose, env = this.environment) {
    if (typeof credentialRef !== "string" || !Object.hasOwn(this.policies, credentialRef)) {
      return { allowed: false, reason: "UNKNOWN_CREDENTIAL_REF" };
    }

    const policy = this.policies[credentialRef];
    if (!policy || !Array.isArray(policy.allowedPurposes) || !policy.allowedPurposes.includes(purpose)) {
      return { allowed: false, reason: "UNAUTHORIZED_PURPOSE" };
    }
    if (!Array.isArray(policy.allowedEnvironments) || !policy.allowedEnvironments.includes(env)) {
      return { allowed: false, reason: "ENVIRONMENT_DISALLOWED" };
    }
    return { allowed: true, policy };
  }

  async checkSecretPresence(credentialRef, purpose, env = this.environment) {
    const access = this._evaluateAccess(credentialRef, purpose, env);
    if (!access.allowed) {
      return SecretPresence.DENIED;
    }

    try {
      const secret = await this.provider.getSecret(credentialRef);
      return secret ? SecretPresence.AVAILABLE : SecretPresence.MISSING;
    } catch (_) {
      return SecretPresence.MISSING;
    }
  }

  async resolveSecret(credentialRef, purpose, env = this.environment) {
    const span = telemetry.startSpan("secret.resolve", {
      credentialRef,
      purpose,
      environment: env
    });

    telemetry.recordCounter("secret_resolution_attempted", 1, {
      purpose: String(purpose)
    });

    const access = this._evaluateAccess(credentialRef, purpose, env);
    if (!access.allowed) {
      span.setStatus("ERROR", `Secret resolution denied: ${access.reason}`);
      span.end();

      telemetry.recordCounter("secret_resolution_denied", 1, {
        reason: access.reason
      });

      const err = new Error(`ACCESS_CONFIGURATION_FAILURE: Access to ${credentialRef} for purpose ${purpose} is DENIED (${access.reason})`);
      err.statusCode = 403;
      err.classification = "ACCESS_CONFIGURATION_FAILURE";
      throw err;
    }

    let secretValue = null;
    try {
      secretValue = await this.provider.getSecret(credentialRef);
    } catch (providerError) {
      span.recordException(providerError);
      span.setStatus("ERROR", "Secret provider failure");
      span.end();

      telemetry.recordCounter("secret_provider_failure", 1, {
        purpose: String(purpose)
      });

      const err = new Error(`ACCESS_CONFIGURATION_FAILURE: Secret provider error resolving ${credentialRef}`);
      err.statusCode = 500;
      err.classification = "ACCESS_CONFIGURATION_FAILURE";
      throw err;
    }

    if (!secretValue) {
      span.setStatus("ERROR", "Secret is missing from provider");
      span.end();

      telemetry.recordCounter("secret_resolution_missing", 1, {
        purpose: String(purpose)
      });

      const err = new Error(`ACCESS_CONFIGURATION_FAILURE: Required credential ${credentialRef} is MISSING from provider`);
      err.statusCode = 401;
      err.classification = "ACCESS_CONFIGURATION_FAILURE";
      throw err;
    }

    // Dynamic value-aware redaction registration
    registerSecretForRedaction(secretValue);

    span.setStatus("OK", "Secret resolved successfully");
    span.end();

    telemetry.recordCounter("secret_resolution_succeeded", 1, {
      purpose: String(purpose)
    });

    return secretValue;
  }
}
