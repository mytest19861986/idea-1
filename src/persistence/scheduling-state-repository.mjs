import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { telemetry } from "../observability/telemetry.mjs";

/**
 * ============================================================================
 * SCHEDULING STATE REPOSITORY (PKG-STATE-019)
 * Invariants: STATE-I011 through STATE-I017
 * Multi-factor slot uniqueness, durable dispatch replay protection
 * ============================================================================
 */

export class SchedulingStateRepository {
  constructor() {
    this.slots = new Map(); // slotId -> slotRecord
    this.slotUniquenessIndex = new Map(); // "sourceId:taskType:policyVersion:slotFloorAt" -> slotId
    this.sourceStates = new Map(); // sourceId -> schedulingStateRecord
  }

  recordSlot(slot) {
    if (!slot || !slot.slotId || !slot.sourceId || !slot.taskType || !slot.policyVersion || !slot.slotFloorAt || !slot.taskId) {
      throw new TypeError("VALIDATION_FAILURE: slotId, sourceId, taskType, policyVersion, slotFloorAt, and taskId are required");
    }
    validateIsoTimestamp(slot.slotFloorAt, "slot.slotFloorAt");

    const uniquenessKey = `${slot.sourceId}:${slot.taskType}:${slot.policyVersion}:${slot.slotFloorAt}`;

    if (this.slotUniquenessIndex.has(uniquenessKey)) {
      const existingSlotId = this.slotUniquenessIndex.get(uniquenessKey);
      const existing = this.slots.get(existingSlotId);
      telemetry.recordCounter("scheduler_slot_replayed", 1, {
        taskType: slot.taskType,
        policyVersion: slot.policyVersion
      });
      return deepFreeze({
        created: false,
        replayed: true,
        slot: deepFreeze({ ...existing })
      });
    }

    const slotRecord = {
      slotId: slot.slotId,
      sourceId: slot.sourceId,
      taskType: slot.taskType,
      policyVersion: slot.policyVersion,
      slotFloorAt: slot.slotFloorAt,
      taskId: slot.taskId,
      status: "DISPATCHED",
      createdAt: new Date().toISOString()
    };

    this.slots.set(slot.slotId, slotRecord);
    this.slotUniquenessIndex.set(uniquenessKey, slot.slotId);

    telemetry.recordCounter("scheduler_slot_created", 1, {
      taskType: slot.taskType,
      policyVersion: slot.policyVersion
    });

    return deepFreeze({
      created: true,
      replayed: false,
      slot: deepFreeze({ ...slotRecord })
    });
  }

  getSlotById(slotId) {
    const slot = this.slots.get(slotId);
    return slot ? deepFreeze({ ...slot }) : null;
  }

  updateSourceSchedulingState(sourceId, stateUpdate = {}) {
    if (!sourceId) throw new TypeError("sourceId is required");

    const current = this.sourceStates.get(sourceId) || {
      sourceId,
      lastDispatchedSlotId: null,
      lastDispatchedAt: null,
      nextEligibleAt: null,
      updatedAt: new Date().toISOString()
    };

    if (stateUpdate.lastDispatchedSlotId) current.lastDispatchedSlotId = stateUpdate.lastDispatchedSlotId;
    if (stateUpdate.lastDispatchedAt) {
      validateIsoTimestamp(stateUpdate.lastDispatchedAt, "lastDispatchedAt");
      current.lastDispatchedAt = stateUpdate.lastDispatchedAt;
    }
    if (stateUpdate.nextEligibleAt) {
      validateIsoTimestamp(stateUpdate.nextEligibleAt, "nextEligibleAt");
      current.nextEligibleAt = stateUpdate.nextEligibleAt;
    }
    current.updatedAt = new Date().toISOString();

    this.sourceStates.set(sourceId, current);
    return deepFreeze({ ...current });
  }

  getSourceSchedulingState(sourceId) {
    const state = this.sourceStates.get(sourceId);
    return state ? deepFreeze({ ...state }) : null;
  }
}
