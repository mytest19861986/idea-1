/**
 * ============================================================================
 * ENVIRONMENT SECRET PROVIDER (PKG-SECRETS-016)
 * Invariants: SEC-I004, SEC-I005, SEC-I007
 * Strict allowlist mapping of logical credentialRef to env variables.
 * ============================================================================
 */

export const ALLOWED_ENV_CREDENTIAL_MAPPINGS = Object.freeze({
  "cred:source:trustmrr:api_key": "TRUSTMRR_API_KEY",
  "cred:source:trustmrr:bearer": "TRUSTMRR_BEARER_TOKEN",
  "cred:system:database:rw": "DATABASE_URL_RW",
  "cred:system:database:ro": "DATABASE_URL_RO"
});

export class EnvironmentSecretProvider {
  constructor(envSource = process.env, customMappings = ALLOWED_ENV_CREDENTIAL_MAPPINGS) {
    this.env = envSource;
    this.mappings = customMappings;
  }

  async getSecret(credentialRef) {
    if (!credentialRef || typeof credentialRef !== "string") {
      throw new TypeError("credentialRef must be a valid string");
    }

    // Prototype pollution & allowlist validation (Finding 1 fix)
    if (!Object.hasOwn(this.mappings, credentialRef)) {
      return null;
    }

    const mappedEnvVarName = this.mappings[credentialRef];
    if (!mappedEnvVarName || typeof mappedEnvVarName !== "string") {
      return null;
    }

    const value = this.env[mappedEnvVarName];
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    return value.trim();
  }
}
