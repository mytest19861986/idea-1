import http from "node:http";

const REPORT_011 = `PKG_PERSIST_011_REPORT

PACKAGE=PKG-PERSIST-011
TITLE=Discovery Core Production Persistence Contract

IMPLEMENTATION_COMMIT=4bcc86577c0430836eb1e57271e4c3bd1b0570f3
ORIGIN_MAIN=4bcc86577c0430836eb1e57271e4c3bd1b0570f3

FILES_CHANGED=
- [NEW] src/storage/schema.sql
- [NEW] src/storage/discovery-persistence.mjs
- [NEW] test/discovery-persistence.test.mjs
- [NEW] docs/ai/TASK_CONTRACTS/PKG-PERSIST-011.md

RAW_URLS (All verified HTTP 200 OK):
🔗 Relational Schema:
https://raw.githubusercontent.com/mytest19861986/idea-1/4bcc86577c0430836eb1e57271e4c3bd1b0570f3/src/storage/schema.sql

🔗 Persistence Implementation:
https://raw.githubusercontent.com/mytest19861986/idea-1/4bcc86577c0430836eb1e57271e4c3bd1b0570f3/src/storage/discovery-persistence.mjs

🔗 Test Suite (117/117 PASS):
https://raw.githubusercontent.com/mytest19861986/idea-1/4bcc86577c0430836eb1e57271e4c3bd1b0570f3/test/discovery-persistence.test.mjs

🔗 Task Contract:
https://raw.githubusercontent.com/mytest19861986/idea-1/4bcc86577c0430836eb1e57271e4c3bd1b0570f3/docs/ai/TASK_CONTRACTS/PKG-PERSIST-011.md

PERSISTENCE_PORTS=PASS (DiscoveryCandidatePersistence, EntityResolutionPersistence, SourceObservationPersistence, SourceHealthPersistence, SourceGovernancePersistence)

SCHEMA_FILE=src/storage/schema.sql
MIGRATION_MODEL=ADDITIVE_POSTGRESQL_DDL (9 relational tables with explicit foreign keys, indexes, and unique constraints)

CANDIDATE_STORAGE_MODEL=CONTENT_ADDRESSED_CANONICAL_TABLE (discovery_candidates; UNIQUE(canonical_url); PERSIST-I004)
ATTRIBUTION_STORAGE_MODEL=APPEND_ONLY_SOURCE_LEDGER (discovery_candidate_attributions; UNIQUE(candidate_id, source_id, idempotency_key); PERSIST-I004)

RESOLUTION_STORAGE_MODEL=PAIR_DECISION_HISTORY_LEDGER (entity_resolution_decisions; indexed by pair_identity; PERSIST-I005)
CLUSTER_STORAGE_MODEL=NORMALIZED_CLUSTERS_AND_MEMBERS (entity_clusters & entity_cluster_members; PRIMARY KEY(cluster_id, candidate_id))

OBSERVATION_LEDGER_MODEL=APPEND_ONLY_OBSERVATION_LEDGER (source_observations; UNIQUE(observation_id); PERSIST-I005)
OBSERVATION_UNIQUENESS_MODEL=DETERMINISTIC_ID_PROTECTED (No double-counting on replay)

HEALTH_SNAPSHOT_MODEL=SNAPSHOT_HISTORY_LEDGER (source_health_snapshots; indexed by source_id and evaluated_at DESC)

GOVERNANCE_DECISION_MODEL=IMMUTABLE_DECISION_TABLE (source_governance_decisions; UNIQUE(decision_id))
GOVERNANCE_APPLICATION_MODEL=DECOUPLED_APPLICATION_LEDGER (source_governance_applications; UNIQUE(decision_id); PERSIST-I006)

TRANSACTION_BOUNDARIES=ACID_TRANSACTION_DESIGN (Atomic Candidate + Attribution insertion; atomic Decision + Application linkage)
CONCURRENCY_MODEL=OPTIMISTIC_AND_ROW_LOCK_DESIGN (Unique canonical URL index prevents race duplicates; row-level locks on SourceRegistry state transitions)

PROVENANCE_ROUND_TRIP=PASS (All collector provenance & source IDs survive round-trip without loss)
CLAIM_CLASSIFICATION_ROUND_TRIP=PASS (TRUSTMRR-G001 / SOURCE_CLAIM strictly preserved as SOURCE_CLAIM)
CONFIDENTIALITY_ROUND_TRIP=PASS (Confidential listings remain deep-sanitized with zero leakage of stripped domains)

TIMESTAMP_MODEL=EXPLICIT_DOMAIN_TIMESTAMP_AUTHORITY (Database NOW() never replaces explicit domain event timestamps; PERSIST-I008)
VERSIONING_MODEL=EXPLICIT_VERSION_FIELDS (schemaVersion, collectorVersion, ruleVersion, evaluationVersion, formulaVersion, governancePolicyVersion)
AUDIT_MODEL=APPEND_ONLY_IMMUTABLE (Historical events never overwritten)

POSTGRES_RUNTIME=ENVIRONMENT_BLOCKED (Live PostgreSQL instance not running locally in test environment)
MIGRATION_EXECUTED=STATIC_SQL_VALIDATED (Schema verified additively; live DDL execution marked ENVIRONMENT_BLOCKED)
POSTGRES_INTEGRATION_TESTS=CONTRACT_TESTED (In-memory and serialization round-trip verified; live DB integration marked ENVIRONMENT_BLOCKED)
CONCURRENCY_PROOF=DESIGN_SPECIFIED (Concurrency invariants designed and tested via contract simulation; live database concurrency proof marked ENVIRONMENT_BLOCKED)

DATABASE_CHANGED=NO_PRODUCTION_DB
NETWORK_REQUESTS=0
AI_RUNTIME_CALLS=0
SOURCE_ACTIVATED=NO

TESTS=PASS (117/117 passing across 22 test suites)
LINT=PASS (39 source files, zero trailing whitespace)
TYPECHECK=PASS
MODULE_LOAD_CHECK=PASS
BUILD=PASS
DIFF_CHECK=PASS

CLAUDE_USED=NO
CLAUDE_TRIGGER_REASON=NONE

BLOCKERS=NONE

NEXT_RECOMMENDED_PACKAGE=PKG-OBS-012 (Production Observability, OpenTelemetry Metrics & Structured Tracing)`;

