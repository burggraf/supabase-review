// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/traffic-profile/traffic-profile.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "traffic-profile",
  title: "Traffic profile",
  sql: " -- Query adapted from Crunchy Data blog: \"Is Postgres Read Heavy or Write Heavy? (And Why You Should Care)\" by David Christensen\nWITH\nratio_target AS (SELECT 5 AS ratio),\ntable_list AS (SELECT\n s.schemaname,\n s.relname AS table_name,\n si.heap_blks_read + si.idx_blks_read AS blocks_read,\ns.n_tup_ins + s.n_tup_upd + s.n_tup_del AS write_tuples,\nrelpages * (s.n_tup_ins + s.n_tup_upd + s.n_tup_del ) / (case when reltuples = 0 then 1 else reltuples end) as blocks_write\nFROM\n pg_stat_user_tables AS s\nJOIN pg_statio_user_tables AS si ON s.relid = si.relid\nJOIN pg_class c ON c.oid = s.relid\nWHERE\n(s.n_tup_ins + s.n_tup_upd + s.n_tup_del) > 0\nAND\n (si.heap_blks_read + si.idx_blks_read) > 0\n )\nSELECT\n  schemaname,\n  table_name,\n  blocks_read,\n  write_tuples,\n  blocks_write,\n  CASE\n    WHEN blocks_read = 0 and blocks_write = 0 THEN\n      'No Activity'\n    WHEN blocks_write * ratio > blocks_read THEN\n      CASE\n        WHEN blocks_read = 0 THEN 'Write-Only'\n        ELSE\n          ROUND(blocks_write :: numeric / blocks_read :: numeric, 1)::text || ':1 (Write-Heavy)'\n      END\n    WHEN blocks_read > blocks_write * ratio THEN\n      CASE\n        WHEN blocks_write = 0 THEN 'Read-Only'\n        ELSE\n          '1:' || ROUND(blocks_read::numeric / blocks_write :: numeric, 1)::text || ' (Read-Heavy)'\n      END\n    ELSE\n      '1:1 (Balanced)'\n  END AS activity_ratio\nFROM table_list, ratio_target\nORDER BY\n (blocks_read + blocks_write) DESC",
  expectedKeys: ["schemaname", "table_name", "blocks_read", "write_tuples", "blocks_write", "activity_ratio"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/traffic-profile/traffic-profile.query.ts",
};
