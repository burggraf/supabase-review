// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/outliers/outliers.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "outliers",
  title: "Query outliers",
  sql: "SELECT\n  (interval '1 millisecond' * total_exec_time)::text AS total_exec_time,\n  to_char((total_exec_time/sum(total_exec_time) OVER()) * 100, 'FM90D0') || '%'  AS prop_exec_time,\n  to_char(calls, 'FM999G999G999G990') AS ncalls,\n  /*\n    Handle column names for 15 and 17\n  */\n  (\n    interval '1 millisecond' * (\n      COALESCE(\n        (to_jsonb(s) ->> 'shared_blk_read_time')::double precision,\n        (to_jsonb(s) ->> 'blk_read_time')::double precision,\n        0\n      )\n      +\n      COALESCE(\n        (to_jsonb(s) ->> 'shared_blk_write_time')::double precision,\n        (to_jsonb(s) ->> 'blk_write_time')::double precision,\n        0\n      )\n    )\n  )::text AS sync_io_time,\n  query\nFROM extensions.pg_stat_statements s WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user LIMIT 1)\nORDER BY total_exec_time DESC\nLIMIT 10",
  expectedKeys: ["query", "total_exec_time", "prop_exec_time", "ncalls", "sync_io_time"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/outliers/outliers.query.ts",
};
