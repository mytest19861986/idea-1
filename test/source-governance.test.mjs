import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceStatus } from "../src/source-registry/lifecycle.mjs";
import {
  HealthLevel,
  ContributionLevel,
  EvaluationConfidence,
  GovernanceRecommendation
} from "../src/source-registry/source-health-evaluator.mjs";
import {
  GovernanceOutcome,
  GovernancePolicyVersion,
  classifyTransitionSafety,
  evaluateGovernance,
  SourceGovernanceApplier
} from "../src/source-registry/source-governance.mjs";

function makeSnapshot({
  sourceId = "src-1",
  operationalHealth = HealthLevel.HIGH,
  intelligenceContribution = ContributionLevel.HIGH,
  confidence = EvaluationConfidence.HIGH,
  findings = [],
  evaluatedAt = "2026-08-30T01:00:00Z"
} = {}) {
  return {
    schemaVersion: 1,
    sourceId,
    evaluationVersion: "source-health-v1",
    formulaVersion: "source-health-formula-v1",
    evaluatedAt,
    operationalHealth,
    intelligenceContribution,
    confidence,
    findings,
    governanceRecommendation: GovernanceRecommendation.MAINTAIN_ACTIVE
  };
}

test("classifyTransitionSafety strictly forbids auto-activation and auto-rejection/retirement", () => {
  // APPROVED -> ACTIVE must require manual authorization (GOV-I010)
  assert.strictEqual(
    classifyTransitionSafety(SourceStatus.APPROVED, SourceStatus.ACTIVE),
    "MANUAL_REQUIRING_AUTHORIZATION"
  );

  // * -> REJECTED or RETIRED must require manual authorization (GOV-I011)
  assert.strictEqual(
    classifyTransitionSafety(SourceStatus.ACTIVE, SourceStatus.RETIRED),
    "MANUAL_REQUIRING_AUTHORIZATION"
  );
  assert.strictEqual(
    classifyTransitionSafety(SourceStatus.APPROVED, SourceStatus.REJECTED),
    "MANUAL_REQUIRING_AUTHORIZATION"
  );

  // Reversible operational transitions
  assert.strictEqual(
    classifyTransitionSafety(SourceStatus.ACTIVE, SourceStatus.DEGRADED),
    "AUTOMATED_OPERATIONAL_REVERSIBLE"
  );
  assert.strictEqual(
    classifyTransitionSafety(SourceStatus.DEGRADED, SourceStatus.ACTIVE),
    "AUTOMATED_OPERATIONAL_REVERSIBLE"
  );
  assert.strictEqual(
    classifyTransitionSafety(SourceStatus.ACTIVE, SourceStatus.LOW_PRIORITY),
    "AUTOMATED_OPERATIONAL_REVERSIBLE"
  );
});

