import { expect, test } from "bun:test";
import { buildReportPayload, REDACTION_WARNING } from "../src/report/payload";
import type { Evidence } from "../src/types";

test("bounds rows, records omissions, redacts, and preserves input", () => {
  const evidence = { database: { checks: [{ id: "x", title: "x", status: "ok", duration_ms: 1, row_count: 201, truncated: true, rows: Array.from({ length: 201 }, (_, i) => ({ value: `postgres://u:secret@host/${i}` })) }] }, logs: { status: "skipped", requested_days: 1, windows_queried: 0, rows_received: 0, truncated: false, slow_queries: [] }, warnings: [], schema_version: 1, run: { id: "x", tool_version: "x", started_at: "x", completed_at: "x", platform: "x", architecture: "x" } } as Evidence;
  const payload = buildReportPayload(evidence);
  const check = (payload.database as { checks: Array<{ rows: unknown[]; omitted_rows: number }> }).checks[0]!;
  expect(check.rows).toHaveLength(200);
  expect(check.omitted_rows).toBe(1);
  expect(JSON.stringify(payload)).not.toContain("secret");
  expect(JSON.stringify(payload)).toContain(REDACTION_WARNING);
  expect(evidence.database.checks[0]!.rows[0]!.value).toContain("secret");
});
