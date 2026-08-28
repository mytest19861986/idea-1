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

function assertRequest(request) {
  if (!request || typeof request !== "object") throw new TypeError("delivery request is required");
  requiredString(request.opportunityId, "request.opportunityId");
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
    const key = `${request.channel}\u0000${request.idempotencyKey}`;
    const existing = records.find((record) => record.key === key);
    if (existing) return Object.freeze({ accepted: false, claim: structuredClone(existing) });
    const claim = { key, opportunityId: request.opportunityId, channel: request.channel, idempotencyKey: request.idempotencyKey, requestedAt: request.requestedAt, claimedAt: this.#now() };
    records.push(claim);
    await mkdir(dirname(this.#ledgerPath), { recursive: true });
    await writeJsonAtomically(this.#ledgerPath, records);
    await writeFile(this.#auditPath, `${JSON.stringify({ type: "DELIVERY_CLAIMED", at: claim.claimedAt, payload: claim })}\n`, { encoding: "utf8", flag: "a" });
    return Object.freeze({ accepted: true, claim: structuredClone(claim) });
  }
}
