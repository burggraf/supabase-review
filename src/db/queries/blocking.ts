// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/blocking/blocking.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "blocking",
  title: "Blocking queries",
  sql: "SELECT\n  bl.pid AS blocked_pid,\n  ka.query AS blocking_statement,\n  age(now(), ka.query_start)::text AS blocking_duration,\n  kl.pid AS blocking_pid,\n  a.query AS blocked_statement,\n  age(now(), a.query_start)::text AS blocked_duration\nFROM pg_catalog.pg_locks bl\nJOIN pg_catalog.pg_stat_activity a\n  ON bl.pid = a.pid\nJOIN pg_catalog.pg_locks kl\nJOIN pg_catalog.pg_stat_activity ka\n  ON kl.pid = ka.pid\n  ON bl.transactionid = kl.transactionid AND bl.pid != kl.pid\nWHERE NOT bl.granted",
  expectedKeys: ["blocked_pid", "blocking_statement", "blocking_duration", "blocking_pid", "blocked_statement", "blocked_duration"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/blocking/blocking.query.ts",
};
