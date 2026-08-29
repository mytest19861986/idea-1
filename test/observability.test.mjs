import { test } from "node:test";
import assert from "node:assert/strict";
import { TelemetryFacade, redactSensitiveData, sanitizeMetricLabels, OBSERVABILITY_VERSION } from "../src/observability/telemetry.mjs";
import { NoopTelemetryAdapter } from "../src/observability/noop-telemetry.mjs";
import { InMemoryTelemetryAdapter } from "../src/observability/otel-adapter.mjs";

test("OBSERVABILITY: Noop telemetry executes safely without errors or emissions", () => {
  const facade = new TelemetryFacade(new NoopTelemetryAdapter());
  const span = facade.startSpan("test.span", { key: "val" });
  span.setStatus("OK");
  span.end();

  facade.recordCounter("test.counter", 1, { sourceId: "src-1" });
  facade.recordHistogram("test.latency", 45, { sourceId: "src-1" });
  facade.log("INFO", "test.event", { message: "all good" });

  assert.strictEqual(facade.adapter.getSpans().length, 0);
});

test("OBSERVABILITY: Telemetry failure isolation prevents domain crashes on adapter errors (OBS-I017)", () => {
  const brokenAdapter = {
    startSpan: () => { throw new Error("Exporter network dead"); },
    incrementCounter: () => { throw new Error("Counter lock error"); },
    recordHistogram: () => { throw new Error("Histogram allocation failed"); },
    log: () => { throw new Error("Disk full on log sink"); }
  };

  const facade = new TelemetryFacade(brokenAdapter);
  assert.doesNotThrow(() => {
    const span = facade.startSpan("broken.span");
    span.end();
    facade.recordCounter("broken.counter", 1);
    facade.recordHistogram("broken.duration", 100);
    facade.log("ERROR", "broken.log", { foo: "bar" });
  });
});

test("OBSERVABILITY: In-memory adapter captures spans, latency, and status codes correctly", () => {
  const adapter = new InMemoryTelemetryAdapter();
  const facade = new TelemetryFacade(adapter);

  const span = facade.startSpan("discovery.pipeline.run", { sourceId: "src-1" });
  span.setStatus("OK", "completed successfully");
  span.end();

  const spans = adapter.getSpans();
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].name, "discovery.pipeline.run");
  assert.strictEqual(spans[0].status.code, "OK");
  assert.strictEqual(typeof spans[0].durationMs, "number");
});

test("OBSERVABILITY: Secret redaction strips Authorization headers and Database URL credentials (OBS-I009)", () => {
  const input = {
    authorization: "Bearer secret-token-12345",
    databaseUrl: "postgresql://postgres:mySecretPass123@localhost:5432/discovery_prod",
    headers: {
      Authorization: "Bearer token-abc"
    },
    safeKey: "public-value"
  };

  const redacted = redactSensitiveData(input);
  assert.strictEqual(redacted.authorization, "[REDACTED]");
  assert.strictEqual(redacted.databaseUrl, "postgresql://postgres:***@localhost:5432/discovery_prod");
  assert.strictEqual(redacted.headers.Authorization, "[REDACTED]");
  assert.strictEqual(redacted.safeKey, "public-value");
});

test("OBSERVABILITY: Metric cardinality guard strictly removes high-cardinality keys from metric labels (OBS-I011)", () => {
  const rawLabels = {
    sourceId: "src-trustmrr",
    stage: "INTAKE",
    status: "SUCCESS",
    candidateId: "cand-12345-high-cardinality",
    executionId: "exec-67890",
    canonicalUrl: "https://example.com/item/1"
  };

  const safe = sanitizeMetricLabels(rawLabels);
  assert.strictEqual(safe.sourceId, "src-trustmrr");
  assert.strictEqual(safe.stage, "INTAKE");
  assert.strictEqual(safe.status, "SUCCESS");
  assert.strictEqual(safe.candidateId, undefined);
  assert.strictEqual(safe.executionId, undefined);
  assert.strictEqual(safe.canonicalUrl, undefined);
});

test("OBSERVABILITY: Replay visibility distinguishes STORED vs REPLAYED metrics (OBS-I013)", () => {
  const adapter = new InMemoryTelemetryAdapter();
  const facade = new TelemetryFacade(adapter);

  facade.recordCounter("discovery.candidate.persisted", 1, { sourceId: "src-1", outcome: "STORED" });
  facade.recordCounter("discovery.candidate.persisted", 1, { sourceId: "src-1", outcome: "REPLAYED" });

  const metrics = adapter.getMetrics();
  assert.strictEqual(metrics.length, 2);
  assert.strictEqual(metrics[0].labels.outcome, "STORED");
  assert.strictEqual(metrics[1].labels.outcome, "REPLAYED");
});

test("OBSERVABILITY: Error taxonomy preserves RATE_LIMIT, ACCESS_CONFIG, and POLICY failure distinctions (OBS-I012)", () => {
  const adapter = new InMemoryTelemetryAdapter();
  const facade = new TelemetryFacade(adapter);

  facade.recordCounter("source.collector.failure", 1, { sourceId: "src-1", failureKind: "RATE_LIMIT_PRESSURE" });
  facade.recordCounter("source.collector.failure", 1, { sourceId: "src-1", failureKind: "ACCESS_CONFIGURATION_FAILURE" });
  facade.recordCounter("source.collector.failure", 1, { sourceId: "src-1", failureKind: "POLICY_ACCESS_FAILURE" });

  const metrics = adapter.getMetrics();
  assert.strictEqual(metrics[0].labels.failureKind, "RATE_LIMIT_PRESSURE");
  assert.strictEqual(metrics[1].labels.failureKind, "ACCESS_CONFIGURATION_FAILURE");
  assert.strictEqual(metrics[2].labels.failureKind, "POLICY_ACCESS_FAILURE");
});

test("OBSERVABILITY: Governance safety visibility distinguishes generated vs applied vs stale decisions (OBS-I014)", () => {
  const adapter = new InMemoryTelemetryAdapter();
  const facade = new TelemetryFacade(adapter);

  facade.recordCounter("governance.decision.generated", 1, { sourceId: "src-1", decision: "ALLOW_AUTOMATIC_TRANSITION" });
  facade.recordCounter("governance.transition.applied", 1, { sourceId: "src-1", toState: "DEGRADED" });
  facade.recordCounter("governance.transition.stale", 1, { sourceId: "src-1", reason: "STALE_DECISION" });

  const metrics = adapter.getMetrics();
  assert.strictEqual(metrics[0].name, "governance.decision.generated");
  assert.strictEqual(metrics[1].name, "governance.transition.applied");
  assert.strictEqual(metrics[2].name, "governance.transition.stale");
});

test("OBSERVABILITY: Version tag attached to all spans, metrics, and logs (OBS-I019)", () => {
  const adapter = new InMemoryTelemetryAdapter();
  const facade = new TelemetryFacade(adapter);

  const span = facade.startSpan("my.span");
  span.end();
  facade.recordCounter("my.counter", 1);
  facade.log("INFO", "my.log", { msg: "hi" });

  assert.strictEqual(adapter.getSpans()[0].attributes["telemetry.version"], OBSERVABILITY_VERSION);
  assert.strictEqual(adapter.getMetrics()[0].labels["telemetry.version"], OBSERVABILITY_VERSION);
  assert.strictEqual(adapter.getLogs()[0].payload["telemetry.version"], OBSERVABILITY_VERSION);
});
