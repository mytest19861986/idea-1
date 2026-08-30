# PKG-SRC-EVAL-HN-001: Hacker News Official API Controlled Collection Evaluation

- **PACKAGE**: PKG-SRC-EVAL-HN-001
- **TITLE**: Hacker News Official API Controlled Collection Evaluation
- **STATUS**: EVALUATION_COMPLETE
- **VERDICT**: APPROVE_CONTROLLED_COLLECTION

---

## 1. Official API & Public Access Evidence

- **Provider**: Hacker News / Y Combinator
- **Official Documentation**: [https://github.com/HackerNews/API](https://github.com/HackerNews/API)
- **Base URL**: `https://hacker-news.firebaseio.com/v0/`
- **Authorized Public Access Statement**: 
  > "We're making the Hacker News data available in Firebase: https://hacker-news.firebaseio.com/v0/ ... The Firebase gives you near-real-time updates."
- **Auth Model**: `NONE`
- **Credential Required**: `NO`
- **Terms & Policy Risk**: `LOW` (Read-only programmatic consumption within bounded limits)
- **Legal Opinion**: `NOT_PERFORMED`

---

## 2. Endpoints Evaluated

1. **Feed Endpoints**:
   - `/topstories.json`: Array of top story IDs (up to 500)
   - `/newstories.json`: Array of newest story IDs (up to 500)
   - `/showstories.json`: Array of Show HN story IDs (up to 200)
   - `/jobstories.json`: Array of Job posting IDs (up to 200)
2. **Item Resource**:
   - `/item/{id}.json`: Specific story, job, or poll record

---

## 3. Initial Collection Scope & Bounds

- **Initial Scope**: Query `/topstories.json`, `/newstories.json`, `/showstories.json`, `/jobstories.json` for IDs, take top slice, fetch individual items via `/item/{id}.json`.
- **Allowed Item Types**: `story` (specifically Show HN), `job`
- **Excluded Types**: `comment`, `pollopt`
- **MAX_ITEMS_PER_EXECUTION**: `25`
- **COMMENTS_COLLECTION**: `DISABLED`
- **HISTORY_CRAWL**: `FORBIDDEN`
- **USER_PROFILE_COLLECTION**: `DISABLED`
- **FIREBASE_STREAMING_CONNECTION**: `NOT_REQUIRED`

---

## 4. Identity, Provenance & Evidence Classification

- **SOURCE_NATIVE_ID**: Item integer ID (e.g. `8863`)
- **SOURCE_SCOPED_IDENTITY**: `hn:${item.id}`
- **Entity Linkage Policy**: Zero automatic merging on matching domain/author/title.
- **Evidence Taxonomy**:
  - `SOURCE_CLAIM`: `hnItemId`, `type`, `title`, `url`, `by`, `score`, `descendants`, `time`, `sourceTimestamp`
  - `DERIVED_METRIC`: `kids_count` (`len(item.kids)`), `age_hours`, `engagement_velocity` (`score / max(age_hours, 0.5)`), `comments_per_hour`
  - `AI_ANALYSIS` / `AI_HYPOTHESIS`: Any downstream startup traction interpretation or founder-market fit scoring.
- **Traction Metrics Invariant**: `score` and `descendants` are platform engagement proxies, never verified commercial revenue or audited business performance.

---

## 5. Network, Safety & Operational Guardrails

- **Connection Timeout**: 5.0s | **Read Timeout**: 10.0s | **Max Request Duration**: 15.0s
- **Retry Policy**: Max 3 attempts with exponential backoff (500ms initial, 2.0x factor).
- **Error Behavior**: 5xx retryable with backoff; 4xx fail-closed immediately.
- **Concurrency Limit**: `MAX_CONCURRENT_REQUESTS <= 4` (client-side bounded pool).
- **Confidentiality & Privacy**:
  - `by` username is public identifier only; automated de-anonymization and PII extraction strictly forbidden.
  - `deleted` / `dead` flags respected.

---

## 6. Normalization Reference Matrix

| HN API Field | Normalized Target Path | Classification |
|---|---|---|
| `id` | `rawDocument.identity.sourceNativeId` | `SOURCE_CLAIM` (Identity) |
| `"hn:" + id` | `rawDocument.identity.externalId` | `SYSTEM_DETERMINISTIC` |
| `title` | `rawDocument.content.title` | `SOURCE_CLAIM` |
| `url` | `rawDocument.content.targetUrl` | `SOURCE_CLAIM` |
| `text` | `rawDocument.content.bodyHtml` | `SOURCE_CLAIM` |
| `by` | `rawDocument.identity.authorUsername` | `SOURCE_CLAIM` |
| `time` | `rawDocument.metadata.publishedAt` | `SOURCE_CLAIM` (Timestamp) |
| `score` | `rawDocument.signals.platformScore` | `SOURCE_CLAIM` (Engagement) |
| `descendants` | `rawDocument.signals.totalComments` | `SOURCE_CLAIM` (Engagement) |
| `len(kids)` | `rawDocument.signals.directReplies` | `DERIVED_METRIC` |
| `type` | `rawDocument.metadata.itemType` | `SOURCE_CLAIM` |

---

## 7. Package Verification Matrix

- **SOURCE_ACTIVATED**: `NO`
- **NETWORK_COLLECTION_EXECUTED**: `NO`
- **REAL_SECRET_USED**: `NO`
- **GEMINI_USED**: `YES` (Documentation & policy trace completed)
- **CLAUDE_USED**: `NO`
- **VERDICT**: `APPROVE_CONTROLLED_COLLECTION`
- **NEXT_RECOMMENDED_PACKAGE**: `PKG-COL-HN-001`