test("evaluateGovernance: healthy ACTIVE source produces NO_CHANGE", () => {
  const source = { id: "src-1", status: SourceStatus.ACTIVE };
  const snapshots = [makeSnapshot({ sourceId: "src-1" })];

  const dec = evaluateGovernance(source, snapshots, {
    decisionAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(dec.decision, GovernanceOutcome.NO_CHANGE);
  assert.strictEqual(dec.proposedState, SourceStatus.ACTIVE);
  assert.strictEqual(dec.governancePolicyVersion, GovernancePolicyVersion);
});

test("evaluateGovernance: ACTIVE + one LOW-confidence bad window blocks auto-transition", () => {
  const source = { id: "src-1", status: SourceStatus.ACTIVE };
  const snapshots = [
    makeSnapshot({
      sourceId: "src-1",
      operationalHealth: HealthLevel.LOW,
      confidence: EvaluationConfidence.LOW
    })
  ];

  const dec = evaluateGovernance(source, snapshots, {
    decisionAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(dec.decision, GovernanceOutcome.NO_CHANGE);
  assert.strictEqual(dec.reasonCodes.includes("CONFIDENCE_GATE_NOT_MET"), true);
});

test("evaluateGovernance: ACTIVE + sustained HIGH-confidence degradation allows auto-transition to DEGRADED", () => {
  const source = { id: "src-1", status: SourceStatus.ACTIVE };
  const snapshots = [
    makeSnapshot({ sourceId: "src-1", operationalHealth: HealthLevel.LOW, evaluatedAt: "2026-08-30T00:30:00Z" }),
    makeSnapshot({ sourceId: "src-1", operationalHealth: HealthLevel.LOW, evaluatedAt: "2026-08-30T01:00:00Z" })
  ];

  const dec = evaluateGovernance(source, snapshots, {
    decisionAt: "2026-08-30T02:00:00Z",
    lastTransitionAt: "2026-08-29T12:00:00Z", // Cooldown passed
    cooldownMinutes: 60,
    degradeHysteresisCount: 2
  });

  assert.strictEqual(dec.decision, GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION);
  assert.strictEqual(dec.proposedState, SourceStatus.DEGRADED);
  assert.strictEqual(dec.cooldownSatisfied, true);
  assert.strictEqual(dec.hysteresisSatisfied, true);
});

test("evaluateGovernance: cooldown not satisfied blocks automatic transition", () => {
  const source = { id: "src-1", status: SourceStatus.ACTIVE };
  const snapshots = [
    makeSnapshot({ sourceId: "src-1", operationalHealth: HealthLevel.LOW, evaluatedAt: "2026-08-30T01:00:00Z" }),
    makeSnapshot({ sourceId: "src-1", operationalHealth: HealthLevel.LOW, evaluatedAt: "2026-08-30T01:30:00Z" })
  ];

  const dec = evaluateGovernance(source, snapshots, {
    decisionAt: "2026-08-30T02:00:00Z",
    lastTransitionAt: "2026-08-30T01:45:00Z", // Only 15 min ago (cooldown 60 min)
    cooldownMinutes: 60
  });

  assert.strictEqual(dec.decision, GovernanceOutcome.NO_CHANGE);
  assert.strictEqual(dec.reasonCodes.includes("COOLDOWN_NOT_SATISFIED"), true);
});

test("evaluateGovernance: DEGRADED + sustained HIGH-confidence healthy snapshots allows recovery to ACTIVE", () => {
  const source = { id: "src-rec", status: SourceStatus.DEGRADED };
  const snapshots = [
    makeSnapshot({ sourceId: "src-rec", operationalHealth: HealthLevel.HIGH, evaluatedAt: "2026-08-30T00:30:00Z" }),
    makeSnapshot({ sourceId: "src-rec", operationalHealth: HealthLevel.HIGH, evaluatedAt: "2026-08-30T01:00:00Z" })
  ];

  const dec = evaluateGovernance(source, snapshots, {
    decisionAt: "2026-08-30T02:00:00Z",
    lastTransitionAt: "2026-08-29T10:00:00Z",
    recoveryHysteresisCount: 2
  });

  assert.strictEqual(dec.decision, GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION);
  assert.strictEqual(dec.proposedState, SourceStatus.ACTIVE);
});

test("evaluateGovernance: operationalHealth HIGH + intelligence LOW proposes LOW_PRIORITY (not PAUSED)", () => {
  const source = { id: "src-low", status: SourceStatus.ACTIVE };
  const snapshots = [
    makeSnapshot({ sourceId: "src-low", operationalHealth: HealthLevel.HIGH, intelligenceContribution: ContributionLevel.LOW, evaluatedAt: "2026-08-30T00:30:00Z" }),
    makeSnapshot({ sourceId: "src-low", operationalHealth: HealthLevel.HIGH, intelligenceContribution: ContributionLevel.LOW, evaluatedAt: "2026-08-30T01:00:00Z" })
  ];

  const dec = evaluateGovernance(source, snapshots, {
    decisionAt: "2026-08-30T02:00:00Z",
    degradeHysteresisCount: 2
  });

  assert.strictEqual(dec.proposedState, SourceStatus.LOW_PRIORITY);
  assert.strictEqual(dec.decision, GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION);
});

test("evaluateGovernance: ACCESS_CONFIGURATION_FAILURE and POLICY_ACCESS_FAILURE require manual review", () => {
  const source = { id: "src-policy", status: SourceStatus.ACTIVE };

  // Policy failure
  const snapPolicy = makeSnapshot({
    sourceId: "src-policy",
    findings: [{ code: "POLICY_ACCESS_FAILURE" }]
  });
  const decPolicy = evaluateGovernance(source, [snapPolicy], { decisionAt: "2026-08-30T02:00:00Z" });
  assert.strictEqual(decPolicy.decision, GovernanceOutcome.REQUIRE_MANUAL_REVIEW);
  assert.strictEqual(decPolicy.reasonCodes.includes("POLICY_ACCESS_PROHIBITION"), true);

  // Access failure
  const snapAccess = makeSnapshot({
    sourceId: "src-policy",
    findings: [{ code: "ACCESS_CONFIGURATION_FAILURE" }]
  });
  const decAccess = evaluateGovernance(source, [snapAccess], { decisionAt: "2026-08-30T02:00:00Z" });
  assert.strictEqual(decAccess.decision, GovernanceOutcome.REQUIRE_MANUAL_REVIEW);
  assert.strictEqual(decAccess.reasonCodes.includes("ACCESS_CONFIGURATION_ISSUE"), true);
});

test("evaluateGovernance: APPROVED + healthy source strictly prevents automatic activation", () => {
  const source = { id: "src-app", status: SourceStatus.APPROVED };
  const snapshots = [
    makeSnapshot({ sourceId: "src-app", operationalHealth: HealthLevel.HIGH }),
    makeSnapshot({ sourceId: "src-app", operationalHealth: HealthLevel.HIGH })
  ];

  const dec = evaluateGovernance(source, snapshots, { decisionAt: "2026-08-30T02:00:00Z" });
  assert.strictEqual(dec.decision, GovernanceOutcome.NO_CHANGE);
  assert.strictEqual(dec.proposedState, SourceStatus.APPROVED);
});

test("SourceGovernanceApplier: applies approved transition and blocks stale decisions", () => {
  const applier = new SourceGovernanceApplier();

  const source = { id: "src-trans", status: SourceStatus.ACTIVE };
  const decision = {
    decisionId: "gov:dec:src-trans:1",
    sourceId: "src-trans",
    currentState: SourceStatus.ACTIVE,
    proposedState: SourceStatus.DEGRADED,
    decision: GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION,
    reasonCodes: ["OPERATIONAL_DEGRADATION"]
  };

  // 1. Application succeeds
  const res1 = applier.applyDecision(source, decision, { appliedAt: "2026-08-30T02:00:00Z" });
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.status, "APPLIED");
  assert.strictEqual(res1.sourceRecord.status, SourceStatus.DEGRADED);

  // 2. Idempotent replay
  const resReplay = applier.applyDecision(res1.sourceRecord, decision, { appliedAt: "2026-08-30T02:05:00Z" });
  assert.strictEqual(resReplay.ok, true);
  assert.strictEqual(resReplay.status, "REPLAYED");

  // 3. Stale decision protection (state changed externally)
  const staleDecision = {
    decisionId: "gov:dec:src-trans:2",
    sourceId: "src-trans",
    currentState: SourceStatus.ACTIVE, // Decision thought source was ACTIVE
    proposedState: SourceStatus.PAUSED,
    decision: GovernanceOutcome.ALLOW_AUTOMATIC_TRANSITION,
    reasonCodes: ["CRITICAL_PAUSE"]
  };

  const resStale = applier.applyDecision({ id: "src-trans", status: SourceStatus.DEGRADED }, staleDecision, { appliedAt: "2026-08-30T02:10:00Z" });
  assert.strictEqual(resStale.ok, false);
  assert.strictEqual(resStale.status, "STALE_DECISION");
});
