import { expect, test } from "bun:test";
import { collectDatabase } from "../src/db/client";

test.if(!!process.env.TEST_DATABASE_URL)("collects checks from a disposable database", async () => {
  const result = await collectDatabase(process.env.TEST_DATABASE_URL!);
  expect(result.checks).toHaveLength(13);
  expect(result.checks.some((check) => check.status === "ok")).toBe(true);
});
