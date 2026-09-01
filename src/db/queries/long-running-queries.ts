// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/long-running-queries/long-running-queries.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "long-running-queries",
  title: "Long-running queries",
  sql: "SELECT\n  pid,\n  age(now(), pg_stat_activity.query_start)::text AS duration,\n  query AS query\nFROM\n  pg_stat_activity\nWHERE\n  pg_stat_activity.query <> ''::text\n  AND state <> 'idle'\n  AND age(now(), pg_stat_activity.query_start) > interval '5 minutes'\nORDER BY\n  age(now(), pg_stat_activity.query_start) DESC",
  expectedKeys: ["pid", "duration", "query"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/long-running-queries/long-running-queries.query.ts",
};
