Exit code: 0
Wall time: 0.3 seconds
Output:
Exit code: 0
Wall time: 0.3 seconds
Output:
## test/source-registry.test.mjs
```js
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSourceCandidate } from "../src/source-registry/evaluation.mjs";
import { SourceStatus, canTransition, transitionSource } from "../src/source-registry/lifecycle.mjs";
import { SourceRegistryStore } from "../src/source-registry/store.mjs";
import { intakeDiscoveredSource, normalizeDiscoveredSource } from "../src/source-registry/intake.mjs";
import { normalizeCollectedItem } from "../src/collection/normalize.mjs";
import { deduplicateCollectedItems } from "../src/collection/deduplicate.mjs";
import { deriveTractionSignals, normalizeEvidenceRecord } from "../src/analysis/evidence.mjs";
import { scoreOpportunity } from "../src/analysis/scoring.mjs";
import { renderLocalizedTemplate } from "../src/localization/templates.mjs";
import { createPublicationRecord } from "../src/publishing/record.mjs";
import { approvePublication } from "../src/publishing/authorization.mjs";
import { createDeliveryRequest } from "../src/delivery/request.mjs";
import { createDeliveryResult } from "../src/delivery/result.mjs";
import { DeliveryLedger } from "../src/delivery/ledger.mjs";
import { assessSourceHealth } from "../src/source-registry/health.mjs";
import { rankOpportunities } from "../src/analysis/ranking.mjs";
import { normalizeClaim } from "../src/analysis/claims.mjs";
import { findCoverageGaps } from "../src/source-registry/coverage.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const viableCandidate = {
  relevance: 90,
  evidenceQuality: 85,
  reliability: 80,
  uniqueness: 75,
  freshness: 88,
  accessibility: 80,
  duplicateRisk: false,
  policyAllowed: true
};

test("evaluation is deterministic and approval never means automatic activation", () => {
  const first = evaluateSourceCandidate(viableCandidate);
  const second = evaluateSourceCandidate(viableCandidate);
  assert.deepEqual(first, second);
  assert.equal(first.eligibleForApproval, true);
  assert.equal(first.proposedStatus, "APPROVED");
  assert.equal(first.productionActivation, "REQUIRES_GOVERNANCE_APPROVAL");
});

test("candidate with policy or accessibility risk fails closed", () => {
  const result = evaluateSourceCandidate({ ...viableCandidate, accessibility: 40, policyAllowed: false });
  assert.equal(result.eligibleForApproval, false);
  assert.deepEqual(result.reasons, ["ACCESSIBILITY_BELOW_MINIMUM", "POLICY_OR_ACCESS_REVIEW_REQUIRED"]);
});

test("lifecycle does not allow an unknown source to become active", () => {
  assert.equal(canTransition(SourceStatus.DISCOVERED, SourceStatus.ACTIVE), false);
  assert.throws(() => transitionSource({ status: SourceStatus.DISCOVERED }, SourceStatus.ACTIVE));
});

test("approved source may enter active state only through an explicit transition", () => {
  const next = transitionSource({ id: "source-1", status: SourceStatus.APPROVED }, SourceStatus.ACTIVE, { reason: "GOVERNANCE_APPROVED" });
  assert.equal(next.status, SourceStatus.ACTIVE);
  assert.equal(next.statusReason, "GOVERNANCE_APPROVED");
});

test("store persists records and produces an audit trail for each mutation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "source-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SourceRegistryStore({ directory, now: () => "2026-08-28T00:00:00.000Z" });
  await store.create({ id: "product-hunt", name: "Product Hunt", baseUrl: "https://www.producthunt.com", status: SourceStatus.DISCOVERED });
  const candidate = await store.transition("product-hunt", SourceStatus.CANDIDATE, { actor: "reviewer", reason: "INITIAL_SCREENING" });
  assert.equal(candidate.status, SourceStatus.CANDIDATE);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual((await store.auditEvents()).map((event) => event.type), ["SOURCE_CREATED", "SOURCE_STATUS_CHANGED"]);
});

test("store rejects duplicate source identifiers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "source-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SourceRegistryStore({ directory });
  const source = { id: "indie-hackers", name: "Indie Hackers", baseUrl: "https://www.indiehackers.com", status: SourceStatus.DISCOVERED };
  await store.create(source);
  await assert.rejects(store.create(source), /already exists/);
});

test("discovery intake normalizes a safe candidate without activating it", () => {
  const source = normalizeDiscoveredSource({ url: "https://www.example.com/path?campaign=x#top" });
  assert.deepEqual(source, { id: "example-com", name: "example.com", baseUrl: "https://www.example.com/", status: SourceStatus.CANDIDATE, discoveryMethod: "MANUAL_HINT" });
});

test("discovery intake rejects HTTP and duplicate source URLs", async (t) => {
  assert.throws(() => normalizeDiscoveredSource({ url: "http://example.com" }), /HTTPS/);
  const directory = await mkdtemp(join(tmpdir(), "source-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SourceRegistryStore({ directory });
  await intakeDiscoveredSource(store, { url: "https://example.com/path" });
  await assert.rejects(intakeDiscoveredSource(store, { url: "https://example.com/other" }), /already registered/);
});

test("collector normalization creates versioned records and rejects unsafe URLs", () => {
  const item = normalizeCollectedItem({ title: "  A useful launch  ", url: "https://example.com/product", summary: " Signal " }, { sourceId: "example-com", collectedAt: "2026-08-28T00:00:00.000Z" });
  assert.deepEqual(item, { sourceId: "example-com", externalId: "https://example.com/product", url: "https://example.com/product", title: "A useful launch", summary: "Signal", collectedAt: "2026-08-28T00:00:00.000Z", schemaVersion: 1 });
  assert.throws(() => normalizeCollectedItem({ title: "Unsafe", url: "http://example.com" }, { sourceId: "example-com" }), /HTTPS/);
});

test("deduplication is deterministic by source and external identity", () => {
  const a = { sourceId: "x", externalId: "1", url: "https://x.test/1" };
  const result = deduplicateCollectedItems([a, a, { ...a, sourceId: "y" }]);
  assert.equal(result.unique.length, 2);
  assert.equal(result.duplicates.length, 1);
});

test("evidence records are attributable and reject unsafe or unsupported inputs", () => {
  const record = normalizeEvidenceRecord({ opportunityId: "o-1", sourceId: "source-a", collectedItemId: "item-1", url: "https://example.com/evidence", observedAt: "2026-08-28T00:00:00Z", evidenceType: "demand", strength: 85, confidence: 80, note: " Mentioned need " });
  assert.deepEqual(record, { opportunityId: "o-1", sourceId: "source-a", collectedItemId: "item-1", url: "https://example.com/evidence", observedAt: "2026-08-28T00:00:00.000Z", evidenceType: "DEMAND", strength: 85, confidence: 80, note: "Mentioned need" });
  assert.throws(() => normalizeEvidenceRecord({ ...record, url: "http://example.com" }), /HTTPS/);
  assert.throws(() => normalizeEvidenceRecord({ ...record, evidenceType: "RUMOR" }), /not supported/);
});

test("traction signals are deterministic, source-aware weighted descriptions", () => {
  const records = [
    { opportunityId: "o-2", sourceId: "b", collectedItemId: "2", url: "https://b.test/2", observedAt: "2026-08-27T00:00:00Z", evidenceType: "GROWTH", strength: 40, confidence: 50 },
    { opportunityId: "o-1", sourceId: "a", collectedItemId: "1", url: "https://a.test/1", observedAt: "2026-08-28T00:00:00Z", evidenceType: "DEMAND", strength: 80, confidence: 100 },
    { opportunityId: "o-1", sourceId: "b", collectedItemId: "3", url: "https://b.test/3", observedAt: "2026-08-29T00:00:00Z", evidenceType: "ENGAGEMENT", strength: 20, confidence: 50 }
  ];
  assert.deepEqual(deriveTractionSignals(records), [
    { opportunityId: "o-1", tractionScore: 60, evidenceCount: 2, sourceCount: 2, latestObservedAt: "2026-08-29T00:00:00.000Z" },
    { opportunityId: "o-2", tractionScore: 40, evidenceCount: 1, sourceCount: 1, latestObservedAt: "2026-08-27T00:00:00.000Z" }
  ]);
});

test("scoring is deterministic and exposes the caller-owned weighted contributions", () => {
  const result = scoreOpportunity({ demand: 80, traction: 60, feasibility: 20 }, { demand: 50, traction: 30, feasibility: 20 });
  assert.deepEqual(result, {
    score: 62,
    factors: { demand: 80, traction: 60, feasibility: 20 },
    weights: { demand: 50, traction: 30, feasibility: 20 },
    contributions: [
      { factor: "demand", value: 80, weight: 50, contribution: 40 },
      { factor: "feasibility", value: 20, weight: 20, contribution: 4 },
      { factor: "traction", value: 60, weight: 30, contribution: 18 }
    ]
  });
});

test("scoring fails closed when factor keys or weight totals are invalid", () => {
  assert.throws(() => scoreOpportunity({ demand: 80 }, { demand: 80 }), /total exactly 100/);
  assert.throws(() => scoreOpportunity({ demand: 80 }, { traction: 100 }), /identical keys/);
});

test("localized templates render only explicit locales and complete scalar values", () => {
  const catalog = { en: { summary: "{count} opportunities for {market}" }, fa: { summary: "{count} Ã™ÂÃ˜Â±Ã˜ÂµÃ˜Âª Ã˜Â¨Ã˜Â±Ã˜Â§Ã›Å’ {market}" } };
  assert.equal(renderLocalizedTemplate(catalog, { locale: "fa", key: "summary", values: { count: 2, market: "SaaS" } }), "2 Ã™ÂÃ˜Â±Ã˜ÂµÃ˜Âª Ã˜Â¨Ã˜Â±Ã˜Â§Ã›Å’ SaaS");
  assert.throws(() => renderLocalizedTemplate(catalog, { locale: "de", key: "summary", values: {} }), /locale is not available/);
  assert.throws(() => renderLocalizedTemplate(catalog, { locale: "en", key: "summary", values: { count: 2 } }), /placeholder/);
  assert.throws(() => renderLocalizedTemplate(catalog, { locale: "en", key: "summary", values: { count: 2, market: "SaaS", unused: true } }), /unexpected/);
});

test("publication record is a deterministic draft with attributable sorted citations", () => {
  const record = createPublicationRecord({
    opportunityId: "o-1", publicationRevision: 1, locale: "en", title: "Useful opportunity", summary: "Evidence-backed summary", score: 72.5,
    generatedAt: "2026-08-28T00:00:00Z",
    citations: [
      { sourceId: "b", collectedItemId: "2", url: "https://b.test/2" },
      { sourceId: "a", collectedItemId: "1", url: "https://a.test/1" }
    ]
  });
  assert.deepEqual(record, {
    schemaVersion: 1, publicationState: "DRAFT", opportunityId: "o-1", publicationRevision: 1, locale: "en", title: "Useful opportunity", summary: "Evidence-backed summary", score: 72.5,
    generatedAt: "2026-08-28T00:00:00.000Z",
    citations: [
      { sourceId: "a", collectedItemId: "1", url: "https://a.test/1" },
      { sourceId: "b", collectedItemId: "2", url: "https://b.test/2" }
    ]
  });
});

test("publication records fail closed without trustworthy citations", () => {
  const input = { opportunityId: "o-1", publicationRevision: 1, locale: "en", title: "T", summary: "S", score: 1, generatedAt: "2026-08-28T00:00:00Z", citations: [] };
  assert.throws(() => createPublicationRecord(input), /citation/);
  assert.throws(() => createPublicationRecord({ ...input, citations: [{ sourceId: "a", collectedItemId: "1", url: "http://a.test" }] }), /HTTPS/);
});

test("publication approval is explicit, attributable, and does not dispatch", () => {
  const draft = createPublicationRecord({ opportunityId: "o-1", publicationRevision: 1, locale: "en", title: "T", summary: "S", score: 50, generatedAt: "2026-08-28T00:00:00Z", citations: [{ sourceId: "a", collectedItemId: "1", url: "https://a.test/1" }] });
  const result = approvePublication(draft, { actor: "editor-1", reason: "EDITORIAL_REVIEW", approvedAt: "2026-08-28T01:00:00Z" });
  assert.equal(result.record.publicationState, "APPROVED");
  assert.deepEqual(result.record.publicationApproval, { actor: "editor-1", reason: "EDITORIAL_REVIEW", approvedAt: "2026-08-28T01:00:00.000Z", publicationRevision: 1 });
  assert.deepEqual(result.event, { type: "PUBLICATION_APPROVED", opportunityId: "o-1", publicationRevision: 1, actor: "editor-1", reason: "EDITORIAL_REVIEW", occurredAt: "2026-08-28T01:00:00.000Z" });
  assert.throws(() => approvePublication(result.record, { actor: "editor-1", reason: "SECOND", approvedAt: "2026-08-28T02:00:00Z" }), /only DRAFT/);
  assert.throws(() => createDeliveryRequest({ ...result.record, publicationRevision: 2 }, { channel: "WEB", idempotencyKey: "revision-2", requestedAt: "2026-08-28T02:00:00Z" }), /approval must match/);
});

test("delivery requests require approval and are explicit about the target channel", () => {
  const draft = createPublicationRecord({ opportunityId: "o-1", publicationRevision: 1, locale: "en", title: "T", summary: "S", score: 50, generatedAt: "2026-08-28T00:00:00Z", citations: [{ sourceId: "a", collectedItemId: "1", url: "https://a.test/1" }] });
  assert.throws(() => createDeliveryRequest(draft, { channel: "WEB", idempotencyKey: "web-o-1", requestedAt: "2026-08-28T01:00:00Z" }), /only APPROVED/);
  const approved = approvePublication(draft, { actor: "editor", reason: "REVIEW", approvedAt: "2026-08-28T01:00:00Z" }).record;
  const request = createDeliveryRequest(approved, { channel: "telegram", idempotencyKey: "telegram-o-1", requestedAt: "2026-08-28T02:00:00Z" });
  assert.equal(request.channel, "TELEGRAM");
  assert.equal(request.idempotencyKey, "telegram-o-1");
  assert.equal(request.record, approved);
  assert.throws(() => createDeliveryRequest(approved, { channel: "EMAIL", idempotencyKey: "x", requestedAt: "2026-08-28T02:00:00Z" }), /not supported/);
});

test("delivery results distinguish delivered references from retryable failures", () => {
  const approved = approvePublication(createPublicationRecord({ opportunityId: "o-1", publicationRevision: 1, locale: "en", title: "T", summary: "S", score: 50, generatedAt: "2026-08-28T00:00:00Z", citations: [{ sourceId: "a", collectedItemId: "1", url: "https://a.test/1" }] }), { actor: "editor", reason: "REVIEW", approvedAt: "2026-08-28T01:00:00Z" }).record;
  const request = createDeliveryRequest(approved, { channel: "WEB", idempotencyKey: "web-o-1", requestedAt: "2026-08-28T02:00:00Z" });
  assert.deepEqual(createDeliveryResult(request, { status: "delivered", occurredAt: "2026-08-28T02:01:00Z", channelReference: "page-o-1" }), { schemaVersion: 1, opportunityId: "o-1", publicationRevision: 1, channel: "WEB", idempotencyKey: "web-o-1", status: "DELIVERED", occurredAt: "2026-08-28T02:01:00.000Z", channelReference: "page-o-1" });
  assert.deepEqual(createDeliveryResult(request, { status: "FAILED", occurredAt: "2026-08-28T02:01:00Z", failureCode: "NETWORK_TIMEOUT" }).failureCode, "NETWORK_TIMEOUT");
  assert.throws(() => createDeliveryResult(request, { status: "DELIVERED", occurredAt: "2026-08-28T02:01:00Z" }), /channelReference/);
});

test("delivery ledger accepts a channel key only once and persists its claim", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "delivery-ledger-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ledger = new DeliveryLedger({ directory, now: () => "2026-08-28T03:00:00.000Z" });
  const request = { opportunityId: "o-1", publicationRevision: 1, channel: "WEB", idempotencyKey: "web-o-1", requestedAt: "2026-08-28T02:00:00.000Z" };
  const first = await ledger.claim(request);
  const second = await ledger.claim(request);
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.deepEqual(second.claim, first.claim);
});

test("source health is a deterministic assessment without lifecycle mutation", () => {
  const result = assessSourceHealth([{ sourceId: "source-a", success: true, occurredAt: "2026-08-28T00:00:00Z" }, { sourceId: "source-a", success: false, occurredAt: "2026-08-29T00:00:00Z" }], { failureRateThreshold: 40 });
  assert.deepEqual(result, { sourceId: "source-a", eventCount: 2, successCount: 1, failureCount: 1, failureRate: 50, latestOccurredAt: "2026-08-29T00:00:00.000Z", assessment: "DEGRADED" });
  assert.throws(() => assessSourceHealth([{ sourceId: "a", success: true, occurredAt: "2026-08-28T00:00:00Z" }, { sourceId: "b", success: true, occurredAt: "2026-08-28T00:00:00Z" }], { failureRateThreshold: 50 }), /one source/);
});

test("opportunity ranking is score-first with a stable deterministic tie-break", () => {
  assert.deepEqual(rankOpportunities([{ opportunityId: "b", score: 80 }, { opportunityId: "a", score: 80 }, { opportunityId: "c", score: 90 }]), [{ opportunityId: "c", score: 90, rank: 1 }, { opportunityId: "a", score: 80, rank: 2 }, { opportunityId: "b", score: 80, rank: 3 }]);
  assert.throws(() => rankOpportunities([{ opportunityId: "a", score: 1 }, { opportunityId: "a", score: 2 }]), /unique/);
});

test("claim classification keeps evidence-backed facts separate from AI hypotheses", () => {
  assert.deepEqual(normalizeClaim({ text: "Revenue reported", type: "fact", evidenceIds: ["ev-1"] }), { text: "Revenue reported", type: "FACT", evidenceIds: ["ev-1"], verified: true });
  assert.deepEqual(normalizeClaim({ text: "May fit the market", type: "AI_HYPOTHESIS" }), { text: "May fit the market", type: "AI_HYPOTHESIS", evidenceIds: [], verified: false });
  assert.throws(() => normalizeClaim({ text: "Unproven", type: "FACT" }), /require evidence/);
  assert.throws(() => normalizeClaim({ text: "Model says yes", type: "AI_ANALYSIS", verified: true }), /cannot self-declare/);
});

test("coverage gaps report missing active-source segments without changing sources", () => {
  const sources = [{ status: "ACTIVE", segments: ["saudi-b2b"] }, { status: "CANDIDATE", segments: ["sea-consumer"] }];
  const gaps = findCoverageGaps(sources, ["saudi-b2b", "sea-consumer", " eu-saas ", "", "eu-saas"]);
  assert.deepEqual(gaps, ["eu-saas", "sea-consumer"]);
  assert.equal(Object.isFrozen(gaps), true);
  assert.throws(() => findCoverageGaps({}, []), /arrays/);
});

```



