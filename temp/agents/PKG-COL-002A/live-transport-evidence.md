# PKG-COL-002A: TrustMRR Controlled Live Transport Proof Evidence

**Package**: `PKG-COL-002A`  
**Execution Timestamp**: 2026-08-30T02:07:28Z  
**Total Live Requests**: 3 (Bounded by `MAX_HTTP_REQUESTS=3`)  
**Target Origin**: `https://trustmrr.com`  

---

## 1. Summary of Executed Live Requests

| Request # | Target URL | Method | Status Code | Observed Body / Behavior | Invariant & Schema Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Request 1** | `https://trustmrr.com/api/v1/startups?page=1&limit=2` | `GET` | `401 Unauthorized` | `{"error":"Missing or invalid API key. Pass it as: Authorization: Bearer tmrr_..."}` | Confirms `/api/v1/startups` endpoint exists; verifies `Authorization: Bearer tmrr_...` requirement; matches `handleHttpError` (HTTP 401 mapped to `FINAL`). |
| **Request 2** | `https://trustmrr.com/llms.txt` | `GET` | `200 OK` (7,528 bytes) | Verified documentation & platform structure. | Confirms canonical domain `https://trustmrr.com`, marketplace architecture, and payment provider verification model. |
| **Request 3** | `https://trustmrr.com/api/v1/startups/shipfast` | `GET` | `401 Unauthorized` | `{"error":"Missing or invalid API key. Pass it as: Authorization: Bearer tmrr_..."}` | Confirms slug-based detail path `/api/v1/startups/{slug}` exists under authenticated Bearer token scheme. |

---

## 2. Authentication & Access Boundary Analysis
- **Observed Auth Model**: HTTP Bearer token scheme (`Authorization: Bearer tmrr_...`).
- **Unauthenticated Failure Mode**: Clean JSON error payload with HTTP 401 status.
- **Secrets Policy Adherence**: Zero credentials used or embedded in repository. Zero tokens in logs.
- **Bulk Crawling / Ingestion**: Zero bulk collection executed. Zero database writes. Source remains un-activated.

---

## 3. Comparison with Adapter Implementation (`src/collection/trustmrr-collector.mjs`)
1. **Endpoint Alignment**: Base URL `https://trustmrr.com/api/v1` and `/startups` path matches 100%.
2. **Auth Header Construction**: Adapter passes `headers["Authorization"] = "Bearer " + apiKey` matching platform requirement.
3. **Error Handling**: `handleHttpError(401)` returns `kind: "FINAL", retryEligible: false`, preventing infinite retry storms when keys are missing or invalid.
4. **Canonical URL**: `https://trustmrr.com/startup/${slug}` aligns with platform profile structure.
