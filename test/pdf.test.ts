import { expect, test } from "bun:test";
import { createPdfs } from "../src/report/pdf";

test("uses non-interactive npx md-to-pdf for both reports", async () => {
  const calls: string[][] = [];
  const result = await createPdfs("/tmp/reports", async (args, options) => { calls.push(args); expect(options.env.CI).toBe("1"); await Bun.write(`/tmp/reports/${args[2]!.replace(".md", ".pdf")}`, "pdf"); return 0; }, async () => true);
  expect(result).toContain("created");
  expect(calls).toEqual([["--yes", "md-to-pdf", "report.md"], ["--yes", "md-to-pdf", "executive-summary.md"]]);
});

test("explains when npx is unavailable", async () => {
  expect(await createPdfs("/tmp/reports", undefined, async () => false)).toContain("npx was not found");
});
