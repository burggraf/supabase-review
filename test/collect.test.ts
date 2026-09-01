import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { collectChecks, MAX_ROWS, sanitizeDatabaseError } from "../src/db/collect";
import { collectEvidence } from "../src/collect";
import { postgresTextArray } from "../src/db/schemas";
import { parseCliArgs } from "../src/args";
import type { QueryDefinition } from "../src/db/registry";

const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const query = (id: string): QueryDefinition => ({ id, title: id, sql: "SELECT 1", expectedKeys: [], params: () => [], source: "source" });

test("runs checks serially and continues after failures", async () => {
  const calls: string[] = [];
  const checks = await collectChecks(async (definition) => {
    calls.push(definition.id);
    if (definition.id === "bad") throw Object.assign(new Error("permission denied"), { code: "42501", hint: "grant access" });
    return [{ id: definition.id }];
  }, [query("first"), query("bad"), query("last")]);
  expect(calls).toEqual(["first", "bad", "last"]);
  expect(checks.map((check) => check.status)).toEqual(["ok", "error", "ok"]);
  expect(checks[1]?.error).toEqual({ code: "42501", message: "permission denied", hint: "grant access" });
});

test("caps retained rows and marks truncation", async () => {
  const checks = await collectChecks(async () => Array.from({ length: MAX_ROWS + 1 }, (_, id) => ({ id })));
  expect(checks[0]?.rows).toHaveLength(MAX_ROWS);
  expect(checks[0]?.row_count).toBe(MAX_ROWS + 1);
  expect(checks[0]?.truncated).toBe(true);
});

test("formats schema patterns as a PostgreSQL array literal", () => {
  expect(postgresTextArray(["a_b", "pg_*"])).toBe('{"a_b","pg_*"}');
});

test("detects and sanitizes failures without leaking URLs", () => {
  const error = sanitizeDatabaseError(new Error("failed postgres://user:secret@example.test/db"));
  expect(error.message).not.toContain("secret");
});

test("writes evidence and facts even when optional logs fail", async () => {
  const base = await mkdtemp(join(process.cwd(), "collect-test-"));
  await rm(base, { recursive: true, force: true });
  temporaryDirectories.push(base);
  const result = await collectEvidence(parseCliArgs(["collect", "--with-logs", "--output", base]), { databaseUrl: "postgres://local", projectRef: "project", accessToken: "token" }, {
    database: async () => ({ checks: [{ id: "one", title: "One", status: "ok", duration_ms: 1, row_count: 0, truncated: false, rows: [] }], allFailed: false }),
    logs: async () => { throw new Error("temporary outage"); },
    now: (() => { const dates = [new Date("2026-09-01T00:00:00Z"), new Date("2026-09-01T00:01:00Z")]; return () => dates.shift() ?? new Date("2026-09-01T00:01:00Z"); })(),
  });
  expect(result.exitCode).toBe(0);
  expect(result.evidence.logs.status).toBe("error");
  expect(await Bun.file(join(base, "evidence.json")).exists()).toBe(true);
  expect(await Bun.file(join(base, "facts.md")).exists()).toBe(true);
});
