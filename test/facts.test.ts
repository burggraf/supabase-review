import { expect, test } from "bun:test";
import { renderFacts } from "../src/report/facts";
import type { Evidence } from "../src/types";

test("renders deterministic facts without advice or undefined values", async () => {
  const evidence = await Bun.file(new URL("./fixtures/evidence.json", import.meta.url)).json() as Evidence;
  const markdown = renderFacts(evidence);
  expect(markdown).toContain("Observed Facts");
  expect(markdown).toContain("2026-09-01T00:00:00.000Z");
  expect(markdown).toContain("Successful check (ok)");
  expect(markdown).toContain("| name | note |");
  expect(markdown).toContain("Failed check");
  expect(markdown).toContain("permission denied");
  expect(markdown).toContain("rows were truncated");
  expect(markdown).toContain("not remediation advice");
  expect(markdown).not.toContain("undefined");
  expect(markdown).not.toContain("postgres://");
});
