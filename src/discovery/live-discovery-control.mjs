import { deepFreeze } from "./discovery-intake.mjs";
import { createHnCollector } from "../collection/hn-collector.mjs";
import { normalizeCollectedItem } from "../collection/normalize.mjs";

/**
 * ============================================================================
 * LOCAL LIVE DISCOVERY ENGINE & CONTROL PLANE (PKG-LIVE-DISCOVERY-001)
 * Enforces:
 * - DISCO-001: Modes OFF (Default), AUTO, MANUAL.
 * - DISCO-002: Single-flight mutex (no concurrent duplicate runs).
 * - DISCO-003: Approved-source-only execution boundary.
 * - DISCO-004: OFF preserves existing data and stops future scheduling.
 * - DISCO-005: Failure isolation & bounded daily budget.
 * ============================================================================
 */

export const DiscoveryMode = Object.freeze({
  OFF: "OFF",
  AUTO: "AUTO",
  MANUAL: "MANUAL"
});

export const DiscoveryHealthStatus = Object.freeze({
  HEALTHY: "HEALTHY",
  LIMITED: "LIMITED",
  DEGRADED: "DEGRADED",
  ERROR: "ERROR"
});

export const DEFAULT_DISCOVERY_INTERVAL_MS = 3600000; // 60 minutes (1 hour) default interval in AUTO
export const DEFAULT_DAILY_BUDGET = 1000;

export class LiveDiscoveryController {
  constructor(options = {}) {
    const {
      mode = DiscoveryMode.OFF,
      intervalMs = DEFAULT_DISCOVERY_INTERVAL_MS,
      dailyBudget = DEFAULT_DAILY_BUDGET,
      candidateStore = null,
      fetchFn = null
    } = options;

    if (dailyBudget <= 0 || !Number.isFinite(dailyBudget)) {
      throw new TypeError("dailyBudget must be a positive number");
    }
    if (intervalMs <= 0 || !Number.isFinite(intervalMs)) {
      throw new TypeError("intervalMs must be a positive number");
    }

    this.mode = mode;
    this.intervalMs = intervalMs;
    this.dailyBudget = dailyBudget;
    this.candidateStore = candidateStore;
    this.fetchFn = fetchFn;

    this.timer = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.lastRunStartedAt = null;
    this.lastRunCompletedAt = null;
    this.lastSuccessfulRunAt = null;
    this.nextScheduledRunAt = null;
    this.currentRunId = null;
    this.lastRunId = null;
    this.lastRunTrigger = null;
    this.lastRunStatus = "IDLE";
    this.todayDiscoveredCount = 0;
    this.lastRunNewOpportunities = 0;
    this.lastRunSourceResults = {};
    this.lastRunCounters = {
      rawSignals: 0,
      newCandidates: 0,
      dedupReplays: 0,
      filtered: 0,
      newOpportunities: 0
    };
    this.runtimeVersion = "1.0.0-rc.8-dev";
    this.dailyCountResetDate = new Date().toISOString().slice(0, 10);

    // Source registry state for approved active sources
    this.sources = new Map([
      ["hacker-news-official-api", {
        id: "hacker-news-official-api",
        name: "Hacker News Official Firebase API",
        status: "ACTIVE",
        governanceStatus: "APPROVED",
        health: DiscoveryHealthStatus.HEALTHY,
        lastSuccessAt: null,
        lastError: null,
        errorCount: 0
      }],
      ["github-official-search-api", {
        id: "github-official-search-api",
        name: "GitHub Official REST Search API",
        status: "ACTIVE",
        governanceStatus: "APPROVED",
        health: DiscoveryHealthStatus.HEALTHY,
        lastSuccessAt: null,
        lastError: null,
        errorCount: 0
      }],
      ["product-hunt-official-api", {
        id: "product-hunt-official-api",
        name: "Product Hunt Official GraphQL API v2",
        status: "EVALUATING",
        governanceStatus: "AUTH_REQUIRED",
        health: DiscoveryHealthStatus.LIMITED,
        lastSuccessAt: null,
        lastError: null,
        errorCount: 0
      }]
    ]);

    if (this.mode === DiscoveryMode.AUTO) {
      this.startAutoSchedule();
    }
  }

