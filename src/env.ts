import "dotenv/config";

function optionalNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric env value, received ${value}`);
  }

  return parsed;
}

function optionalBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: optionalNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  allowMissingOrigin: optionalBoolean(
    process.env.ALLOW_MISSING_ORIGIN,
    (process.env.NODE_ENV ?? "development") !== "production"
  ),
  ipHashSalt: process.env.IP_HASH_SALT
};

export function requireDatabaseUrl(): string {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return env.databaseUrl;
}
