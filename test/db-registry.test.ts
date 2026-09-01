import { expect, test } from "bun:test";
import { QUERY_REGISTRY } from "../src/db/registry";

const ids = ["db-stats", "replication-slots", "locks", "blocking", "outliers", "calls", "index-stats", "long-running-queries", "bloat", "role-stats", "vacuum-stats", "table-stats", "traffic-profile"];
const expected: Record<string, string[]> = {
  "db-stats": ["database_size", "total_index_size", "total_table_size", "total_toast_size", "time_since_stats_reset", "index_hit_rate", "table_hit_rate", "wal_size"],
  "replication-slots": ["slot_name", "active", "state", "replication_client_address", "replication_lag_gb"],
  locks: ["pid", "relname", "transactionid", "granted", "stmt", "age"], blocking: ["blocked_pid", "blocking_statement", "blocking_duration", "blocking_pid", "blocked_statement", "blocked_duration"],
  outliers: ["query", "total_exec_time", "prop_exec_time", "ncalls", "sync_io_time"], calls: ["query", "total_exec_time", "prop_exec_time", "ncalls", "sync_io_time"],
  "index-stats": ["name", "table", "columns", "size", "percent_used", "index_scans", "seq_scans", "unused"], "long-running-queries": ["pid", "duration", "query"], bloat: ["type", "name", "bloat", "waste"], "role-stats": ["role_name", "active_connections", "connection_limit", "custom_config"], "vacuum-stats": ["name", "last_vacuum", "last_autovacuum", "last_analyze", "last_autoanalyze", "rowcount", "dead_rowcount", "expect_autovacuum", "expect_autoanalyze"], "table-stats": ["name", "table_size", "index_size", "total_size", "estimated_row_count", "seq_scans"], "traffic-profile": ["schemaname", "table_name", "blocks_read", "write_tuples", "blocks_write", "activity_ratio"],
};

test("contains exactly the active checks in order", () => {
  expect(QUERY_REGISTRY.map((query) => query.id)).toEqual(ids);
  expect(new Set(ids).size).toBe(13);
});

test("queries are attributed, read-only, and expose expected keys", () => {
  for (const query of QUERY_REGISTRY) {
    expect(query.source).toContain("713129cc1cd27c1d9371554d870c2972914ab12b");
    const sql = query.sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(sql).toMatch(/^(SELECT|WITH)\b/i);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|COPY|CALL|DO)\b/i);
    expect(query.expectedKeys).toEqual(expected[query.id]);
  }
});
