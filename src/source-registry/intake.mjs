import { SourceStatus } from "./lifecycle.mjs";

function hostnameToId(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalizeDiscoveredSource(input) {
  if (!input || typeof input !== "object") throw new TypeError("discovered source is required");
  if (typeof input.url !== "string") throw new TypeError("url is required");
  const url = new URL(input.url);
  if (url.protocol !== "https:") throw new TypeError("only HTTPS source URLs are accepted");
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  const id = hostnameToId(url.hostname);
  if (id.length < 3) throw new TypeError("source hostname cannot form a valid ID");
  return Object.freeze({
    id,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : url.hostname.replace(/^www\./, ""),
    baseUrl: url.toString(),
    status: SourceStatus.CANDIDATE,
    discoveryMethod: input.discoveryMethod ?? "MANUAL_HINT"
  });
}

export async function intakeDiscoveredSource(store, input, { actor = "system" } = {}) {
  const source = normalizeDiscoveredSource(input);
  const records = await store.list();
  if (records.some((record) => record.baseUrl === source.baseUrl)) throw new Error(`Source already registered: ${source.baseUrl}`);
  return store.create(source, { actor });
}
