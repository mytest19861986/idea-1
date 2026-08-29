function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " is required");
  return value.trim();
}

export function createOpportunityReadClient({ fetchImpl, baseUrl = "" } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  async function get(path) {
    const response = await fetchImpl(baseUrl + path, { method: "GET", headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("read API request failed with " + response.status);
    return response.json();
  }
  return Object.freeze({
    list(query = "") { return get("/api/v1/opportunities" + query); },
    detail(slug) { return get("/api/v1/opportunities/" + encodeURIComponent(required(slug, "slug"))); }
  });
}
