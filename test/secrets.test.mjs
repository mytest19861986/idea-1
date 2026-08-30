import { test } from "node:test";
import assert from "node:assert/strict";
import { SecretResolver, SecretPurpose, SecretPresence } from "../src/secrets/secret-resolver.mjs";
import { InMemorySecretProvider } from "../src/secrets/in-memory-secret-provider.mjs";
import { EnvironmentSecretProvider } from "../src/secrets/environment-secret-provider.mjs";
import {
  redactSecretText,
  redactSecretPayload,
  createSecretRedactionScope
} from "../src/secrets/secret-redaction.mjs";
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

test("SECRETS: resolveSecret with scope auto-registers secret into the scope atomically", async () => {
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:api_key": "synth-auto-scope-key"
  });
  const resolver = new SecretResolver(provider);
  const scope = createSecretRedactionScope();

  assert.strictEqual(scope.getRegisteredCount(), 0);
  const secret = await resolver.resolveSecret("cred:source:trustmrr:api_key", SecretPurpose.COLLECTOR_EXECUTION, "test", scope);
  assert.strictEqual(secret, "synth-auto-scope-key");
  assert.strictEqual(scope.getRegisteredCount(), 1);

  // Redaction through scope automatically masks the resolved secret
  const text = "Error with key synth-auto-scope-key in request";
  assert.strictEqual(scope.redactText(text), "Error with key [REDACTED_SECRET] in request");
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

test("SECRETS: createSecretRedactionScope provides ephemeral scoped redaction and zero global retention", () => {
  const scope = createSecretRedactionScope();
  scope.register("ephemeral-secret-12345");

  assert.strictEqual(scope.getRegisteredCount(), 1);
  const text = "Error with token ephemeral-secret-12345 at endpoint";
  const redacted = scope.redactText(text);

  assert.ok(!redacted.includes("ephemeral-secret-12345"));
  assert.ok(redacted.includes("[REDACTED_SECRET]"));

  // Disposing / clearing the scope immediately removes the secret from the scope
  scope.dispose();
  assert.strictEqual(scope.getRegisteredCount(), 0);

  // After dispose, new redaction through this scope does not retain the previous secret
  const textAfter = "Another error with token ephemeral-secret-12345";
  const unredactedAfter = scope.redactText(textAfter);
  assert.strictEqual(unredactedAfter, textAfter);
});

test("SECRETS: Concurrent task secret isolation (Finding 2 fix - SEC-I018)", async () => {
  const registry = new HandlerRegistry();

  registry.register(TaskType.DISCOVERY_EXECUTION, async (task, context) => {
    // Each task registers its own secret in its isolated execution context
    const taskSecret = task.metadata.secret;
    context.registerSecretForRedaction(taskSecret);

    if (task.sourceId === "src-task-a") {
      throw new Error(`Task A failed with ${taskSecret}`);
    } else {
      return { msg: `Task B succeeded with ${taskSecret}` };
    }
  });

  const runtime = new WorkerRuntime(registry);

  const taskA = createWorkerTask({
    taskId: "task-concurrent-a",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-task-a",
    metadata: { secret: "distinct-secret-AAAAA" }
  });

  const taskB = createWorkerTask({
    taskId: "task-concurrent-b",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-task-b",
    metadata: { secret: "distinct-secret-BBBBB" }
  });

  // Execute concurrently
  const [resA, resB] = await Promise.all([
    runtime.executeTask(taskA),
    runtime.executeTask(taskB)
  ]);

  // Assert Task A error sanitized secret A
  assert.ok(!resA.error.message.includes("distinct-secret-AAAAA"));
  assert.ok(resA.error.message.includes("[REDACTED_SECRET]"));

  // Assert Task B result sanitized secret B
  assert.ok(!resB.result.msg.includes("distinct-secret-BBBBB"));
  assert.ok(resB.result.msg.includes("[REDACTED_SECRET]"));

  // Assert no cross-contamination: serialized result A doesn't know about secret B
  assert.ok(!JSON.stringify(resA).includes("distinct-secret-BBBBB"));
  assert.ok(!JSON.stringify(resB).includes("distinct-secret-AAAAA"));
});