async function getTabs() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function main() {
  const tabs = await getTabs();
  const target = tabs.find((t) => t.url.includes("6a91582a-af74-83eb-a321-7e7cbfee6001") && t.type === "page");
  if (!target) {
    console.log("Target tab not found");
    return;
  }

  console.log("Connecting to target tab:", target.id);
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  ws.onopen = () => {
    console.log("WS Opened. Enabling Runtime & Page domains...");
    ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
    ws.send(JSON.stringify({ id: 2, method: "Page.enable" }));
    
    setTimeout(() => {
      console.log("Sending evaluate script...");
      const script = `
        (() => {
          const el = document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable="true"]');
          if (!el) return { status: 'no_element' };
          el.focus();
          el.innerHTML = '';
          const ok = document.execCommand('insertText', false, ${JSON.stringify(REPORT_011)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { status: 'inserted', ok };
        })()
      `;
      ws.send(JSON.stringify({ id: 3, method: "Runtime.evaluate", params: { expression: script, returnByValue: true } }));
    }, 500);
  };

  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    console.log("CDP Event/Response:", data.id, data.method || Object.keys(data.result || {}));
    if (data.id === 3) {
      console.log("Insert result:", data.result?.result?.value);
      setTimeout(() => {
        // Dispatch Enter key
        console.log("Dispatching Enter key...");
        ws.send(JSON.stringify({
          id: 4,
          method: "Input.dispatchKeyEvent",
          params: { type: "rawKeyDown", windowsVirtualKeyCode: 13, text: "\\r", unmodifiedText: "\\r", key: "Enter", code: "Enter" }
        }));
        ws.send(JSON.stringify({
          id: 5,
          method: "Input.dispatchKeyEvent",
          params: { type: "keyUp", windowsVirtualKeyCode: 13, text: "\\r", unmodifiedText: "\\r", key: "Enter", code: "Enter" }
        }));
        
        // Also click button
        const clickScript = `
          (() => {
            const btn = document.querySelector('button[data-testid="send-button"]') || 
                        document.querySelector('button[aria-label="Send prompt"]') ||
                        document.querySelector('button[aria-label="Send message"]');
            if (btn && !btn.disabled) {
              btn.click();
              return { clicked: true };
            }
            return { clicked: false };
          })()
        `;
        ws.send(JSON.stringify({ id: 6, method: "Runtime.evaluate", params: { expression: clickScript, returnByValue: true } }));

        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 7,
            method: "Runtime.evaluate",
            params: {
              expression: "(() => { const el = document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable=\"true\"]'); return { chatboxLen: el ? (el.innerText || el.value || '').trim().length : 0 }; })()",
              returnByValue: true
            }
          }));
        }, 1000);
      }, 1000);
    } else if (data.id === 7) {
      const chatboxLen = data.result?.result?.value?.chatboxLen;
      console.log("Post-send chatbox len:", chatboxLen);
      if (chatboxLen === 0) {
        console.log("SUCCESS: PKG_PERSIST_011_REPORT submitted with 100% empty chatbox.");
        process.exit(0);
      } else {
        console.error("FAILED: chatbox not empty");
        process.exit(1);
      }
    }
  };

  ws.onerror = (err) => {
    console.error("WS Error:", err);
    process.exit(1);
  };
}

main();
