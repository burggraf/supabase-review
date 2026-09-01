// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/locks/locks.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "locks",
  title: "Locks",
  sql: "SELECT\n  pg_stat_activity.pid,\n  COALESCE(pg_class.relname, 'null') AS relname,\n  COALESCE(pg_locks.transactionid::text, 'null') AS transactionid,\n  pg_locks.granted,\n  pg_stat_activity.query AS stmt,\n  age(now(), pg_stat_activity.query_start)::text AS age\nFROM pg_stat_activity, pg_locks LEFT OUTER JOIN pg_class ON (pg_locks.relation = pg_class.oid)\nWHERE pg_stat_activity.query <> '<insufficient privilege>'\nAND pg_locks.pid = pg_stat_activity.pid\nAND pg_locks.mode = 'ExclusiveLock'\nORDER BY query_start",
  expectedKeys: ["pid", "relname", "transactionid", "granted", "stmt", "age"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/locks/locks.query.ts",
};
