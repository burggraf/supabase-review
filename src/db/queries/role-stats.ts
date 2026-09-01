// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/role-stats/role-stats.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "role-stats",
  title: "Role statistics",
  sql: "SELECT\n  rolname as role_name,\n  (\n    SELECT\n      count(*)\n    FROM\n      pg_stat_activity\n    WHERE\n      pg_roles.rolname = pg_stat_activity.usename\n  ) AS active_connections,\n  CASE WHEN rolconnlimit = -1\n    THEN current_setting('max_connections')::int8\n    ELSE rolconnlimit\n  END AS connection_limit,\n  array_to_string(rolconfig, ',', '*') as custom_config\nFROM\n  pg_roles\nORDER BY 1 DESC",
  expectedKeys: ["role_name", "active_connections", "connection_limit", "custom_config"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/role-stats/role-stats.query.ts",
};