  setMode(newMode) {
    if (!Object.values(DiscoveryMode).includes(newMode)) {
      throw new TypeError(`Invalid discovery mode: ${newMode}`);
    }

    const prevMode = this.mode;
    this.mode = newMode;

    if (newMode === DiscoveryMode.AUTO && prevMode !== DiscoveryMode.AUTO) {
      this.startAutoSchedule();
    } else if (newMode !== DiscoveryMode.AUTO) {
      this.stopAutoSchedule();
    }

    return this.getStatus();
  }

  startAutoSchedule() {
    this.stopAutoSchedule();
    this.nextScheduledRunAt = new Date(Date.now() + this.intervalMs).toISOString();
    this.timer = setInterval(() => {
      this.executeDiscoveryRun("AUTO").catch(err => {
        console.error("Auto discovery run failed:", err.message);
      });
      if (this.mode === DiscoveryMode.AUTO) {
        this.nextScheduledRunAt = new Date(Date.now() + this.intervalMs).toISOString();
      }
    }, this.intervalMs);
  }

  stopAutoSchedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextScheduledRunAt = null;
  }

  async runNow() {
    return this.executeDiscoveryRun("MANUAL_RUN_NOW");
  }

  async runCycle(trigger = "MANUAL") {
    return this.executeDiscoveryRun(trigger);
  }

  resetDailyCountIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.dailyCountResetDate) {
      this.todayDiscoveredCount = 0;
      this.dailyCountResetDate = today;
    }
  }

  async executeDiscoveryRun(triggeredBy = "MANUAL") {
    // DISCO-002: Single-flight mutex
    if (this.isRunning) {
      return {
        status: "BLOCKED_ALREADY_RUNNING",
        message: "A discovery execution is already running",
        lastRunAt: this.lastRunAt,
        todayDiscoveredCount: this.todayDiscoveredCount
      };
    }

    this.resetDailyCountIfNeeded();

    // DISCO-005: Daily budget cap
    if (this.todayDiscoveredCount >= this.dailyBudget) {
      return {
        status: "BLOCKED_DAILY_BUDGET_EXCEEDED",
        message: `Daily discovery budget of ${this.dailyBudget} items reached`,
        todayDiscoveredCount: this.todayDiscoveredCount
      };
    }

    // DISCO-001 & DISCO-004: If mode is OFF and not explicitly triggered via MANUAL, do not execute
    if (this.mode === DiscoveryMode.OFF && triggeredBy !== "MANUAL" && triggeredBy !== "MANUAL_RUN_NOW" && !triggeredBy.startsWith("TRIGGER_")) {
      return { status: "SKIPPED_MODE_OFF", message: "Discovery is currently OFF" };
    }

    this.isRunning = true;
    const startTime = new Date().toISOString();
    this.lastRunStartedAt = startTime;
    this.lastRunTrigger = triggeredBy;
    this.currentRunId = `run:${startTime.replace(/[:.]/g, "-")}`;
    
    let newItemsCount = 0;
    let totalRawSignals = 0;
    let totalDedupReplays = 0;
    const currentRunSourceResults = {};

    try {
      const activeSources = Array.from(this.sources.values()).filter(
        s => s.status === "ACTIVE" && s.governanceStatus === "APPROVED"
      );

      for (const source of activeSources) {
        let sourceItemsFetched = 0;
        let sourceNewCandidates = 0;
        let sourceDedupReplays = 0;

        try {
          if (source.id === "hacker-news-official-api") {
            const collectorOptions = {};
            if (this.fetchFn) {
              collectorOptions.fetchFn = this.fetchFn;
            }
            const collector = createHnCollector(collectorOptions);
            const feedResult = await collector.fetchFeed({ feedType: "showstories", limit: 5 });

            if (feedResult && feedResult.ok && Array.isArray(feedResult.documents)) {
              sourceItemsFetched = feedResult.documents.length;
              totalRawSignals += sourceItemsFetched;

              for (const rawDoc of feedResult.documents) {
                if (!rawDoc || !rawDoc.canonicalUrl) continue;

                // Per-item daily budget cap enforcement (DISCO-005 / C1)
                if (this.todayDiscoveredCount >= this.dailyBudget) {
                  break;
                }

                // Enforce MANDATORY_FIX_2: Fail-closed if candidateStore is absent (LOCAL-LIVE-DISCOVERY-005)
                if (!this.candidateStore) {
                  source.health = DiscoveryHealthStatus.DEGRADED;
                  source.lastError = "MISSING_CANDIDATE_STORE: candidateStore dependency required for dedup integrity";
                  throw new Error(source.lastError);
                }

                const targetUrl = rawDoc.contentReference || rawDoc.canonicalUrl;
                const itemForNorm = {
                  url: targetUrl,
                  title: rawDoc.title || "Untitled",
                  summary: rawDoc.rawText || "",
                  externalId: rawDoc.canonicalUrl
                };
                const normalized = normalizeCollectedItem(itemForNorm, {
                  sourceId: source.id,
                  collectedAt: new Date().toISOString()
                });

                if (normalized) {
                  const saveRes = this.candidateStore.save(normalized);
                  if (saveRes && saveRes.created) {
                    newItemsCount++;
                    sourceNewCandidates++;
                    this.todayDiscoveredCount++;
                  } else {
                    sourceDedupReplays++;
                    totalDedupReplays++;
                  }
                }
              }

              source.health = DiscoveryHealthStatus.HEALTHY;
              source.lastSuccessAt = new Date().toISOString();
              source.errorCount = 0;
              source.lastError = null;
              currentRunSourceResults[source.id] = {
                status: "SUCCESS",
                itemsFetched: sourceItemsFetched,
                newCandidates: sourceNewCandidates,
                dedupReplays: sourceDedupReplays
              };
            } else if (feedResult && !feedResult.ok) {
              throw new Error(feedResult.failure?.message || "Feed fetch failed");
            }
          } else if (source.id === "github-official-search-api") {
            const { createGhCollector } = await import("../collection/gh-collector.mjs");
            const collectorOptions = {};
            if (this.fetchFn) {
              collectorOptions.fetchFn = this.fetchFn;
            }
            const collector = createGhCollector(collectorOptions);
            const searchResult = await collector.searchRepositories("topic:ai-agents stars:>1000", { limit: 5 });

            if (searchResult && searchResult.ok && Array.isArray(searchResult.documents)) {
              sourceItemsFetched = searchResult.documents.length;
              totalRawSignals += sourceItemsFetched;

              for (const rawDoc of searchResult.documents) {
                if (!rawDoc || !rawDoc.canonicalUrl) continue;

                if (this.todayDiscoveredCount >= this.dailyBudget) {
                  break;
                }

                // Enforce MANDATORY_FIX_2: Fail-closed if candidateStore is absent (LOCAL-LIVE-DISCOVERY-005)
                if (!this.candidateStore) {
                  source.health = DiscoveryHealthStatus.DEGRADED;
                  source.lastError = "MISSING_CANDIDATE_STORE: candidateStore dependency required for dedup integrity";
                  throw new Error(source.lastError);
                }

                const targetUrl = rawDoc.contentReference || rawDoc.canonicalUrl;
                const itemForNorm = {
                  url: targetUrl,
                  title: rawDoc.title || "Untitled",
                  summary: rawDoc.rawText || "",
                  externalId: rawDoc.canonicalUrl
                };
                const normalized = normalizeCollectedItem(itemForNorm, {
                  sourceId: source.id,
                  collectedAt: new Date().toISOString()
                });

                if (normalized) {
                  const saveRes = this.candidateStore.save(normalized);
                  if (saveRes && saveRes.created) {
                    newItemsCount++;
                    sourceNewCandidates++;
                    this.todayDiscoveredCount++;
                  } else {
                    sourceDedupReplays++;
                    totalDedupReplays++;
                  }
                }
              }

              source.health = DiscoveryHealthStatus.HEALTHY;
              source.lastSuccessAt = new Date().toISOString();
              source.errorCount = 0;
              source.lastError = null;
              currentRunSourceResults[source.id] = {
                status: "SUCCESS",
                itemsFetched: sourceItemsFetched,
                newCandidates: sourceNewCandidates,
                dedupReplays: sourceDedupReplays
              };
            } else if (searchResult && !searchResult.ok) {
              throw new Error(searchResult.failure?.message || "GitHub Search API fetch failed");
            }
          }
        } catch (sourceErr) {
          // Failure isolation per source (DISCO-005)
          source.errorCount++;
          source.lastError = sourceErr.message;
          source.health = source.errorCount > 3 ? DiscoveryHealthStatus.ERROR : DiscoveryHealthStatus.DEGRADED;
          console.error(`Source [${source.id}] execution failed:`, sourceErr.message);
          currentRunSourceResults[source.id] = {
            status: sourceErr.message?.includes("rate limit") ? "RATE_LIMITED" : (sourceErr.message?.includes("timeout") ? "TIMEOUT" : "FAILED"),
            error: sourceErr.message,
            itemsFetched: sourceItemsFetched,
            newCandidates: sourceNewCandidates,
            dedupReplays: sourceDedupReplays
          };
        }
      }

      const hasSourceErrors = Object.values(currentRunSourceResults).some(r => r && r.status !== "SUCCESS");
      const hasSourceSuccess = Object.values(currentRunSourceResults).some(r => r && r.status === "SUCCESS");
      
      if (hasSourceErrors && hasSourceSuccess) {
        this.lastRunStatus = "PARTIAL_SUCCESS";
      } else if (hasSourceErrors && !hasSourceSuccess) {
        this.lastRunStatus = "FAILED";
      } else {
        this.lastRunStatus = "SUCCESS";
      }

      this.lastRunNewOpportunities = newItemsCount;
      if (this.lastRunStatus === "SUCCESS") {
        this.lastSuccessfulRunAt = new Date().toISOString();
      }
    } catch (err) {
      this.lastRunStatus = "FAILED";
      console.error("Discovery runCycle error:", err);
    } finally {
      this.isRunning = false;
      this.lastRunCompletedAt = new Date().toISOString();
      this.lastRunAt = this.lastRunCompletedAt;
      this.lastRunId = this.currentRunId;
      this.currentRunId = null;
      this.lastRunSourceResults = currentRunSourceResults;
      this.lastRunCounters = {
        rawSignals: totalRawSignals,
        newCandidates: newItemsCount,
        dedupReplays: totalDedupReplays,
        filtered: 0,
        newOpportunities: newItemsCount
      };
    }

    return {
      runId: this.lastRunId,
      status: this.lastRunStatus,
      trigger: triggeredBy,
      startedAt: this.lastRunStartedAt,
      completedAt: this.lastRunCompletedAt,
      lastSuccessfulRunAt: this.lastSuccessfulRunAt,
      nextScheduledRunAt: this.nextScheduledRunAt,
      newItemsDiscovered: newItemsCount,
      todayDiscoveredCount: this.todayDiscoveredCount,
      overallHealth: this.getOverallHealth(),
      sourceResults: this.lastRunSourceResults,
      counters: this.lastRunCounters
    };
  }

  getOverallHealth() {
    const activeSources = Array.from(this.sources.values()).filter(
      s => s.status === "ACTIVE" && s.governanceStatus === "APPROVED"
    );
    if (activeSources.length === 0) return DiscoveryHealthStatus.HEALTHY;
    if (activeSources.some(s => s.health === DiscoveryHealthStatus.ERROR)) return DiscoveryHealthStatus.ERROR;
    if (activeSources.some(s => s.health === DiscoveryHealthStatus.DEGRADED)) return DiscoveryHealthStatus.DEGRADED;
    if (activeSources.some(s => s.health === DiscoveryHealthStatus.LIMITED)) return DiscoveryHealthStatus.LIMITED;
    return DiscoveryHealthStatus.HEALTHY;
  }

  getStatus() {
    const activeSources = Array.from(this.sources.values()).filter(
      s => s.status === "ACTIVE" && s.governanceStatus === "APPROVED"
    );

    return deepFreeze({
      mode: this.mode,
      isRunning: this.isRunning,
      activeSourcesCount: activeSources.length,
      totalSourcesCount: this.sources.size,
      overallHealth: this.getOverallHealth(),
      lastRunAt: this.lastRunAt,
      lastRunStartedAt: this.lastRunStartedAt,
      lastRunCompletedAt: this.lastRunCompletedAt,
      lastSuccessfulRunAt: this.lastSuccessfulRunAt,
      nextScheduledRunAt: this.nextScheduledRunAt,
      currentRunId: this.currentRunId,
      lastRunId: this.lastRunId,
      lastRunTrigger: this.lastRunTrigger,
      lastRunStatus: this.lastRunStatus,
      lastRunNewOpportunities: this.lastRunNewOpportunities,
      lastRunSourceResults: { ...this.lastRunSourceResults },
      lastRunCounters: { ...this.lastRunCounters },
      todayDiscoveredCount: this.todayDiscoveredCount,
      dailyBudget: this.dailyBudget,
      runtimeVersion: this.runtimeVersion,
      sources: Array.from(this.sources.values()).map(s => ({ ...s }))
    });
  }

  destroy() {
    this.stopAutoSchedule();
  }
}
