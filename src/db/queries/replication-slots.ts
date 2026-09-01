// SQL snapshot from Supabase CLI commit 713129cc1cd27c1d9371554d870c2972914ab12b.
// Source: https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/replication-slots/replication-slots.query.ts
import type { QueryDefinition } from "../registry";
import { SCHEMA_PATTERNS } from "../schemas";

export const query: QueryDefinition = {
  id: "replication-slots",
  title: "Replication slots",
  sql: "SELECT\n  s.slot_name,\n  s.active,\n  COALESCE(r.state, 'N/A') as state,\n  CASE WHEN r.client_addr IS NULL\n    THEN 'N/A'\n    ELSE r.client_addr::text\n  END replication_client_address,\n  GREATEST(0, ROUND((redo_lsn-restart_lsn)/1024/1024/1024, 2)) as replication_lag_gb\nFROM pg_control_checkpoint(), pg_replication_slots s\nLEFT JOIN pg_stat_replication r ON (r.pid = s.active_pid)",
  expectedKeys: ["slot_name", "active", "state", "replication_client_address", "replication_lag_gb"],
  params: (context) => [],
  source: "https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db/replication-slots/replication-slots.query.ts",
};
