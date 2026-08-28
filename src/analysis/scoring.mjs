function normalizedMap(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  const entries = Object.entries(value);
  if (entries.length === 0) throw new TypeError(`${name} must not be empty`);
  return Object.fromEntries(entries.map(([key, number]) => {
    if (typeof key !== "string" || key.trim() === "") throw new TypeError(`${name} keys must be non-empty strings`);
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 100) {
      throw new TypeError(`${name}.${key} must be a finite number from 0 through 100`);
    }
    return [key, number];
  }));
}

export function scoreOpportunity(factors, weights) {
  const normalizedFactors = normalizedMap(factors, "factors");
  const normalizedWeights = normalizedMap(weights, "weights");
  const factorKeys = Object.keys(normalizedFactors).sort();
  const weightKeys = Object.keys(normalizedWeights).sort();
  if (factorKeys.join("\u0000") !== weightKeys.join("\u0000")) throw new TypeError("factors and weights must have identical keys");
  const totalWeight = Object.values(normalizedWeights).reduce((total, weight) => total + weight, 0);
  if (totalWeight !== 100) throw new TypeError("weights must total exactly 100");
  const contributions = Object.freeze(factorKeys.map((factor) => Object.freeze({
    factor,
    value: normalizedFactors[factor],
    weight: normalizedWeights[factor],
    contribution: Number(((normalizedFactors[factor] * normalizedWeights[factor]) / 100).toFixed(4))
  })));
  const score = Number(contributions.reduce((total, item) => total + item.contribution, 0).toFixed(4));
  return Object.freeze({ score, factors: Object.freeze(normalizedFactors), weights: Object.freeze(normalizedWeights), contributions });
}
