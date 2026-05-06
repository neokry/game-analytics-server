import { env } from "../env.js";

export function normalizeOrigin(origin: string | undefined | null): string | null {
  if (!origin) return null;

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return env.allowMissingOrigin;

  return allowedOrigins.some((allowedOrigin) => originMatches(origin, allowedOrigin));
}

function originMatches(origin: string, allowedOrigin: string): boolean {
  const normalizedAllowedOrigin = allowedOrigin.trim();
  if (!normalizedAllowedOrigin) return false;
  if (normalizedAllowedOrigin === "*") return true;

  const normalizedOrigin = normalizeOrigin(normalizedAllowedOrigin);
  if (normalizedOrigin && normalizedOrigin === origin) return true;

  if (normalizedAllowedOrigin.startsWith("https://*.")) {
    const suffix = normalizedAllowedOrigin.slice("https://*".length);
    return origin.startsWith("https://") && origin.endsWith(suffix);
  }

  if (normalizedAllowedOrigin.startsWith("http://*.")) {
    const suffix = normalizedAllowedOrigin.slice("http://*".length);
    return origin.startsWith("http://") && origin.endsWith(suffix);
  }

  return false;
}
