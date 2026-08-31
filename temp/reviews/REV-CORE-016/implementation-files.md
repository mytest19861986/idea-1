Exit code: 0
Wall time: 0.3 seconds
Output:
Exit code: 0
Wall time: 0.3 seconds
Output:
## src/publishing/record.mjs
```js
function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function boundedNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`${name} must be a finite number from 0 through 100`);
  }
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

function normalizeCitation(input) {
  if (!input || typeof input !== "object") throw new TypeError("citation must be an object");
  const url = new URL(requiredString(input.url, "citation.url"));
  if (url.protocol !== "https:") throw new TypeError("citation.url must use HTTPS");
  return Object.freeze({
    sourceId: requiredString(input.sourceId, "citation.sourceId"),
    collectedItemId: requiredString(input.collectedItemId, "citation.collectedItemId"),
    url: url.toString()
  });
}

export function createPublicationRecord(input) {
  if (!input || typeof input !== "object") throw new TypeError("publication record is required");
  if (!Array.isArray(input.citations) || input.citations.length === 0) throw new TypeError("at least one citation is required");
  const citations = input.citations.map(normalizeCitation).sort((left, right) => `${left.sourceId}\u0000${left.collectedItemId}`.localeCompare(`${right.sourceId}\u0000${right.collectedItemId}`));
  const identities = new Set();
  for (const citation of citations) {
    const identity = `${citation.sourceId}\u0000${citation.collectedItemId}`;
    if (identities.has(identity)) throw new TypeError("duplicate citation identity");
    identities.add(identity);
  }
  return Object.freeze({
    schemaVersion: 1,
    publicationState: "DRAFT",
    opportunityId: requiredString(input.opportunityId, "opportunityId"),
    publicationRevision: positiveInteger(input.publicationRevision, "publicationRevision"),
    locale: requiredString(input.locale, "locale"),
    title: requiredString(input.title, "title"),
    summary: requiredString(input.summary, "summary"),
    score: boundedNumber(input.score, "score"),
    generatedAt: isoTimestamp(input.generatedAt, "generatedAt"),
    citations: Object.freeze(citations)
  });
}

```
## src/publishing/authorization.mjs
```js
function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

export function approvePublication(record, approval) {
  if (!record || typeof record !== "object") throw new TypeError("publication record is required");
  if (record.publicationState !== "DRAFT") throw new RangeError("only DRAFT records may be approved");
  if (!approval || typeof approval !== "object") throw new TypeError("approval is required");
  const actor = requiredString(approval.actor, "approval.actor");
  const reason = requiredString(approval.reason, "approval.reason");
  const approvedAt = isoTimestamp(approval.approvedAt, "approval.approvedAt");
  const event = Object.freeze({
    type: "PUBLICATION_APPROVED",
    opportunityId: requiredString(record.opportunityId, "record.opportunityId"),
    publicationRevision: positiveInteger(record.publicationRevision, "record.publicationRevision"),
    actor,
    reason,
    occurredAt: approvedAt
  });
  return Object.freeze({
    record: Object.freeze({ ...record, publicationState: "APPROVED", publicationApproval: Object.freeze({ actor, reason, approvedAt, publicationRevision: positiveInteger(record.publicationRevision, "record.publicationRevision") }) }),
    event
  });
}

```
## src/delivery/request.mjs
```js
export const DeliveryChannel = Object.freeze({ WEB: "WEB", TELEGRAM: "TELEGRAM" });

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

export function createDeliveryRequest(record, input) {
  if (!record || typeof record !== "object") throw new TypeError("publication record is required");
  if (record.publicationState !== "APPROVED") throw new RangeError("only APPROVED records may request delivery");
  const publicationRevision = positiveInteger(record.publicationRevision, "record.publicationRevision");
  if (!record.publicationApproval || record.publicationApproval.publicationRevision !== publicationRevision) throw new RangeError("approval must match publication revision");
  if (!input || typeof input !== "object") throw new TypeError("delivery request is required");
  const channel = requiredString(input.channel, "channel").toUpperCase();
  if (!Object.values(DeliveryChannel).includes(channel)) throw new TypeError("delivery channel is not supported");
  return Object.freeze({
    schemaVersion: 1,
    opportunityId: requiredString(record.opportunityId, "record.opportunityId"),
    publicationRevision,
    channel,
    idempotencyKey: requiredString(input.idempotencyKey, "idempotencyKey"),
    requestedAt: isoTimestamp(input.requestedAt, "requestedAt"),
    record
  });
}

```
## src/delivery/result.mjs
```js
const DeliveryStatus = Object.freeze({ DELIVERED: "DELIVERED", FAILED: "FAILED" });

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

export { DeliveryStatus };

export function createDeliveryResult(request, input) {
  if (!request || typeof request !== "object") throw new TypeError("delivery request is required");
  requiredString(request.opportunityId, "request.opportunityId");
  const publicationRevision = positiveInteger(request.publicationRevision, "request.publicationRevision");
  requiredString(request.channel, "request.channel");
  requiredString(request.idempotencyKey, "request.idempotencyKey");
  if (!input || typeof input !== "object") throw new TypeError("delivery result is required");
  const status = requiredString(input.status, "status").toUpperCase();
  if (!Object.values(DeliveryStatus).includes(status)) throw new TypeError("delivery status is not supported");
  const result = {
    schemaVersion: 1,
    opportunityId: request.opportunityId,
    publicationRevision,
    channel: request.channel,
    idempotencyKey: request.idempotencyKey,
    status,
    occurredAt: isoTimestamp(input.occurredAt, "occurredAt")
  };
  if (status === DeliveryStatus.DELIVERED) result.channelReference = requiredString(input.channelReference, "channelReference");
  if (status === DeliveryStatus.FAILED) result.failureCode = requiredString(input.failureCode, "failureCode");
  return Object.freeze(result);
}

```
## src/delivery/ledger.mjs
```js
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ledgerFile = "delivery-ledger.json";
const auditFile = "delivery-audit.jsonl";

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomically(path, value) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function assertRequest(request) {
  if (!request || typeof request !== "object") throw new TypeError("delivery request is required");
  requiredString(request.opportunityId, "request.opportunityId");
  positiveInteger(request.publicationRevision, "request.publicationRevision");
  requiredString(request.channel, "request.channel");
  requiredString(request.idempotencyKey, "request.idempotencyKey");
  requiredString(request.requestedAt, "request.requestedAt");
}

export class DeliveryLedger {
  #directory;
  #now;

  constructor({ directory, now = () => new Date().toISOString() }) {
    if (typeof directory !== "string" || directory.length === 0) throw new TypeError("directory is required");
    this.#directory = directory;
    this.#now = now;
  }

  get #ledgerPath() { return join(this.#directory, ledgerFile); }
  get #auditPath() { return join(this.#directory, auditFile); }

  async initialize() {
    await mkdir(this.#directory, { recursive: true });
    const records = await readJson(this.#ledgerPath, []);
    if (!Array.isArray(records)) throw new TypeError("delivery ledger snapshot must be an array");
    return records;
  }

  async claim(request) {
    assertRequest(request);
    const records = await this.initialize();
    const key = `${request.opportunityId}\u0000${request.publicationRevision}\u0000${request.channel}\u0000${request.idempotencyKey}`;
    const existing = records.find((record) => record.key === key);
    if (existing) return Object.freeze({ accepted: false, claim: structuredClone(existing) });
    const claim = { key, opportunityId: request.opportunityId, publicationRevision: request.publicationRevision, channel: request.channel, idempotencyKey: request.idempotencyKey, requestedAt: request.requestedAt, claimedAt: this.#now() };
    records.push(claim);
    await mkdir(dirname(this.#ledgerPath), { recursive: true });
    await writeJsonAtomically(this.#ledgerPath, records);
    await writeFile(this.#auditPath, `${JSON.stringify({ type: "DELIVERY_CLAIMED", at: claim.claimedAt, payload: claim })}\n`, { encoding: "utf8", flag: "a" });
    return Object.freeze({ accepted: true, claim: structuredClone(claim) });
  }
}

```



