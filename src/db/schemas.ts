const INTERNAL_SCHEMAS = [
  "information_schema", "pg_*", "_analytics", "_realtime", "_supavisor", "auth", "etl", "extensions", "pgbouncer", "realtime", "storage", "supabase_functions", "supabase_migrations", "cron", "dbdev", "graphql", "graphql_public", "net", "pgmq", "pgsodium", "pgsodium_masks", "pgtle", "repack", "tiger", "tiger_data", "timescaledb_*", "_timescaledb_*", "topology", "vault",
] as const;

// LIKE ANY patterns: underscores are escaped and stars become PostgreSQL wildcards.
export const SCHEMA_PATTERNS = INTERNAL_SCHEMAS.map((pattern) => pattern.replaceAll("_", "\\_").replaceAll("*", "%"));

export function postgresTextArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}
