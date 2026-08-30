import { test } from "node:test";
import assert from "node:assert/strict";
import { SecretResolver, SecretPurpose, SecretPresence } from "../src/secrets/secret-resolver.mjs";
import { InMemorySecretProvider } from "../src/secrets/in-memory-secret-provider.mjs";
import { EnvironmentSecretProvider } from "../src/secrets/environment-secret-provider.mjs";
import { redactSecretText, redactSecretPayload } from "../src/secrets/secret-redaction.mjs";
import { createWorkerTask, TaskType } from "../src/worker/worker-task.mjs";
import { evaluateSchedule, DEFAULT_SCHEDULING_POLICY } from "../src/scheduler/scheduling-engine.mjs";

test("SECRETS: known credentialRef + allowed purpose resolves successfully", async () => {
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:api_key": "synth-key-12345"
  });
  const resolver = new SecretResolver(provider);

  const secret = await resolver.resolveSecret("cred:source:trustmrr:api_key", SecretPurpose.COLLECTOR_EXECUTION);
  assert.strictEqual(secret, "synth-key-12345");
});

test("SECRETS: prototype-key inputs (__proto__, constructor, toString) fail closed safely without unhandled errors", async () => {
  const envProvider = new EnvironmentSecretProvider({});
  const pProto = await envProvider.getSecret("__proto__");
  const pConst = await envProvider.getSecret("constructor");
  const pToString = await envProvider.getSecret("toString");

  assert.strictEqual(pProto, null);
  assert.strictEqual(pConst, null);
  assert.strictEqual(pToString, null);

  const resolver = new SecretResolver(new InMemorySecretProvider());
  await assert.rejects(
    async () => resolver.resolveSecret("__proto__", SecretPurpose.COLLECTOR_EXECUTION),
    /ACCESS_CONFIGURATION_FAILURE.*UNKNOWN_CREDENTIAL_REF/
  );
  await assert.rejects(
    async () => resolver.resolveSecret("constructor", SecretPurpose.COLLECTOR_EXECUTION),
    /ACCESS_CONFIGURATION_FAILURE.*UNKNOWN_CREDENTIAL_REF/
  );
});

test("SECRETS: unknown credentialRef fails closed with ACCESS_CONFIGURATION_FAILURE", async () => {
  const provider = new InMemorySecretProvider();
  const resolver = new SecretResolver(provider);

  await assert.rejects(
    async () => resolver.resolveSecret("cred:unknown:fake", SecretPurpose.COLLECTOR_EXECUTION),
    /ACCESS_CONFIGURATION_FAILURE.*UNKNOWN_CREDENTIAL_REF/
  );
});

test("SECRETS: known credentialRef with unauthorized purpose is strictly DENIED", async () => {
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:api_key": "synth-key-12345"
  });
  const resolver = new SecretResolver(provider);

  // Trying to resolve API key for database purpose is forbidden
  await assert.rejects(
    async () => resolver.resolveSecret("cred:source:trustmrr:api_key", SecretPurpose.DATABASE_CONNECTION),
    /ACCESS_CONFIGURATION_FAILURE.*UNAUTHORIZED_PURPOSE/
  );
});

test("SECRETS: missing secret in provider throws ACCESS_CONFIGURATION_FAILURE (no anonymous fallback)", async () => {
  const provider = new InMemorySecretProvider(); // empty
  const resolver = new SecretResolver(provider);

  await assert.rejects(
    async () => resolver.resolveSecret("cred:source:trustmrr:api_key", SecretPurpose.COLLECTOR_EXECUTION),
    /ACCESS_CONFIGURATION_FAILURE.*MISSING/
  );
});

test("SECRETS: EnvironmentSecretProvider strictly maps allowlisted refs and rejects arbitrary env vars", async () => {
  const mockEnv = {
    TRUSTMRR_API_KEY: "synth-env-key-999",
    SUPER_SECRET_ENV_VAR: "dangerous-leak"
  };
  const envProvider = new EnvironmentSecretProvider(mockEnv);

  const key = await envProvider.getSecret("cred:source:trustmrr:api_key");
  assert.strictEqual(key, "synth-env-key-999");

  // Arbitrary env var requested dynamically is rejected (returns null)
  const arbitrary = await envProvider.getSecret("SUPER_SECRET_ENV_VAR");
  assert.strictEqual(arbitrary, null);
});

test("SECRETS: checkSecretPresence accurately returns AVAILABLE, MISSING, DENIED without exposing value", async () => {
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:api_key": "synth-key-1"
  });
  const resolver = new SecretResolver(provider);

  const p1 = await resolver.checkSecretPresence("cred:source:trustmrr:api_key", SecretPurpose.COLLECTOR_EXECUTION);
  const p2 = await resolver.checkSecretPresence("cred:source:trustmrr:bearer", SecretPurpose.COLLECTOR_EXECUTION);
  const p3 = await resolver.checkSecretPresence("cred:source:trustmrr:api_key", SecretPurpose.DATABASE_CONNECTION);

  assert.strictEqual(p1, SecretPresence.AVAILABLE);
  assert.strictEqual(p2, SecretPresence.MISSING);
  assert.strictEqual(p3, SecretPresence.DENIED);
});

test("SECRETS: credential rotation immediately returns updated value (SECRET_VALUE_CACHE=NO)", async () => {
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:api_key": "v1-synth-token"
  });
  const resolver = new SecretResolver(provider);

  const s1 = await resolver.resolveSecret("cred:source:trustmrr:api_key", SecretPurpose.COLLECTOR_EXECUTION);
  assert.strictEqual(s1, "v1-synth-token");

  // Rotate secret in provider
  provider.set("cred:source:trustmrr:api_key", "v2-synth-token-rotated");

  const s2 = await resolver.resolveSecret("cred:source:trustmrr:api_key", SecretPurpose.COLLECTOR_EXECUTION);
  assert.strictEqual(s2, "v2-synth-token-rotated");
});

test("SECRETS: value-aware redaction masks resolved secret in subsequent logs and errors", async () => {
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:bearer": "super-secret-token-xyz"
  });
  const resolver = new SecretResolver(provider);

  const resolved = await resolver.resolveSecret("cred:source:trustmrr:bearer", SecretPurpose.COLLECTOR_EXECUTION);
  assert.strictEqual(resolved, "super-secret-token-xyz");

  const errorText = `Failed request with token super-secret-token-xyz at host`;
  const sanitized = redactSecretText(errorText);

  assert.ok(!sanitized.includes("super-secret-token-xyz"));
  assert.ok(sanitized.includes("[REDACTED_SECRET]"));
});

test("SECRETS: WorkerTask and SchedulerState boundaries are strictly secret-free (SEC-I008 to SEC-I016)", () => {
  const source = {
    id: "src-1",
    status: "ACTIVE",
    config: { credentialRef: "cred:source:trustmrr:api_key" } // Only logical ref allowed
  };

  const decision = evaluateSchedule(source, {}, DEFAULT_SCHEDULING_POLICY, "2026-08-30T12:00:00.000Z");
  assert.ok(decision.task);

  const serializedTask = JSON.stringify(decision.task);
  const serializedDecision = JSON.stringify(decision);

  // Assert neither task nor schedule decision contains raw secrets or authorization tokens
  assert.ok(!serializedTask.includes("Bearer"));
  assert.ok(!serializedTask.includes("synth-key"));
  assert.ok(!serializedDecision.includes("Bearer"));
  assert.ok(!serializedDecision.includes("synth-key"));
});
