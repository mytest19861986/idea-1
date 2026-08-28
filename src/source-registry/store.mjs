import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { transitionSource } from "./lifecycle.mjs";

const registryFile = "source-registry.json";
const auditFile = "source-audit.jsonl";

function assertSource(source) {
  if (!source || typeof source !== "object") throw new TypeError("source is required");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(source.id ?? "")) {
    throw new TypeError("source.id must be 3-64 lowercase letters, digits, or hyphens");
  }
  if (typeof source.name !== "string" || source.name.trim().length === 0) throw new TypeError("source.name is required");
  if (typeof source.baseUrl !== "string" || !URL.canParse(source.baseUrl)) throw new TypeError("source.baseUrl must be a valid URL");
  if (typeof source.status !== "string") throw new TypeError("source.status is required");
}

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

export class SourceRegistryStore {
  #directory;
  #now;

  constructor({ directory, now = () => new Date().toISOString() }) {
    if (typeof directory !== "string" || directory.length === 0) throw new TypeError("directory is required");
    this.#directory = directory;
    this.#now = now;
  }

  get #registryPath() { return join(this.#directory, registryFile); }
  get #auditPath() { return join(this.#directory, auditFile); }

  async initialize() {
    await mkdir(this.#directory, { recursive: true });
    const records = await readJson(this.#registryPath, []);
    if (!Array.isArray(records)) throw new TypeError("registry snapshot must be an array");
    return records;
  }

  async list() {
    return (await this.initialize()).map((source) => structuredClone(source));
  }

  async get(id) {
    return (await this.initialize()).find((source) => source.id === id) ?? null;
  }

  async create(source, { actor = "system" } = {}) {
    assertSource(source);
    const records = await this.initialize();
    if (records.some((record) => record.id === source.id)) throw new Error(`Source already exists: ${source.id}`);
    const at = this.#now();
    const created = { ...structuredClone(source), createdAt: at, updatedAt: at };
    records.push(created);
    await this.#persist(records, { type: "SOURCE_CREATED", sourceId: source.id, actor, at, payload: { status: source.status } });
    return structuredClone(created);
  }

  async transition(id, to, { actor = "system", reason } = {}) {
    const records = await this.initialize();
    const index = records.findIndex((source) => source.id === id);
    if (index < 0) throw new Error(`Source not found: ${id}`);
    const at = this.#now();
    const previous = records[index];
    const next = { ...transitionSource(previous, to, { at, reason }), updatedAt: at };
    records[index] = next;
    await this.#persist(records, { type: "SOURCE_STATUS_CHANGED", sourceId: id, actor, at, payload: { from: previous.status, to, reason: reason ?? null } });
    return structuredClone(next);
  }

  async auditEvents() {
    try {
      const data = await readFile(this.#auditPath, "utf8");
      return data.trim() === "" ? [] : data.trim().split("\n").map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async #persist(records, event) {
    await mkdir(dirname(this.#registryPath), { recursive: true });
    await writeJsonAtomically(this.#registryPath, records);
    await writeFile(this.#auditPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
  }
}
