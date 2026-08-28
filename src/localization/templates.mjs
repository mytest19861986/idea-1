const placeholderPattern = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isScalar(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function renderLocalizedTemplate(catalog, { locale, key, values = {} } = {}) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new TypeError("catalog must be an object");
  const localeKey = requiredString(locale, "locale");
  const messageKey = requiredString(key, "key");
  const messages = catalog[localeKey];
  if (!messages || typeof messages !== "object" || Array.isArray(messages)) throw new RangeError(`locale is not available: ${localeKey}`);
  const template = messages[messageKey];
  if (typeof template !== "string") throw new RangeError(`message is not available: ${messageKey}`);
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new TypeError("values must be an object");
  const placeholders = new Set([...template.matchAll(placeholderPattern)].map((match) => match[1]));
  for (const name of placeholders) {
    if (!Object.hasOwn(values, name) || !isScalar(values[name])) throw new TypeError(`value is required for placeholder: ${name}`);
  }
  for (const name of Object.keys(values)) {
    if (!placeholders.has(name)) throw new TypeError(`unexpected template value: ${name}`);
  }
  return template.replace(placeholderPattern, (_, name) => String(values[name]));
}
