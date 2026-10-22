import type { JsonRecord } from "./validation.js";

// EU members plus the rest of the EEA, where GDPR applies.
const EEA_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO"
]);

const ALWAYS_REDUCED_COUNTRIES = new Set([
  "AD",
  "CH",
  "GB",
  "GG",
  "IM",
  "JE",
  "MC",
  "SM",
  "VA"
]);

const SENSITIVE_PROPERTY_KEYS = new Set([
  "href",
  "message",
  "pageUrl",
  "query",
  "referrer",
  "source",
  "stack",
  "url"
]);

export type PrivacyMode = "standard" | "reduced";

// `country` is CloudFront's viewer country code. Requests that did not come through
// CloudFront (or that it could not place) have none and are treated as reduced.
export function privacyModeForCountry(country: string | null): PrivacyMode {
  if (!country) return "reduced";

  const code = country.toUpperCase();
  if (EEA_COUNTRIES.has(code) || ALWAYS_REDUCED_COUNTRIES.has(code)) return "reduced";

  return "standard";
}

export function stripUrlDetails(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function sanitizeReducedProperties(properties: JsonRecord): JsonRecord {
  return sanitizeRecord(properties);
}

function sanitizeRecord(record: JsonRecord): JsonRecord {
  const clean: JsonRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_PROPERTY_KEYS.has(key)) continue;

    clean[key] = sanitizeValue(value);
  }

  return clean;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 200);
  if (Array.isArray(value)) return value.map(sanitizeValue).slice(0, 20);

  if (value && typeof value === "object") {
    return sanitizeRecord(value as JsonRecord);
  }

  return value;
}
