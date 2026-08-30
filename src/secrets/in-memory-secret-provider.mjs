import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * IN-MEMORY SECRET PROVIDER (PKG-SECRETS-016)
 * Invariants: SEC-I001, SEC-I032
 * For synthetic credentials, test fixtures, and testing rotation.
 * ============================================================================
 */

export class InMemorySecretProvider {
  constructor(initialStore = {}) {
    this.store = new Map(Object.entries(initialStore));
  }

  set(credentialRef, secretValue) {
    if (!credentialRef || typeof credentialRef !== "string") {
      throw new TypeError("credentialRef must be a valid string");
    }
    this.store.set(credentialRef, secretValue);
  }

  delete(credentialRef) {
    this.store.delete(credentialRef);
  }

  async getSecret(credentialRef) {
    if (!this.store.has(credentialRef)) {
      return null;
    }
    return this.store.get(credentialRef);
  }
}
