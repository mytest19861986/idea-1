import { test } from "node:test";
import assert from "node:assert/strict";
import { SecretResolver, SecretPurpose, SecretPresence } from "../src/secrets/secret-resolver.mjs";
import { InMemorySecretProvider } from "../src/secrets/in-memory-secret-provider.mjs";
import { EnvironmentSecretProvider } from "../src/secrets/environment-secret-provider.mjs";
import { redactSecretText, redactSecretPayload } from "../src/secrets/secret-redaction.mjs";
import { createWorkerTask, TaskType } from "../src/worker/worker-task.mjs";
import { HandlerRegistry, WorkerRuntime } from "../src/worker/worker-runtime.mjs";
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

test("SECRETS: End-to-end secret resolution and collector injection boundary test (SEC-I008 to SEC-I016)", async () => {
  const syntheticSecret = "synth-distinct-secret-999888";
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:bearer": syntheticSecret
  });
  const resolver = new SecretResolver(provider);

  // 1. Resolve distinct secret at execution boundary
  const resolvedToken = await resolver.resolveSecret("cred:source:trustmrr:bearer", SecretPurpose.COLLECTOR_EXECUTION);
  assert.strictEqual(resolvedToken, syntheticSecret);

  // 2. Set up worker handler simulating collector execution with ephemeral secret injection
  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task) => {
    // Ephemeral header construction inside execution boundary
    const headers = { Authorization: `Bearer ${resolvedToken}` };
    assert.strictEqual(headers.Authorization, `Bearer ${syntheticSecret}`);

    // Simulate error during transport containing the raw token
    throw new Error(`401 Unauthorized from upstream: token ${syntheticSecret} expired`);
  });

  const runtime = new WorkerRuntime(registry);
  const task = createWorkerTask({
    taskId: "task-secret-boundary-test",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1",
    metadata: {
      credentialRef: "cred:source:trustmrr:bearer" // Only logical ref
    }
  });

  // 3. Execute task and assert failure containment + value-aware redaction
  const execResult = await runtime.executeTask(task);

  // 4. Assert WorkerTask, AttemptHistory, and Errors NEVER contain the raw synthetic secret
  const serializedTask = JSON.stringify(task);
  const serializedAttempts = JSON.stringify(execResult.attempts);
  const serializedResult = JSON.stringify(execResult);

  assert.ok(!serializedTask.includes(syntheticSecret), "WorkerTask must not contain raw secret");
  assert.ok(!serializedAttempts.includes(syntheticSecret), "AttemptHistory must not contain raw secret");
  assert.ok(!serializedResult.includes(syntheticSecret), "ExecResult must not contain raw secret");

  // Verify value-aware redaction replaced the secret in the error message
  assert.ok(execResult.error.message.includes("[REDACTED_SECRET]"), "Error message must have value-aware redaction");
});
