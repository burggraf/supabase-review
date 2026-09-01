import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunDirectory, normalizeJson, writeJsonAtomic, writeTextAtomic } from "../src/io";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("normalizes dates, bigints, arrays, and undefined values", () => {
  expect(normalizeJson({ date: new Date("2026-01-01T00:00:00Z"), count: 9007199254740993n, missing: undefined })).toEqual({
    date: "2026-01-01T00:00:00.000Z",
    count: "9007199254740993",
  });
});

test("writes JSON and text atomically", async () => {
  const base = await mkdtemp(join(tmpdir(), "supabase-review-"));
  temporaryDirectories.push(base);
  await writeJsonAtomic(join(base, "evidence.json"), { value: 1 });
  await writeTextAtomic(join(base, "facts.md"), "facts");
  expect(await Bun.file(join(base, "evidence.json")).json()).toEqual({ value: 1 });
  expect(await Bun.file(join(base, "facts.md")).text()).toBe("facts");
  expect(await Bun.file(join(base, "evidence.json.tmp")).exists()).toBe(false);
});

test("creates a unique safe run directory and refuses overwrite", async () => {
  const base = await mkdtemp(join(tmpdir(), "supabase-review-"));
  temporaryDirectories.push(base);
  const now = new Date("2026-09-01T12:34:56.000Z");
  const path = await createRunDirectory(base, "db:production", now);
  expect(path).not.toContain(":");
  expect(await Bun.file(path).exists()).toBe(false);
  await expect(createRunDirectory(base, "db:production", now)).rejects.toThrow();
});
