/**
 * ============================================================================
 * EPHEMERAL SECRET REDACTION SCOPE & UTILITIES (PKG-SECRETS-016R)
 * Invariants: SEC-I017 through SEC-I020
 * Strict ephemeral execution scope; zero global raw secret retention.
 * ============================================================================
 */

/**
 * Pure function: Redact sensitive patterns and optional execution-scoped known secrets.
 */
export function redactSecretText(text, knownSecrets = []) {
  if (typeof text !== "string") return text;

  let redacted = text;

  // Mask database passwords in URLs (generic pattern)
  redacted = redacted.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, "$1***$3");

  // Mask Authorization Bearer tokens (generic pattern)
  redacted = redacted.replace(/(Bearer\s+)[A-Za-z0-9_\-\.+=]+/gi, "$1***");

  // Scoped value-aware redaction (only from the explicitly provided knownSecrets collection)
  if (Array.isArray(knownSecrets) || knownSecrets instanceof Set) {
    for (const secret of knownSecrets) {
      if (typeof secret === "string" && secret.trim().length >= 4) {
        const trimmed = secret.trim();
        if (redacted.includes(trimmed)) {
          redacted = redacted.replaceAll(trimmed, "[REDACTED_SECRET]");
        }
      }
    }
  }

  return redacted;
}

/**
 * Pure function: Deeply redact sensitive keys and values in payloads.
 */
export function redactSecretPayload(val, knownSecrets = []) {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    return redactSecretText(val, knownSecrets);
  }
  if (Array.isArray(val)) {
    return val.map((item) => redactSecretPayload(item, knownSecrets));
  }
  if (typeof val === "object") {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      if (/^(authorization|bearer|password|secret|token|apikey|api_key|cookie|credentials)$/i.test(k)) {
        res[k] = "[REDACTED]";
      } else {
        res[k] = redactSecretPayload(v, knownSecrets);
      }
    }
    return res;
  }
  return val;
}

/**
 * Factory for an isolated, ephemeral execution redaction scope.
 * Call scope.clear() or scope.dispose() in a finally block to immediately clear secrets from the scope.
 */
export function createSecretRedactionScope() {
  const secrets = new Set();

  return {
    register(secretValue) {
      if (typeof secretValue === "string" && secretValue.trim().length >= 4) {
        secrets.add(secretValue.trim());
      }
    },
    redactText(text) {
      return redactSecretText(text, secrets);
    },
    redactPayload(payload) {
      return redactSecretPayload(payload, secrets);
    },
    getRegisteredCount() {
      return secrets.size;
    },
    clear() {
      secrets.clear();
    },
    dispose() {
      secrets.clear();
    }
  };
}
