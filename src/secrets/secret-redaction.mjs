/**
 * ============================================================================
 * SECRET REDACTION UTILITIES (PKG-SECRETS-016)
 * Invariants: SEC-I017 through SEC-I020
 * ============================================================================
 */

const KNOWN_SECRET_VALUES = new Set();

/**
 * Register a known secret value dynamically for value-aware redaction.
 */
export function registerSecretForRedaction(secretValue) {
  if (typeof secretValue === "string" && secretValue.trim().length >= 4) {
    KNOWN_SECRET_VALUES.add(secretValue.trim());
  }
}

/**
 * Redact sensitive patterns and known secret values from any text or object.
 */
export function redactSecretText(text) {
  if (typeof text !== "string") return text;

  let redacted = text;

  // Mask database passwords in URLs
  redacted = redacted.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, "$1***$3");

  // Mask Authorization Bearer tokens
  redacted = redacted.replace(/(Bearer\s+)[A-Za-z0-9_\-\.+=]+/gi, "$1***");

  // Value-aware dynamic redaction
  for (const secret of KNOWN_SECRET_VALUES) {
    if (secret && redacted.includes(secret)) {
      redacted = redacted.replaceAll(secret, "[REDACTED_SECRET]");
    }
  }

  return redacted;
}

export function redactSecretPayload(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    return redactSecretText(val);
  }
  if (Array.isArray(val)) {
    return val.map((item) => redactSecretPayload(item));
  }
  if (typeof val === "object") {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      if (/^(authorization|bearer|password|secret|token|apikey|api_key|cookie|credentials)$/i.test(k)) {
        res[k] = "[REDACTED]";
      } else {
        res[k] = redactSecretPayload(v);
      }
    }
    return res;
  }
  return val;
}
