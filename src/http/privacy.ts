import geoip from "geoip-lite";
import type { JsonRecord } from "../db/schema.js";

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

export function privacyModeForIp(ip: string | null): PrivacyMode {
  if (!ip) return "reduced";

  const geo = geoip.lookup(ip);
  if (!geo) return "reduced";

  if (geo.eu === "1") return "reduced";
  if (ALWAYS_REDUCED_COUNTRIES.has(geo.country)) return "reduced";

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
