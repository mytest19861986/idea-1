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

export const DEFAULT_DISCOVERY_INTERVAL_MS = 60000; // 1 minute default interval in AUTO
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
    this.lastRunStatus = "IDLE";
    this.todayDiscoveredCount = 0;
    this.lastRunNewOpportunities = 0;
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
    this.timer = setInterval(() => {
      this.executeDiscoveryRun("AUTO").catch(err => {
        console.error("Auto discovery run failed:", err.message);
      });
    }, this.intervalMs);
  }

  stopAutoSchedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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
    let newItemsCount = 0;

    try {
      const activeSources = Array.from(this.sources.values()).filter(
        s => s.status === "ACTIVE" && s.governanceStatus === "APPROVED"
      );

      for (const source of activeSources) {
        try {
          if (source.id === "hacker-news-official-api") {
            const collectorOptions = {};
            if (this.fetchFn) {
              collectorOptions.fetchFn = this.fetchFn;
            }
            const collector = createHnCollector(collectorOptions);
            const feedResult = await collector.fetchFeed({ feedType: "showstories", limit: 5 });

            if (feedResult && feedResult.ok && Array.isArray(feedResult.documents)) {
              for (const rawDoc of feedResult.documents) {
                if (!rawDoc || !rawDoc.canonicalUrl) continue;

                // Per-item daily budget cap enforcement (DISCO-005 / C1)
                if (this.todayDiscoveredCount >= this.dailyBudget) {
                  break;
                }

                // Process through candidate store if provided
                if (this.candidateStore) {
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
                      this.todayDiscoveredCount++;
                    }
                  }
                } else {
                  newItemsCount++;
                  this.todayDiscoveredCount++;
                }
              }

              source.health = DiscoveryHealthStatus.HEALTHY;
              source.lastSuccessAt = new Date().toISOString();
              source.errorCount = 0;
              source.lastError = null;
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
              for (const rawDoc of searchResult.documents) {
                if (!rawDoc || !rawDoc.canonicalUrl) continue;

                if (this.todayDiscoveredCount >= this.dailyBudget) {
                  break;
                }

                if (this.candidateStore) {
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
                      this.todayDiscoveredCount++;
                    }
                  }
                } else {
                  newItemsCount++;
                  this.todayDiscoveredCount++;
                }
              }

              source.health = DiscoveryHealthStatus.HEALTHY;
              source.lastSuccessAt = new Date().toISOString();
              source.errorCount = 0;
              source.lastError = null;
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
        }
      }

      const hasActiveErrors = activeSources.some(s => s.health === DiscoveryHealthStatus.ERROR);
      this.lastRunStatus = hasActiveErrors ? "PARTIAL_SUCCESS" : "SUCCESS";
      this.lastRunNewOpportunities = newItemsCount;
    } catch (err) {
      this.lastRunStatus = "ERROR";
      console.error("Discovery runCycle error:", err);
    } finally {
      this.isRunning = false;
      this.lastRunAt = new Date().toISOString();
    }

    return {
      status: this.lastRunStatus,
      trigger: triggeredBy,
      startedAt: startTime,
      completedAt: this.lastRunAt,
      newItemsDiscovered: newItemsCount,
      todayDiscoveredCount: this.todayDiscoveredCount,
      overallHealth: this.getOverallHealth()
    };
  }

  getOverallHealth() {
    const sources = Array.from(this.sources.values());
    if (sources.some(s => s.health === DiscoveryHealthStatus.ERROR)) return DiscoveryHealthStatus.ERROR;
    if (sources.some(s => s.health === DiscoveryHealthStatus.DEGRADED)) return DiscoveryHealthStatus.DEGRADED;
    if (sources.some(s => s.health === DiscoveryHealthStatus.LIMITED)) return DiscoveryHealthStatus.LIMITED;
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
      lastRunStatus: this.lastRunStatus,
      lastRunNewOpportunities: this.lastRunNewOpportunities,
      todayDiscoveredCount: this.todayDiscoveredCount,
      dailyBudget: this.dailyBudget,
      sources: Array.from(this.sources.values()).map(s => ({ ...s }))
    });
  }

  destroy() {
    this.stopAutoSchedule();
  }
}
