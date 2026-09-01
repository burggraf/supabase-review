// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/table-stats/table-stats.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "table-stats",
  title: "Table statistics",
  sql: "SELECT\n  ts.name,\n  pg_size_pretty(ts.table_size_bytes) AS table_size,\n  pg_size_pretty(ts.index_size_bytes) AS index_size,\n  pg_size_pretty(ts.total_size_bytes) AS total_size,\n  COALESCE(rc.estimated_row_count, 0) AS estimated_row_count,\n  COALESCE(rc.seq_scans, 0) AS seq_scans\nFROM (\n  SELECT\n    FORMAT('%I.%I', n.nspname, c.relname) AS name,\n    pg_table_size(c.oid) AS table_size_bytes,\n    pg_indexes_size(c.oid) AS index_size_bytes,\n    pg_total_relation_size(c.oid) AS total_size_bytes\n  FROM pg_class c\n  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace\n  WHERE NOT n.nspname LIKE ANY($1::text[])\n    AND c.relkind = 'r'\n) ts\nLEFT JOIN (\n  SELECT\n    FORMAT('%I.%I', schemaname, relname) AS name,\n    n_live_tup AS estimated_row_count,\n    seq_scan AS seq_scans\n  FROM pg_stat_user_tables\n  WHERE NOT schemaname LIKE ANY($1::text[])\n) rc ON rc.name = ts.name\nORDER BY ts.total_size_bytes DESC",
  expectedKeys: ["name", "table_size", "index_size", "total_size", "estimated_row_count", "seq_scans"],
  params: (context) => [SCHEMA_PATTERNS],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/table-stats/table-stats.query.ts",
};
