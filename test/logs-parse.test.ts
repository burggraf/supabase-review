import { expect, test } from "bun:test";
import { parseSlowLogs } from "../src/logs/parse";

test("parses, normalizes, groups, and tolerates slow logs", async () => {
  const rows = await Bun.file(new URL("./fixtures/logs.json", import.meta.url)).json();
  const result = parseSlowLogs(rows);
  expect(result.slowQueries).toHaveLength(2);
  expect(result.slowQueries[0]?.occurrences).toBe(2);
  expect(result.slowQueries[0]?.scan_types).toEqual(["Seq Scan", "Index Scan"]);
  expect(result.warnings.length).toBeGreaterThan(0);
});

test("retains data quality warnings instead of throwing", async () => {
  const rows = await Bun.file(new URL("./fixtures/logs-unparseable.json", import.meta.url)).json();
  const result = parseSlowLogs(rows);
  expect(result.slowQueries).toEqual([]);
  expect(result.warnings[0]).toContain("incomplete");
});
