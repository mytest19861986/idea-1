# Relevant tests

```js
test("coverage gaps report missing active-source segments without changing sources", () => {
  const sources = [{ status: "ACTIVE", segments: ["saudi-b2b"] }, { status: "CANDIDATE", segments: ["sea-consumer"] }];
  const gaps = findCoverageGaps(sources, ["saudi-b2b", "sea-consumer", " eu-saas ", "", "eu-saas"]);
  assert.deepEqual(gaps, ["eu-saas", "sea-consumer"]);
  assert.equal(Object.isFrozen(gaps), true);
  assert.throws(() => findCoverageGaps({}, []), /arrays/);
});
```
