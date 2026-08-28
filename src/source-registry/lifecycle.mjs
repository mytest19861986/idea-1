export const SourceStatus = Object.freeze({
  DISCOVERED: "DISCOVERED",
  CANDIDATE: "CANDIDATE",
  EVALUATING: "EVALUATING",
  APPROVED: "APPROVED",
  ACTIVE: "ACTIVE",
  LOW_PRIORITY: "LOW_PRIORITY",
  PAUSED: "PAUSED",
  DEGRADED: "DEGRADED",
  REJECTED: "REJECTED",
  RETIRED: "RETIRED"
});

const transitions = Object.freeze({
  [SourceStatus.DISCOVERED]: [SourceStatus.CANDIDATE, SourceStatus.REJECTED],
  [SourceStatus.CANDIDATE]: [SourceStatus.EVALUATING, SourceStatus.REJECTED],
  [SourceStatus.EVALUATING]: [SourceStatus.APPROVED, SourceStatus.REJECTED],
  [SourceStatus.APPROVED]: [SourceStatus.ACTIVE, SourceStatus.PAUSED, SourceStatus.REJECTED],
  [SourceStatus.ACTIVE]: [SourceStatus.LOW_PRIORITY, SourceStatus.PAUSED, SourceStatus.DEGRADED, SourceStatus.RETIRED],
  [SourceStatus.LOW_PRIORITY]: [SourceStatus.ACTIVE, SourceStatus.PAUSED, SourceStatus.RETIRED],
  [SourceStatus.PAUSED]: [SourceStatus.ACTIVE, SourceStatus.LOW_PRIORITY, SourceStatus.RETIRED],
  [SourceStatus.DEGRADED]: [SourceStatus.ACTIVE, SourceStatus.PAUSED, SourceStatus.RETIRED],
  [SourceStatus.REJECTED]: [],
  [SourceStatus.RETIRED]: []
});

export function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}

export function transitionSource(source, to, { at = new Date().toISOString(), reason } = {}) {
  if (!canTransition(source.status, to)) {
    throw new Error(`Invalid source transition: ${source.status} -> ${to}`);
  }
  return {
    ...source,
    status: to,
    lastEvaluatedAt: at,
    statusReason: reason ?? null
  };
}