test("SECRETS: Automatic fail-safe secret resolution and redaction in WorkerRuntime (No manual registration needed)", async () => {
  const syntheticSecret = "synth-atomic-token-999";
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:bearer": syntheticSecret
  });
  const resolver = new SecretResolver(provider);

  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task, context) => {
    // Handler simply resolves the secret via context.resolveSecret without manual register call!
    const token = await context.resolveSecret("cred:source:trustmrr:bearer", SecretPurpose.COLLECTOR_EXECUTION);
    assert.strictEqual(token, syntheticSecret);

    // Simulate error leaking the token
    throw new Error(`Upstream rejection: token ${token} invalid`);
  });

  const runtime = new WorkerRuntime(registry, resolver);
  const task = createWorkerTask({
    taskId: "task-atomic-secret-test",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1"
  });

  const execResult = await runtime.executeTask(task);

  // Assert error message automatically has value-aware redaction without manual registration
  assert.ok(!execResult.error.message.includes(syntheticSecret));
  assert.ok(execResult.error.message.includes("[REDACTED_SECRET]"));
});

test("SECRETS: End-to-end secret resolution and collector injection failure boundary test (SEC-I008 to SEC-I016)", async () => {
  const syntheticSecret = "synth-distinct-secret-999888";
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:bearer": syntheticSecret
  });
  const resolver = new SecretResolver(provider);

  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task, context) => {
    const resolvedToken = await context.resolveSecret("cred:source:trustmrr:bearer", SecretPurpose.COLLECTOR_EXECUTION);
    const headers = { Authorization: `Bearer ${resolvedToken}` };
    assert.strictEqual(headers.Authorization, `Bearer ${syntheticSecret}`);

    // Simulate error during transport containing the raw token
    throw new Error(`401 Unauthorized from upstream: token ${syntheticSecret} expired`);
  });

  const runtime = new WorkerRuntime(registry, resolver);
  const task = createWorkerTask({
    taskId: "task-secret-boundary-test-failure",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1",
    metadata: {
      credentialRef: "cred:source:trustmrr:bearer" // Only logical ref
    }
  });

  // Execute task and assert failure containment + value-aware redaction
  const execResult = await runtime.executeTask(task);

  const serializedTask = JSON.stringify(task);
  const serializedAttempts = JSON.stringify(execResult.attempts);
  const serializedResult = JSON.stringify(execResult);

  assert.ok(!serializedTask.includes(syntheticSecret), "WorkerTask must not contain raw secret");
  assert.ok(!serializedAttempts.includes(syntheticSecret), "AttemptHistory must not contain raw secret");
  assert.ok(!serializedResult.includes(syntheticSecret), "ExecResult must not contain raw secret");

  assert.ok(execResult.error.message.includes("[REDACTED_SECRET]"), "Error message must have value-aware redaction");
});

test("SECRETS: End-to-end secret resolution and collector injection SUCCESS boundary test (SEC-I008 to SEC-I016)", async () => {
  const successSecret = "synth-success-secret-777666";
  const provider = new InMemorySecretProvider({
    "cred:source:trustmrr:bearer": successSecret
  });
  const resolver = new SecretResolver(provider);

  const registry = new HandlerRegistry();
  registry.register(TaskType.DISCOVERY_EXECUTION, async (task, context) => {
    const resolvedToken = await context.resolveSecret("cred:source:trustmrr:bearer", SecretPurpose.COLLECTOR_EXECUTION);
    return {
      fetchedCount: 10,
      debugContext: `Fetched using token ${resolvedToken} successfully`
    };
  });

  const runtime = new WorkerRuntime(registry, resolver);
  const task = createWorkerTask({
    taskId: "task-secret-boundary-test-success",
    taskType: TaskType.DISCOVERY_EXECUTION,
    sourceId: "src-1",
    metadata: {
      credentialRef: "cred:source:trustmrr:bearer"
    }
  });

  const execResult = await runtime.executeTask(task);
  assert.strictEqual(execResult.state, "SUCCEEDED");

  const serializedTask = JSON.stringify(task);
  const serializedAttempts = JSON.stringify(execResult.attempts);
  const serializedResult = JSON.stringify(execResult);

  assert.ok(!serializedTask.includes(successSecret), "WorkerTask must not contain raw secret");
  assert.ok(!serializedAttempts.includes(successSecret), "AttemptHistory must not contain raw secret");
  assert.ok(!serializedResult.includes(successSecret), "Top-level ExecResult must not contain raw secret");

  assert.ok(execResult.result.debugContext.includes("[REDACTED_SECRET]"), "Top-level result must have value-aware redaction");
});
