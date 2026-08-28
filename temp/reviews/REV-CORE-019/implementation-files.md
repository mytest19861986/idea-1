# Implementation artifact

## `src/source-registry/coverage.mjs`

```js
export function findCoverageGaps(sources, requiredSegments) {
  if (!Array.isArray(sources) || !Array.isArray(requiredSegments)) throw new TypeError("sources and requiredSegments must be arrays");
  const covered = new Set(sources.filter((source) => source?.status === "ACTIVE").flatMap((source) => Array.isArray(source.segments) ? source.segments : []).filter((segment) => typeof segment === "string" && segment.trim()).map((segment) => segment.trim()));
  const requested = new Set(requiredSegments.map((segment) => typeof segment === "string" ? segment.trim() : "").filter(Boolean));
  return Object.freeze([...requested].filter((segment) => !covered.has(segment)).sort());
}
```
